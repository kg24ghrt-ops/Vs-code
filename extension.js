const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let isRunning = false;
let writeEmitter = new vscode.EventEmitter();
let remoteTerminal = null;

const COLORS = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m" };
const CLEAR_LINE = "\x1b[2K\r";

function activate(context) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'remote-runner.run';
    statusBarItem.text = `$(play) Run on Remote`;
    statusBarItem.show();

    let setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const langChoice = await vscode.window.showQuickPick(['Python', 'Java'], { placeHolder: 'Select Language', ignoreFocusOut: true });
        const fullRepoUrl = await vscode.window.showInputBox({ prompt: "Step 1: Paste FULL Repo Link", ignoreFocusOut: true });
        const token = await vscode.window.showInputBox({ prompt: "Step 2: Paste Token", password: true, ignoreFocusOut: true });
        
        if (!langChoice || !fullRepoUrl || !token) return;

        // COMBINE: This puts the token inside the link exactly where GitHub wants it
        const cleanUrl = fullRepoUrl.trim().replace(/^https?:\/\//, "");
        const authUrl = `https://${token.trim()}@${cleanUrl}`;

        try {
            // WIPE OLD DATA
            const gitDir = path.join(root, '.git');
            if (fs.existsSync(gitDir)) fs.rmSync(gitDir, { recursive: true, force: true });

            execSync('git init -b main', { cwd: root });
            
            // FORCE IDENTITY (This stops the "Who are you?" prompt)
            execSync(`git config --local user.name "Student"`, { cwd: root });
            execSync(`git config --local user.email "student@edu.com"`, { cwd: root });

            // ATTACH THE LINK
            execSync(`git remote add origin ${authUrl}`, { cwd: root });

            // SETUP FOLDERS
            ['src', 'input', 'logs', '.vscode', '.github/workflows'].forEach(d => 
                fs.mkdirSync(path.join(root, d), { recursive: true }));

            const copyTemp = (file, dest) => {
                const tPath = path.join(context.extensionPath, 'templates', file);
                if (fs.existsSync(tPath)) fs.writeFileSync(path.join(root, dest), fs.readFileSync(tPath));
            };

            if (langChoice === 'Python') {
                copyTemp('python_main.txt', 'src/main.py');
                copyTemp('py_workflow.txt', '.github/workflows/main.yml');
            } else {
                copyTemp('java_main.txt', 'src/Main.java');
                copyTemp('java_workflow.txt', '.github/workflows/main.yml');
            }

            execSync('git add . && git commit -m "Setup"', { cwd: root });
            vscode.window.showInformationMessage("Setup Ready. No modifications will occur.");
        } catch (e) {
            vscode.window.showErrorMessage("Setup Error: " + e.message);
        }
    });

    let runCmd = vscode.commands.registerCommand('remote-runner.run', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root || isRunning) return;

        const inputPath = path.join(root, 'input/input.txt');
        if (!fs.existsSync(path.dirname(inputPath))) fs.mkdirSync(path.dirname(inputPath));

        if (!remoteTerminal) {
            remoteTerminal = vscode.window.createTerminal({
                name: "Remote Runner Console",
                pty: {
                    onDidWrite: writeEmitter.event,
                    open: () => writeEmitter.fire(`${COLORS.cyan}--- Console Ready ---\r\n> `),
                    handleInput: data => {
                        if (data === '\r' || data === '\n') {
                            writeEmitter.fire('\r\n> ');
                            fs.appendFileSync(inputPath, '\n');
                        } else if (data === '\x7f') {
                            writeEmitter.fire('\b \b');
                        } else {
                            writeEmitter.fire(data);
                            fs.appendFileSync(inputPath, data);
                        }
                    },
                    close: () => { remoteTerminal = null; }
                }
            });
        }
        remoteTerminal.show();

        try {
            isRunning = true;
            writeEmitter.fire(`\r\n${COLORS.yellow}[1/2] Syncing to GitHub...${COLORS.reset}\r\n`);
            
            // Sync current state
            execSync('git add . && git commit --allow-empty -m "Remote Run"', { cwd: root });
            
            // PUSH: stdio: 'inherit' would ask for password, stdio: 'pipe' handles it silently
            execSync('git push origin main --force', { cwd: root, stdio: 'pipe' });

            const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            let frameIdx = 0, lastLogContent = "", attempts = 0;
            writeEmitter.fire(`${COLORS.yellow}[2/2] Awaiting Results...  ${COLORS.reset}`);

            const poller = setInterval(() => {
                if (lastLogContent === "") {
                    writeEmitter.fire(`\b${spinnerFrames[frameIdx]}`);
                    frameIdx = (frameIdx + 1) % spinnerFrames.length;
                }
                try {
                    execSync('git fetch origin logs:remote_logs --force', { cwd: root });
                    const currentLogs = execSync('git show remote_logs:logs/output.txt', { cwd: root }).toString();
                    if (currentLogs.length > lastLogContent.length) {
                        if (lastLogContent === "") {
                            writeEmitter.fire(CLEAR_LINE + `${COLORS.green}--- OUTPUT ---${COLORS.reset}\r\n`);
                        }
                        const newChunk = currentLogs.substring(lastLogContent.length);
                        writeEmitter.fire(newChunk.replace(/\n/g, '\r\n'));
                        lastLogContent = currentLogs;
                        if (currentLogs.includes("--- FINISHED ---")) {
                            writeEmitter.fire(`\r\n${COLORS.green}>>> Done.${COLORS.reset}\r\n> `);
                            clearInterval(poller);
                            isRunning = false;
                        }
                    }
                } catch (e) {
                    if (attempts++ > 150) {
                        writeEmitter.fire(CLEAR_LINE + `${COLORS.red}Timeout.${COLORS.reset}\r\n> `);
                        clearInterval(poller);
                        isRunning = false;
                    }
                }
            }, 1500); 

        } catch (err) {
            writeEmitter.fire(`\r\n${COLORS.red}Push Failed: Ensure your Token has 'repo' permissions.${COLORS.reset}\r\n> `);
            isRunning = false;
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

exports.activate = activate;