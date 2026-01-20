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
            const files = fs.readdirSync(dir).sort().filter(f => f.includes('_'));
            if (files.length > 10) {
                files.slice(0, files.length - 10).forEach(f => {
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
        const repoUrl = await vscode.window.showInputBox({ prompt: "Paste HTTPS Repo URL", ignoreFocusOut: true });
        if (!repoUrl || !repoUrl.trim().startsWith("https://")) return vscode.window.showErrorMessage("Valid HTTPS URL required.");
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
            const authUrl = rawUrl.replace("https://", `https://${token}@`);

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

            // Push to trigger Action
            execSync(`git add . && git commit --allow-empty -m "Run ${runId}" && git push ${authUrl} ${branch}`, { cwd: root });

            // --- REBUILT POLLER: Fixes "Network Loss" & Log Mismatch ---
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
                        // 2. Read from the forced local 'logs' ref
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

        } catch (err) { finishJob(err.message, COLORS.red, runId); }

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
        run: |
          mkdir -p logs
          ID=$(ls input/run_*.json | xargs -n1 basename | cut -d'_' -f2 | cut -d'.' -f1)
          python3 src/main.py < input/input_$ID.txt > logs/output_$ID.txt 2>&1 || echo "--- EXECUTION FAILED ---" >> logs/output_$ID.txt
          echo "--- FINISHED ---" >> logs/output_$ID.txt
      - name: Upload
        run: |
          git config user.name "Runner"
          git config user.email "r@edu.com"
          git add logs/ && git commit -m "Logs" && git push origin ${branch}:logs --force`;

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
        run: |
          mkdir -p logs
          ID=$(ls input/run_*.json | xargs -n1 basename | cut -d'_' -f2 | cut -d'.' -f1)
          javac src/Main.java
          java -cp src Main < input/input_$ID.txt > logs/output_$ID.txt 2>&1 || echo "--- EXECUTION FAILED ---" >> logs/output_$ID.txt
          echo "--- FINISHED ---" >> logs/output_$ID.txt
      - name: Upload
        run: |
          git config user.name "Runner"
          git config user.email "r@edu.com"
          git add logs/ && git commit -m "Logs" && git push origin ${branch}:logs --force`;

exports.activate = activate;