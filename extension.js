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

function activate(context) {
    const settings = () => vscode.workspace.getConfiguration('remoteRunner');
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'remote-runner.run';
    statusBar.text = `$(play) Run Remote`;
    statusBar.show();

    const getActiveBranch = (root) => {
        try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: root }).toString().trim(); }
        catch (e) { return 'main'; }
    };

    const cleanupOldFiles = (root) => {
        ['input', 'logs'].forEach(folder => {
            const dir = path.join(root, folder);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            // Only keep the 10 newest run files; sort by mtime
            const files = fs.readdirSync(dir)
                .filter(f => f.includes('_'))
                .map(f => {
                    try {
                        return { name: f, mtime: fs.statSync(path.join(dir, f)).mtime.getTime() };
                    } catch (e) {
                        return { name: f, mtime: 0 };
                    }
                })
                .sort((a, b) => a.mtime - b.mtime)
                .map(x => x.name);

            if (files.length > 10) {
                const toRemove = files.slice(0, files.length - 10);
                toRemove.forEach(f => {
                    try { fs.unlinkSync(path.join(dir, f)); } catch(e) {}
                });
            }
        });
    };

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
            ['src', 'input', 'logs', '.github/workflows'].forEach(d => fs.mkdirSync(path.join(root, d), { recursive: true }));
            fs.writeFileSync(path.join(root, '.github', 'workflows', 'main.yml'), lang === 'Python' ? pythonWorkflow(branch) : javaWorkflow(branch));
            vscode.window.showInformationMessage(`✅ Configured on branch: ${branch}`);
        } catch (e) { vscode.window.showErrorMessage(`Setup Failed: ${e.message}`); }
    });

    let runCmd = vscode.commands.registerCommand('remote-runner.run', async () => {
        if (isRunning) return;
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const token = await context.secrets.get('gh_token');
        if (!token || !root) return vscode.window.showErrorMessage("Run Setup first.");

        const activeLang = fs.existsSync(path.join(root, 'src/main.py')) ? 'Python' :
                           fs.existsSync(path.join(root, 'src/Main.java')) ? 'Java' : null;
        if (!activeLang) return vscode.window.showErrorMessage("Missing src/main.py or src/Main.java");

        isRunning = true;
        statusBar.text = `$(sync~spin) Running...`;
        cleanupOldFiles(root);

        let startTime = Date.now();
        let fetchErrors = 0, lastLen = 0;
        const runId = Date.now().toString();
        const branch = getActiveBranch(root);
        const inputPath = path.join(root, 'input', `input_${runId}.txt`);
        fs.writeFileSync(inputPath, "");
        fs.writeFileSync(path.join(root, 'input', `run_${runId}.json`), JSON.stringify({ runId }));

        try {
            const rawUrl = execSync('git remote get-url origin', { cwd: root }).toString().trim();

            // Convert SSH remote to HTTPS if needed, then inject token safely by temporarily setting remote
            let httpsUrl = rawUrl;
            if (rawUrl.startsWith('git@')) {
                // convert git@github.com:OWNER/REPO.git to https://github.com/OWNER/REPO.git
                httpsUrl = rawUrl.replace(/^git@([^:]+):/, 'https://$1/');
            }
            if (!httpsUrl.startsWith('https://')) {
                throw new Error('Remote URL must be HTTPS or SSH style pointing to a git host.');
            }
            const authUrl = httpsUrl.replace('https://', `https://${token}@`);
            const origRemoteUrl = rawUrl;

            if (!remoteTerminal) {
                remoteTerminal = vscode.window.createTerminal({
                    name: "Remote Interaction",
                    pty: {
                        onDidWrite: writeEmitter.event,
                        open: () => writeEmitter.fire(`${COLORS.cyan}--- System Attached ---\r\n> `),
                        handleInput: data => {
                            if (data === '\r' || data === '\n') {
                                fs.appendFileSync(inputPath, inputBuffer + '\n');
                                inputBuffer = "";
                                writeEmitter.fire('\r\n> ');
                            } else if (data === '\x7f') {
                                if (inputBuffer.length > 0) {
                                    inputBuffer = inputBuffer.slice(0, -1);
                                    writeEmitter.fire('\b \b');
                                }
                            } else {
                                inputBuffer += data;
                                writeEmitter.fire(data);
                            }
                        },
                        close: () => { isRunning = false; }
                    }
                });
            }
            remoteTerminal.show();

            // Temporarily set remote to authUrl for the push, then restore original URL
            try {
                execSync(`git remote set-url origin ${authUrl}`, { cwd: root });
                execSync(`git add . && git commit --allow-empty -m "Run ${runId}" && git push origin ${branch}`, { cwd: root });
            } finally {
                try { execSync(`git remote set-url origin ${origRemoteUrl}`, { cwd: root }); } catch (e) {}
            }

            // Poll logs (REBUILT POLLER)
            currentPoller = setInterval(() => {
                const timeoutLimit = settings().get('timeout', 180000);
                if (Date.now() - startTime > timeoutLimit) return finishJob("TIMEOUT", COLORS.red, runId);

                try {
                    // 1. Forced Fetch: Syncs remote 'logs' branch to local 'logs' ref regardless of history
                    try {
                        execSync('git fetch origin logs:logs --force', { cwd: root, stdio: 'ignore' });
                    } catch (fErr) {
                        // Ignore fetch failures for the first 45 seconds (waiting for Action to start/push)
                        if (Date.now() - startTime < 45000) return;
                        throw fErr;
                    }

                    let out = "";
                    try {
                        out = execSync(`git show logs:logs/output_${runId}.txt`, { cwd: root }).toString();
                    } catch (e) { return; } // File not pushed to branch yet

                    if (out.length > lastLen) {
                        const newChunk = out.substring(lastLen);
                        writeEmitter.fire(newChunk.replace(/\n/g, '\r\n'));
                        lastLen = out.length;
                    }

                    if (out.includes("--- FINISHED ---")) finishJob("Success", COLORS.green, runId);
                    else if (out.includes("--- EXECUTION FAILED ---")) finishJob("Failed", COLORS.red, runId);
                } catch (e) {
                    if (fetchErrors++ > 30) finishJob("Network Loss", COLORS.red, runId);
                }
            }, settings().get('pollInterval', 2000));

        } catch (err) { finishJob(err.message || String(err), COLORS.red, runId); }

        function finishJob(msg, color, id) {
            if (currentPoller) clearInterval(currentPoller);
            isRunning = false;
            statusBar.text = `$(play) Run Remote`;
            inputBuffer = "";
            writeEmitter.fire(`\r\n${color}${COLORS.bold}>>> JOB ${msg.toUpperCase()}${COLORS.reset}\r\n> `);
            if (msg === "Success") vscode.window.showInformationMessage(`Run ${id}: Success`);
            else vscode.window.showErrorMessage(`Run ${id}: ${msg}`);
        }
    });

    context.subscriptions.push(setupCmd, runCmd, statusBar);
}

// --- WORKFLOWS ---
const pythonWorkflow = (branch) => `name: Remote Run
on:
  push:
    branches: [ ${branch} ]
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
          git push origin ${branch}:logs --force`;

const javaWorkflow = (branch) => `name: Remote Run
on:
  push:
    branches: [ ${branch} ]
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
          git push origin ${branch}:logs --force`;

exports.activate = activate;