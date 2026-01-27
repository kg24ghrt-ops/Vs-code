/* extension.js — Remote Runner Pro (fixed: per-run branches + push trigger + robustness) */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let isRunning = false;
let currentPoller = null;
let writeEmitter = new vscode.EventEmitter();
let remoteTerminal = null;
let inputBuffer = "";
const outputChannel = vscode.window.createOutputChannel("Remote Runner Pro");

const COLORS = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", cyan: "\x1b[36m", bold: "\x1b[1m" };

// small helper: run command and return stdout string (throws on failure)
function run(cmd, opts = {}) {
  return execSync(cmd, Object.assign({ stdio: ['pipe','pipe','pipe'] }, opts)).toString();
}

// safe helper: try to run cmd, return null on failure (doesn't throw)
function tryRun(cmd, opts = {}) {
  try { return run(cmd, opts); } catch (e) { return null; }
}

function debugLog(enabled, ...args) {
  if (!enabled) return;
  try { outputChannel.appendLine('[debug] ' + args.join(' ')); } catch (e) {}
}

function activate(context) {
  const getSettings = () => vscode.workspace.getConfiguration('remoteRunner');
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'remote-runner.run';
  statusBar.text = `$(play) Run Remote`;
  statusBar.show();

  function getActiveBranch(root) {
    try { return run('git rev-parse --abbrev-ref HEAD', { cwd: root }).trim(); }
    catch (e) { return 'main'; }
  }

  function cleanupOldFiles(root) {
    ['input','logs'].forEach(folder => {
      const dir = path.join(root, folder);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const files = fs.readdirSync(dir)
        .filter(f => f.includes('_'))
        .map(f => {
          try { return { name: f, mtime: fs.statSync(path.join(dir, f)).mtime.getTime() }; }
          catch { return { name: f, mtime: 0 }; }
        })
        .sort((a,b) => a.mtime - b.mtime)
        .map(x => x.name);
      if (files.length > 10) {
        const toRemove = files.slice(0, files.length - 10);
        toRemove.forEach(f => { try { fs.unlinkSync(path.join(dir,f)); } catch(e) {} });
      }
    });
  }

  const setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;

    const lang = await vscode.window.showQuickPick(['Python','Java'], { placeHolder: 'Target Language', ignoreFocusOut: true });
    if (!lang) return;

    const repoUrl = await vscode.window.showInputBox({ prompt: "Paste HTTPS or SSH Repo URL", ignoreFocusOut: true });
    if (!repoUrl) return vscode.window.showErrorMessage("Valid repo URL required.");

    const token = await vscode.window.showInputBox({ prompt: "Paste GitHub Token (repo, workflow)", password: true, ignoreFocusOut: true });
    if (!token) return vscode.window.showErrorMessage("Token required.");

    await context.secrets.store('gh_token', token.trim());
    const branch = getActiveBranch(root);

    try {
      if (!fs.existsSync(path.join(root,'.git'))) run(`git init -b ${branch}`, { cwd: root });
      try { run(`git remote add origin ${repoUrl}`, { cwd: root }); }
      catch (e) { run(`git remote set-url origin ${repoUrl}`, { cwd: root }); }

      ['src','input','logs','.github/workflows'].forEach(d => fs.mkdirSync(path.join(root,d), { recursive: true }));

      // Write workflows that trigger on push to runs/** and also accept workflow_dispatch
      fs.writeFileSync(path.join(root,'.github','workflows','python.yml'), pythonWorkflow());
      fs.writeFileSync(path.join(root,'.github','workflows','java.yml'), javaWorkflow());

      vscode.window.showInformationMessage(`✅ Setup complete on branch: ${branch}. Note: push the new workflow files to the remote repo so Actions can run.`);
      // optional: ask to push the workflow files now (left manual for safety)
    } catch (e) {
      vscode.window.showErrorMessage(`Setup Failed: ${e.message || String(e)}`);
    }
  });

  const runCmd = vscode.commands.registerCommand('remote-runner.run', async () => {
    if (isRunning) return;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return vscode.window.showErrorMessage('Open a workspace folder first.');

    const cfg = getSettings();
    const debug = !!cfg.get('debug', false);

    const token = await context.secrets.get('gh_token');
    if (!token) return vscode.window.showErrorMessage('Run Setup first and store a GitHub token via Setup.');

    const activeLang = fs.existsSync(path.join(root,'src/main.py')) ? 'Python' :
                       fs.existsSync(path.join(root,'src/Main.java')) ? 'Java' : null;
    if (!activeLang) return vscode.window.showErrorMessage('Missing src/main.py or src/Main.java');

    isRunning = true;
    statusBar.text = `$(sync~spin) Running...`;
    cleanupOldFiles(root);

    const startTime = Date.now();
    let fetchErrors = 0, lastLen = 0;
    const runId = Date.now().toString();
    const studentName = cfg.get('studentName', 'student1');
    const runBranch = `runs/${studentName}/${runId}`;
    const inputPath = path.join(root, 'input', `input_${runId}.txt`);
    fs.writeFileSync(inputPath, "");
    fs.writeFileSync(path.join(root, 'input', `run_${runId}.json`), JSON.stringify({ runId, studentName }));

    let originalBranch = null;
    try {
      // ensure origin exists and capture current branch
      const rawUrl = tryRun('git remote get-url origin', { cwd: root });
      if (!rawUrl) throw new Error('No git origin remote configured. Run Setup and set a repo remote first.');
      debugLog(debug, 'origin url:', rawUrl.trim());

      originalBranch = tryRun('git rev-parse --abbrev-ref HEAD', { cwd: root })?.trim() || 'main';
      debugLog(debug, 'originalBranch:', originalBranch);

      // prepare auth URL and temporary remote name (do NOT leave remote)
      let httpsUrl = rawUrl.startsWith('git@') ? rawUrl.replace(/^git@([^:]+):/, 'https://$1/') : rawUrl.trim();
      if (!httpsUrl.startsWith('https://')) throw new Error('Remote origin must be HTTPS or SSH pointing to a supported host.');
      const authUrl = httpsUrl.replace(/^https:\/\//, `https://${encodeURIComponent(token)}@`);
      debugLog(debug, 'authUrl constructed');

      // create/reset run branch locally (safe)
      try { run(`git checkout -B ${runBranch}`, { cwd: root }); } catch(e) { /* fallback handled below */ }
      debugLog(debug, `checked out ${runBranch}`);

      // commit run inputs (don't fail if nothing to add)
      try { run('git add input/ src/ || true', { cwd: root }); } catch(e) {}
      try { run(`git commit --allow-empty -m "Run ${runId} by ${studentName}"`, { cwd: root }); } catch(e) {}

      // push this branch using temporary remote (token embedded). ensure we remove the remote in finally
      const tmpRemote = 'tmp-auth';
      try {
        try { run(`git remote remove ${tmpRemote}`, { cwd: root }); } catch (_) {}
        run(`git remote add ${tmpRemote} ${authUrl}`, { cwd: root });
      } catch (e) {
        throw new Error('Failed to add temporary remote for authenticated push: ' + (e.message || String(e)));
      }

      try {
        // push run branch (HEAD -> runs/...)
        run(`git push ${tmpRemote} HEAD:${runBranch}`, { cwd: root });
        debugLog(debug, 'pushed run branch:', runBranch);
      } finally {
        try { run(`git remote remove ${tmpRemote}`, { cwd: root }); } catch (e) { debugLog(debug, 'failed to remove tmp remote', e.message || String(e)); }
      }

      // restore the user's original branch locally for workspace sanity
      try { run(`git checkout ${originalBranch}`, { cwd: root }); } catch (e) { debugLog(debug, 'restore branch failed', e.message || String(e)); }

      // open terminal UI to stream logs
      if (!remoteTerminal) {
        remoteTerminal = vscode.window.createTerminal({
          name: "Remote Runner Terminal",
          pty: {
            onDidWrite: writeEmitter.event,
            open: () => writeEmitter.fire(`${COLORS.cyan}--- Connected ---\r\n> `),
            handleInput: data => {
              if (data === '\r' || data === '\n') {
                fs.appendFileSync(inputPath, inputBuffer + '\n');
                inputBuffer = "";
                writeEmitter.fire('\r\n> ');
              } else if (data === '\x7f') {
                if (inputBuffer.length > 0) { inputBuffer = inputBuffer.slice(0, -1); writeEmitter.fire('\b \b'); }
              } else { inputBuffer += data; writeEmitter.fire(data); }
            },
            close: () => { isRunning = false; }
          }
        });
      }
      remoteTerminal.show();

      // IMPORTANT: workflows written by setup are triggered on push to runs/** (and accept workflow_dispatch).
      // The push above should have fired the workflow. Now poll logs branch for output_<runId>.txt
      const pollInterval = Math.max(500, Math.min(10000, cfg.get('pollInterval', 2000)));
      currentPoller = setInterval(() => {
        const timeoutLimit = cfg.get('timeout', 180000);
        if (Date.now() - startTime > timeoutLimit) return finishJob("TIMEOUT", COLORS.red, runId);

        try {
          // fetch remote logs branch into local logs ref (force)
          tryRun('git fetch origin logs:logs --force', { cwd: root });

          let out = null;
          try { out = run(`git show logs:logs/output_${runId}.txt`, { cwd: root }); } catch (e) { out = null; }

          if (!out) return; // file not yet present
          if (out.length > lastLen) {
            const chunk = out.substring(lastLen);
            writeEmitter.fire(chunk.replace(/\n/g, '\r\n'));
            lastLen = out.length;
          }

          if (out.includes('--- FINISHED ---')) return finishJob("Success", COLORS.green, runId);
          if (out.includes('--- EXECUTION FAILED ---')) return finishJob("Failed", COLORS.red, runId);
        } catch (e) {
          debugLog(debug, 'poll error', e.message || String(e));
          if (++fetchErrors > 30) return finishJob("Network Loss", COLORS.red, runId);
        }
      }, pollInterval);

    } catch (err) {
      finishJob((err && err.message) ? err.message : String(err), COLORS.red, runId);
    }

    // finishJob cleans up poller and leaves workspace in original branch
    function finishJob(msg, color, id) {
      if (currentPoller) { clearInterval(currentPoller); currentPoller = null; }
      isRunning = false;
      statusBar.text = `$(play) Run Remote`;
      inputBuffer = "";
      writeEmitter.fire(`\r\n${color}${COLORS.bold}>>> JOB ${msg.toUpperCase()}${COLORS.reset}\r\n> `);
      if (msg === "Success") vscode.window.showInformationMessage(`Run ${id}: Success`);
      else vscode.window.showErrorMessage(`Run ${id}: ${msg}`);
      // best-effort local cleanup: delete local run branch if it exists
      try {
        if (originalBranch) run(`git checkout ${originalBranch}`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
        run(`git branch --delete ${runBranch}`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
      } catch (e) { debugLog(cfg.get('debug', false), 'local cleanup error', e.message || String(e)); }
    }
  });

  context.subscriptions.push(setupCmd, runCmd, statusBar);
}

// --- WORKFLOW TEMPLATES ---
// Now trigger on push to runs/** as well as workflow_dispatch (push is required so the extension's push triggers the job).

const pythonWorkflow = () => `name: Remote Run - Python
on:
  push:
    branches:
      - 'runs/**'
  workflow_dispatch: {}
jobs:
  execute:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Run
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p logs
          ID_FILE=$(ls -t input/run_*.json 2>/dev/null | head -n 1 || true)
          if [ -z "$ID_FILE" ]; then echo "No run_*.json found" > logs/output_unknown.txt; exit 0; fi
          ID=$(basename "$ID_FILE" | cut -d'_' -f2 | cut -d'.' -f1)
          if [ -f input/input_$ID.txt ]; then python3 src/main.py < input/input_$ID.txt > logs/output_$ID.txt 2>&1 || echo '--- EXECUTION FAILED ---' >> logs/output_$ID.txt; else echo "No input file" > logs/output_$ID.txt; fi
          echo '--- FINISHED ---' >> logs/output_$ID.txt
      - name: Push logs
        shell: bash
        run: |
          git config user.name "runner"
          git config user.email "runner@local"
          git checkout --orphan tmp-logs
          git rm -rf . || true
          git add logs/ || true
          git commit -m "Logs for run $ID" || true
          git push origin HEAD:logs --force`;

const javaWorkflow = () => `name: Remote Run - Java
on:
  push:
    branches:
      - 'runs/**'
  workflow_dispatch: {}
jobs:
  execute:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Run
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p logs
          ID_FILE=$(ls -t input/run_*.json 2>/dev/null | head -n 1 || true)
          if [ -z "$ID_FILE" ]; then echo "No run_*.json found" > logs/output_unknown.txt; exit 0; fi
          ID=$(basename "$ID_FILE" | cut -d'_' -f2 | cut -d'.' -f1)
          if [ -f input/input_$ID.txt ]; then javac src/Main.java; java -cp src Main < input/input_$ID.txt > logs/output_$ID.txt 2>&1 || echo '--- EXECUTION FAILED ---' >> logs/output_$ID.txt; else echo "No input file" > logs/output_$ID.txt; fi
          echo '--- FINISHED ---' >> logs/output_$ID.txt
      - name: Push logs
        shell: bash
        run: |
          git config user.name "runner"
          git config user.email "runner@local"
          git checkout --orphan tmp-logs
          git rm -rf . || true
          git add logs/ || true
          git commit -m "Logs for run $ID" || true
          git push origin HEAD:logs --force`;

exports.activate = activate;