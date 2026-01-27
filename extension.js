/* extension.js - Remote Runner Pro (v3 real-time log streaming with optional gh) */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let isRunning = false;
let currentPoller = null;
let ghPoller = null;
let writeEmitter = new vscode.EventEmitter();
let remoteTerminal = null;
let inputBuffer = "";
let webviewPanel = null;
const outputChannel = vscode.window.createOutputChannel("Remote Runner Pro");

const COLORS = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", cyan: "\x1b[36m", bold: "\x1b[1m" };

// small helper
function execSafe(cmd, opts = {}) {
  return execSync(cmd, Object.assign({ stdio: ['pipe','pipe','pipe'] }, opts)).toString();
}

// parse remote URL into owner/repo
function parseRepoFromRemote(remoteUrl) {
  if (!remoteUrl) return null;
  // convert ssh style to https
  let u = remoteUrl.trim();
  if (u.startsWith('git@')) {
    // git@github.com:owner/repo.git
    u = u.replace(/^git@([^:]+):/, 'https://$1/');
  }
  // remove protocol
  if (u.startsWith('https://') || u.startsWith('http://')) {
    // https://github.com/owner/repo.git
    // strip .git and hostname
    const parts = u.replace(/^https?:\/\//, '').split('/');
    if (parts.length >= 3) {
      const owner = parts[1];
      const repo = parts[2].replace(/\.git$/, '');
      return { owner, repo, host: parts[0] };
    }
  }
  return null;
}

// check if gh exists
function isGhAvailable() {
  try {
    execSafe('gh --version', { timeout: 2000 });
    return true;
  } catch (e) {
    return false;
  }
}

// Attempt to install gh (only if user allowed). This is best-effort and logs output.
// We do NOT force install without explicit user consent.
function tryInstallGh(outputChannel) {
  const platform = process.platform; // win32, darwin, linux
  outputChannel.appendLine('[auto-install] Attempting to install gh (best-effort).');
  try {
    if (platform === 'darwin') {
      outputChannel.appendLine('[auto-install] running: brew install gh');
      execSafe('brew install gh', { timeout: 120000 });
    } else if (platform === 'linux') {
      // best-effort: try apt first, then snap, then fallback message
      try {
        outputChannel.appendLine('[auto-install] running: sudo apt-get update && sudo apt-get install -y gh');
        execSafe('sudo apt-get update && sudo apt-get install -y gh', { timeout: 180000 });
      } catch (e) {
        // fallback attempt using the official apt packaging steps would be more complex;
        outputChannel.appendLine('[auto-install] apt install failed or not available. Please install gh manually: https://cli.github.com/');
        throw e;
      }
    } else if (platform === 'win32') {
      // try choco; may fail if choco not present
      outputChannel.appendLine('[auto-install] running: choco install gh -y');
      execSafe('choco install gh -y', { timeout: 120000 });
    } else {
      outputChannel.appendLine('[auto-install] unsupported platform for automated install. Please install gh manually: https://cli.github.com/');
    }
  } catch (e) {
    outputChannel.appendLine(`[auto-install] Installation attempt failed: ${e.message || String(e)}. Please install gh manually: https://cli.github.com/`);
  }
}

// Stream logs in near-real-time using gh if available.
// owner/repo from parseRepoFromRemote, runId string, interval ms, panel optional to send messages
function streamLogsWithGh(owner, repo, runId, intervalMs, panel) {
  if (!owner || !repo) return null;
  let lastLen = 0;
  const pathOnRepo = `logs/output_${runId}.txt`;
  const apiEndpoint = `/repos/${owner}/${repo}/contents/${encodeURIComponent(pathOnRepo)}`; 
  // the command we use: gh api -H "Accept: application/vnd.github.raw" /repos/owner/repo/contents/logs/output_<id>.txt
  const cmdBase = (ep) => `gh api -H "Accept: application/vnd.github.raw" \"${ep}\"`;
  ghPoller = setInterval(() => {
    try {
      const out = execSafe(cmdBase(apiEndpoint), { timeout: 7000 });
      if (!out) return;
      if (out.length > lastLen) {
        const newChunk = out.substring(lastLen);
        writeEmitter.fire(newChunk.replace(/\n/g, '\r\n'));
        if (panel) panel.webview.postMessage({ type: 'stdout', data: newChunk });
        lastLen = out.length;
      }
      if (out.includes('--- FINISHED ---')) {
        clearInterval(ghPoller);
        ghPoller = null;
      }
    } catch (e) {
      // Common reasons: file not created yet (404), network or auth issue.
      // For 404 the gh api command exits non-zero and we simply ignore until file is present.
      const msg = (e && e.message) ? e.message : String(e);
      // If it's an auth issue or other error, show in outputChannel but don't spam user
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('404')) {
        // nothing yet
        return;
      } else {
        outputChannel.appendLine(`[gh stream] error: ${msg}`);
      }
    }
  }, intervalMs);
  return ghPoller;
}

// Optionally delete a remote run branch by using gh api
function ghDeleteRunBranch(owner, repo, runBranchRef) {
  try {
    // The endpoint for deleting a ref: DELETE /repos/{owner}/{repo}/git/refs/{ref}
    // ref must be URL-encoded and should NOT include 'heads/', per API docs the path is git/refs/heads/{branch}
    const refPath = `git/refs/heads/${runBranchRef}`;
    const cmd = `gh api -X DELETE "/repos/${owner}/${repo}/${refPath}"`;
    execSafe(cmd, { timeout: 7000 });
    outputChannel.appendLine(`[gh cleanup] deleted remote ref: ${runBranchRef}`);
    return true;
  } catch (e) {
    outputChannel.appendLine(`[gh cleanup] failed to delete remote ref ${runBranchRef}: ${e.message || String(e)}`);
    return false;
  }
}

function activate(context) {
  const settings = () => vscode.workspace.getConfiguration('remoteRunner');
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'remote-runner.run';
  statusBar.text = `$(play) Run Remote`;
  statusBar.show();

  const getActiveBranch = (root) => {
    try { return execSafe('git rev-parse --abbrev-ref HEAD', { cwd: root }).trim(); }
    catch (e) { return 'main'; }
  };

  const cleanupOldFiles = (root) => {
    ['input', 'logs'].forEach(folder => {
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
        toRemove.forEach(f => {
          try { fs.unlinkSync(path.join(dir, f)); } catch(e) {}
        });
      }
    });
  };

  // Terminal WebView creation (same as before)
  function openWebTerminal(context) {
    if (webviewPanel) { webviewPanel.reveal(vscode.ViewColumn.One); return webviewPanel; }
    webviewPanel = vscode.window.createWebviewPanel('remoteRunnerTerminal', 'Remote Runner Terminal', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    webviewPanel.webview.html = getTerminalWebviewHtml(webviewPanel.webview);
    webviewPanel.onDidDispose(() => { webviewPanel = null; });
    webviewPanel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'stdin') {
        inputBuffer += msg.data;
        writeEmitter.fire(msg.data);
      }
    });
    return webviewPanel;
  }

  function getTerminalWebviewHtml(webview) {
    const xtermJs = 'https://cdn.jsdelivr.net/npm/xterm@5.5.0/lib/xterm.js';
    const xtermCss = 'https://cdn.jsdelivr.net/npm/xterm@5.5.0/css/xterm.css';
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https:; script-src ${webview.cspSource} https:; connect-src https: ws:;">
<link rel="stylesheet" href="${xtermCss}" />
<style>body{margin:0;height:100vh;background:#1e1e1e;color:#eee}#terminal{width:100%;height:100vh;padding:8px;box-sizing:border-box}</style>
</head>
<body>
<div id="terminal"></div>
<script src="${xtermJs}"></script>
<script>
  const vscode = acquireVsCodeApi();
  const term = new Terminal();
  term.open(document.getElementById('terminal'));
  term.write('\\x1b[1;32mRemote Runner Ready\\x1b[0m\\r\\n> ');
  let buffer = '';
  term.onKey(e => {
    const dom = e.domEvent;
    if (dom.key === 'Enter') {
      vscode.postMessage({ type:'stdin', data: buffer + '\\n' });
      buffer = '';
      term.write('\\r\\n> ');
    } else if (dom.key === 'Backspace') {
      if (buffer.length > 0) { buffer = buffer.slice(0, -1); term.write('\\b \\b'); }
    } else if (!dom.ctrlKey && dom.key.length === 1) {
      buffer += dom.key; term.write(dom.key);
    }
  });
  window.addEventListener('message', event => {
    const m = event.data;
    if (m.type === 'stdout') term.write(m.data.replace(/\\n/g,'\\r\\n'));
  });
</script>
</body>
</html>`;
  }

  let setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    const lang = await vscode.window.showQuickPick(['Python', 'Java'], { placeHolder: 'Target Language', ignoreFocusOut: true });
    if (!lang) return;
    const repoUrl = await vscode.window.showInputBox({ prompt: "Paste HTTPS or SSH Repo URL", ignoreFocusOut: true });
    if (!repoUrl) return vscode.window.showErrorMessage("Valid repo URL required.");
    const token = await vscode.window.showInputBox({ prompt: "Paste Token (Scopes: repo, workflow)", password: true, ignoreFocusOut: true });
    if (!token) return;
    await context.secrets.store('gh_token', token.trim());

    try {
      const branch = getActiveBranch(root);
      if (!fs.existsSync(path.join(root, '.git'))) execSync(`git init -b ${branch}`, { cwd: root });
      try { execSync(`git remote add origin ${repoUrl.trim()}`, { cwd: root }); }
      catch (e) { execSync(`git remote set-url origin ${repoUrl.trim()}`, { cwd: root }); }
      ['src','input','logs','.github/workflows'].forEach(d => fs.mkdirSync(path.join(root,d), { recursive: true }));
      fs.writeFileSync(path.join(root,'.github','workflows','main.yml'), lang === 'Python' ? pythonWorkflow() : javaWorkflow());
      vscode.window.showInformationMessage(`✅ Configured workflows (runs/**)`);
    } catch (e) { vscode.window.showErrorMessage(`Setup Failed: ${e.message}`); }
  });

  // NEW: Command to attempt installing GH (user-triggered)
  let installGhCmd = vscode.commands.registerCommand('remote-runner.installGh', async () => {
    const want = await vscode.window.showInformationMessage('Remote Runner can try to install the GitHub CLI (gh) to enable live log streaming. Proceed?', { modal: true }, 'Yes', 'No');
    if (want !== 'Yes') return vscode.window.showInformationMessage('Install cancelled.');
    outputChannel.show(true);
    tryInstallGh(outputChannel);
    if (isGhAvailable()) vscode.window.showInformationMessage('gh is now available.');
    else vscode.window.showErrorMessage('gh not installed. Please install manually: https://cli.github.com/');
  });

  let runCmd = vscode.commands.registerCommand('remote-runner.run', async () => {
    if (isRunning) return;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const token = await context.secrets.get('gh_token');
    if (!token || !root) return vscode.window.showErrorMessage("Run Setup first (store a token via Setup).");

    const activeLang = fs.existsSync(path.join(root, 'src/main.py')) ? 'Python' :
                       fs.existsSync(path.join(root, 'src/Main.java')) ? 'Java' : null;
    if (!activeLang) return vscode.window.showErrorMessage("Missing src/main.py or src/Main.java");

    isRunning = true;
    statusBar.text = `$(sync~spin) Running...`;
    cleanupOldFiles(root);

    const studentName = vscode.workspace.getConfiguration('remoteRunner').get('studentName', 'student1');

    let startTime = Date.now();
    let fetchErrors = 0, lastLen = 0;
    const runId = Date.now().toString();
    const runBranchRef = `runs/run-${runId}`;
    const inputPath = path.join(root, 'input', `input_${runId}.txt`);
    fs.writeFileSync(inputPath, "");
    fs.writeFileSync(path.join(root, 'input', `run_${runId}.json`), JSON.stringify({ runId, studentName }));

    try {
      const rawUrl = execSafe('git remote get-url origin', { cwd: root }).trim();
      const repoInfo = parseRepoFromRemote(rawUrl);
      if (!repoInfo) throw new Error('Unable to parse repository owner/repo from remote URL.');

      const safeToken = encodeURIComponent(token);
      // build auth URL (temporary remote)
      let httpsUrl = rawUrl;
      if (rawUrl.startsWith('git@')) httpsUrl = rawUrl.replace(/^git@([^:]+):/, 'https://$1/');
      const authUrl = httpsUrl.replace(/^https:\/\//, `https://${safeToken}@`);

      // create local run branch and commit run files
      execSync(`git checkout -b ${runBranchRef}`, { cwd: root });
      try { execSync(`git add input/`, { cwd: root }); } catch(e) {}
      try { execSync(`git commit --allow-empty -m "Run ${runId} by ${studentName}"`, { cwd: root }); } catch(e) {}

      // push run branch using a temporary remote
      const tmpRemote = 'tmp-auth';
      try { execSync(`git remote remove ${tmpRemote}`, { cwd: root, stdio:'ignore' }); } catch(e){}
      execSync(`git remote add ${tmpRemote} ${authUrl}`, { cwd: root });
      try {
        execSync(`git push ${tmpRemote} HEAD:${runBranchRef}`, { cwd: root });
      } finally {
        try { execSync(`git remote remove ${tmpRemote}`, { cwd: root }); } catch(e){}
      }

      // switch back to previous branch to keep local workspace stable
      try { execSync(`git checkout -`, { cwd: root }); } catch(e) {}

      // open WebView terminal
      const panel = openWebTerminal(context);

      // If gh is not available, ask user if they'd like us to try to install it (optional)
      let ghAvailable = isGhAvailable();
      if (!ghAvailable) {
        const allow = await vscode.window.showInformationMessage('For real-time logs Remote Runner can use the GitHub CLI (gh). Install and use gh now?', { modal: true }, 'Yes', 'No');
        if (allow === 'Yes') {
          // Attempt to install (best-effort)
          outputChannel.show(true);
          tryInstallGh(outputChannel);
          ghAvailable = isGhAvailable();
          if (!ghAvailable) vscode.window.showErrorMessage('Attempt to install gh failed or gh not found. Falling back to git-fetch polling.');
        }
      }

      // If gh available, stream logs via gh API (faster, more real-time). Otherwise use git-fetch fallback.
      if (ghAvailable) {
        // Start gh-based streaming
        const { owner, repo } = repoInfo;
        streamLogsWithGh(owner, repo, runId, settings().get('pollInterval', 2000), panel);
      } else {
        // Fallback: existing git fetch -> git show polling
        currentPoller = setInterval(() => {
          const timeoutLimit = settings().get('timeout', 180000);
          if (Date.now() - startTime > timeoutLimit) return finishJob("TIMEOUT", COLORS.red, runId);

          try {
            try { execSync('git fetch origin logs:logs --force', { cwd: root, stdio: 'ignore' }); }
            catch (fErr) { if (Date.now() - startTime < 45000) return; else throw fErr; }

            let out = "";
            try { out = execSafe(`git show logs:logs/output_${runId}.txt`, { cwd: root }); }
            catch (e) { return; } // not present yet

            if (out.length > lastLen) {
              const newChunk = out.substring(lastLen);
              writeEmitter.fire(newChunk.replace(/\n/g, '\r\n'));
              if (webviewPanel) webviewPanel.webview.postMessage({ type: 'stdout', data: newChunk });
              lastLen = out.length;
            }

            if (out.includes('--- FINISHED ---')) finishJob("Success", COLORS.green, runId);
            else if (out.includes('--- EXECUTION FAILED ---')) finishJob("Failed", COLORS.red, runId);
          } catch (e) {
            if (fetchErrors++ > 30) finishJob("Network Loss", COLORS.red, runId);
          }
        }, settings().get('pollInterval', 2000));
      }

    } catch (err) {
      finishJob(err.message || String(err), COLORS.red, runId);
    }

    // finishJob cleans up pollers and optionally offers cleanup of run branch
    async function finishJob(msg, color, id) {
      if (currentPoller) { clearInterval(currentPoller); currentPoller = null; }
      if (ghPoller) { clearInterval(ghPoller); ghPoller = null; }
      isRunning = false;
      statusBar.text = `$(play) Run Remote`;
      inputBuffer = "";
      writeEmitter.fire(`\r\n${color}${COLORS.bold}>>> JOB ${msg.toUpperCase()}${COLORS.reset}\r\n> `);
      if (webviewPanel) webviewPanel.webview.postMessage({ type: 'stdout', data: `\r\n>>> JOB ${msg.toUpperCase()}\r\n` });
      if (msg === "Success") vscode.window.showInformationMessage(`Run ${id}: Success`);
      else vscode.window.showErrorMessage(`Run ${id}: ${msg}`);

      // Offer remote cleanup (delete run branch) if gh is available
      try {
        if (isGhAvailable()) {
          const cleanup = await vscode.window.showInformationMessage('Delete remote run branch to keep repo tidy?', { modal: false }, 'Yes', 'No');
          if (cleanup === 'Yes') {
            try {
              const rawUrl = execSafe('git remote get-url origin', { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath }).trim();
              const repoInfo = parseRepoFromRemote(rawUrl);
              if (repoInfo) {
                await ghDeleteRunBranch(repoInfo.owner, repoInfo.repo, runBranchRef);
              }
            } catch (e) { outputChannel.appendLine('[cleanup] failed: ' + (e.message || String(e))); }
          }
        }
      } catch (e) { outputChannel.appendLine('[cleanup] error: ' + (e.message || String(e))); }

      // local cleanup: delete local run branch if exists
      try { execSync(`git branch --delete ${runBranchRef}`, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, stdio: 'ignore' }); } catch(e){}
    }
  });

  context.subscriptions.push(setupCmd, installGhCmd, runCmd, statusBar);
}

// WORKFLOW TEMPLATES (trigger on runs/** and push logs to logs branch)
const pythonWorkflow = () => `name: Remote Run
on:
  push:
    branches:
      - 'runs/**'
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
          if [ -z "$ID_FILE" ]; then
            echo "No run_*.json found, nothing to do"
            exit 0
          fi
          ID=$(basename "$ID_FILE" | cut -d'_' -f2 | cut -d'.' -f1)
          if [ -z "$ID" ]; then
            echo "Failed to parse ID from: $ID_FILE" > logs/output_unknown.txt
            exit 1
          fi
          if [ -f input/input_$ID.txt ]; then
            python3 src/main.py < input/input_$ID.txt > logs/output_$ID.txt 2>&1 || echo "--- EXECUTION FAILED ---" >> logs/output_$ID.txt
          else
            echo "No input file: input/input_$ID.txt" > logs/output_$ID.txt
          fi
          echo "--- FINISHED ---" >> logs/output_$ID.txt
      - name: Upload logs
        shell: bash
        run: |
          git config user.name "Runner"
          git config user.email "r@edu.com"
          git add logs/ || true
          git commit -m "Logs" || true
          git push origin HEAD:logs --force`;

const javaWorkflow = () => `name: Remote Run
on:
  push:
    branches:
      - 'runs/**'
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
          if [ -z "$ID_FILE" ]; then
            echo "No run_*.json found, nothing to do"
            exit 0
          fi
          ID=$(basename "$ID_FILE" | cut -d'_' -f2 | cut -d'.' -f1)
          if [ -z "$ID" ]; then
            echo "Failed to parse ID from: $ID_FILE" > logs/output_unknown.txt
            exit 1
          fi
          if [ -f input/input_$ID.txt ]; then
            javac src/Main.java
            java -cp src Main < input/input_$ID.txt > logs/output_$ID.txt 2>&1 || echo "--- EXECUTION FAILED ---" >> logs/output_$ID.txt
          else
            echo "No input file: input/input_$ID.txt" > logs/output_$ID.txt
          fi
          echo "--- FINISHED ---" >> logs/output_$ID.txt
      - name: Upload logs
        shell: bash
        run: |
          git config user.name "Runner"
          git config user.email "r@edu.com"
          git add logs/ || true
          git commit -m "Logs" || true
          git push origin HEAD:logs --force`;

exports.activate = activate;