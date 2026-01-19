const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let isRunning = false;
let currentPoller = null;
let writeEmitter = new vscode.EventEmitter();
let remoteTerminal = null;
let outputChannel = vscode.window.createOutputChannel("Remote Runner System");
let inputBuffer = "";

const COLORS = { 
    reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", 
    yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m" 
};

function activate(context) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'remote-runner.run';
    statusBarItem.text = `$(play) Run Remote`;
    statusBarItem.show();

    // --- HELPER: Configuration ---
    const settings = () => vscode.workspace.getConfiguration('remoteRunner');

    // --- HELPER: Template Deployment ---
    const copyTemp = async (root, file, dest) => {
        const target = path.join(root, dest);
        if (fs.existsSync(target)) {
            const ow = await vscode.window.showWarningMessage(`${dest} exists. Overwrite?`, "Yes", "No");
            if (ow !== "Yes") return;
        }
        const tPath = path.join(context.extensionPath, 'templates', file);
        if (fs.existsSync(tPath)) fs.writeFileSync(target, fs.readFileSync(tPath));
    };

    // --- HELPER: Auto-Detection ---
    const detectLanguage = (root) => {
        if (fs.existsSync(path.join(root, 'src/main.py'))) return 'Python';
        if (fs.existsSync(path.join(root, 'src/Main.java'))) return 'Java';
        return null;
    };

    // --- SETUP: Workspace Initialization ---
    let setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        // ignoreFocusOut: true allows you to switch windows to copy links/tokens without the box closing
        const lang = await vscode.window.showQuickPick(['Python', 'Java'], { 
            placeHolder: '1. Select Project Type', 
            ignoreFocusOut: true 
        });
        
        const repoUrl = await vscode.window.showInputBox({ 
            prompt: "2. Paste GitHub Repo URL", 
            placeHolder: "https://github.com/user/repo",
            ignoreFocusOut: true 
        });
        
        const token = await vscode.window.showInputBox({ 
            prompt: "3. Paste Personal Access Token", 
            password: true, 
            ignoreFocusOut: true 
        });
        
        if (!lang || !repoUrl || !token) return;

        // SANITIZE URL: Removes extra https:// if you pasted it
        const cleanRepo = repoUrl.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
        const authUrl = `https://${token.trim()}@${cleanRepo}`;

        try {
            outputChannel.appendLine(`[SYSTEM] Configuring remote for: ${cleanRepo}`);
            
            if (!fs.existsSync(path.join(root, '.git'))) {
                execSync('git init -b main', { cwd: root });
            }

            // Force update remote URL
            try {
                execSync(`git remote add origin ${authUrl}`, { cwd: root });
            } catch (e) {
                execSync(`git remote set-url origin ${authUrl}`, { cwd: root });
            }

            execSync(`git config --local user.name "Runner" && git config --local user.email "r@edu.com"`, { cwd: root });

            ['src', 'input', 'logs', '.github/workflows'].forEach(d => fs.mkdirSync(path.join(root, d), { recursive: true }));

            if (lang === 'Python') {
                await copyTemp(root, 'python_main.txt', 'src/main.py');
                await copyTemp(root, 'py_workflow.txt', '.github/workflows/main.yml');
            } else {
                await copyTemp(root, 'java_main.txt', 'src/Main.java');
                await copyTemp(root, 'java_workflow.txt', '.github/workflows/main.yml');
            }

            vscode.window.showInformationMessage("Remote Runner: Setup Complete!");
        } catch (e) { 
            vscode.window.showErrorMessage(`Setup Failed: ${e.message}`); 
        }
    });

    // --- RUN: Smart Interaction & Polling ---
    let runCmd = vscode.commands.registerCommand('remote-runner.run', async () => {
        if (isRunning) return;
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const lang = detectLanguage(root) || await vscode.window.showQuickPick(['Python', 'Java']);
        if (!lang) return;

        isRunning = true;
        statusBarItem.text = `$(sync~spin) Running...`;
        outputChannel.clear();
        outputChannel.appendLine(`[SYSTEM] Starting session: ${lang}`);

        const runId = Date.now().toString();
        const inputPath = path.join(root, 'input', `input_${runId}.txt`);
        let lastLen = 0, fetchErrors = 0, startTime = Date.now();

        // 1. Terminal Setup (PTY)
        if (!remoteTerminal) {
            remoteTerminal = vscode.window.createTerminal({
                name: "Remote Interaction",
                pty: {
                    onDidWrite: writeEmitter.event,
                    open: () => writeEmitter.fire(`${COLORS.cyan}--- System Ready ---\r\n> `),
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
                    close: () => { isRunning = false; remoteTerminal = null; }
                }
            });
        }
        remoteTerminal.show();

        try {
            // 2. Metadata & Resilient Sync (3 Retries)
            const sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
            fs.writeFileSync(path.join(root, 'input', `run_${runId}.json`), JSON.stringify({ runId, sha }));
            
            outputChannel.appendLine(`[SYSTEM] Pushing commit ${sha}...`);
            let pushSuccess = false;
            for (let i = 0; i < 3; i++) {
                try {
                    execSync(`git add . && git commit --allow-empty -m "Run ${runId}" && git push origin main`, { cwd: root });
                    pushSuccess = true;
                    break;
                } catch (e) {
                    outputChannel.appendLine(`[WARNING] Push attempt ${i+1} failed. Retrying...`);
                    if (i === 2) throw e;
                }
            }

            // 3. High-Fidelity Polling
            currentPoller = setInterval(() => {
                if (Date.now() - startTime > settings().get('timeout', 180000)) return cleanupJob("TIMEOUT", COLORS.red);

                try {
                    execSync('git fetch origin logs --force', { cwd: root });
                    const out = execSync(`git show FETCH_HEAD:logs/output_${runId}.txt`, { cwd: root }).toString();
                    fetchErrors = 0; 
                    
                    if (out.length > lastLen) {
                        const newChunk = out.substring(lastLen);
                        writeEmitter.fire(newChunk.replace(/\n/g, '\r\n')); 
                        outputChannel.append(newChunk); 
                        lastLen = out.length;
                    }

                    if (out.includes("--- FINISHED ---")) cleanupJob("Success", COLORS.green);
                    else if (out.includes("--- EXECUTION FAILED ---")) cleanupJob("Failed", COLORS.red);
                } catch (e) {
                    fetchErrors++;
                    if (fetchErrors > settings().get('maxRetries', 15)) cleanupJob("Network Loss", COLORS.red);
                }
            }, settings().get('pollInterval', 2000));

        } catch (err) { 
            cleanupJob("Sync Error", COLORS.red);
            vscode.window.showErrorMessage(`Sync Error: ${err.message}`);
        }

        function cleanupJob(msg, color) {
            if (currentPoller) clearInterval(currentPoller);
            isRunning = false;
            statusBarItem.text = `$(play) Run Remote`;
            outputChannel.appendLine(`\n[SYSTEM] Job Result: ${msg.toUpperCase()}`);
            writeEmitter.fire(`\r\n${color}${COLORS.bold}>>> JOB ${msg.toUpperCase()}${COLORS.reset}\r\n> `);
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

exports.activate = activate;