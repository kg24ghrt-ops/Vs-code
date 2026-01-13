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

    // --- SETUP COMMAND ---
    let setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const langChoice = await vscode.window.showQuickPick(['Python', 'Java'], { placeHolder: 'Select Language', ignoreFocusOut: true });
        
        const fullRepoUrl = await vscode.window.showInputBox({ 
            prompt: "Paste the FULL HTTPS Repository URL", 
            placeHolder: "https://github.com/user/repo.git",
            ignoreFocusOut: true 
        });

        const token = await vscode.window.showInputBox({ 
            prompt: "Paste your Personal Access Token", 
            password: true, 
            ignoreFocusOut: true 
        });
        
        if (!langChoice || !fullRepoUrl || !token) return;

        // Strip "https://" if the user included it, then build: https://TOKEN@github.com/...
        const cleanUrl = fullRepoUrl.trim().replace(/^https?:\/\//, "");
        const authUrl = `https://${token.trim()}@${cleanUrl}`;

        try {
            const gitDir = path.join(root, '.git');
            if (fs.existsSync(gitDir)) fs.rmSync(gitDir, { recursive: true, force: true });

            execSync('git init -b main', { cwd: root });
            execSync(`git remote add origin ${authUrl}`, { cwd: root });

            // Basic folder setup
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

            // Simple commit without specific identity logic
            execSync('git add . && git commit -m "Setup"', { 
                cwd: root, 
                env: { ...process.env, GIT_AUTHOR_NAME: "Student", GIT_COMMITTER_NAME: "Student", GIT_AUTHOR_EMAIL: "s@edu.com", GIT_COMMITTER_EMAIL: "s@edu.com" } 
            });

            vscode.window.showInformationMessage("Setup Ready.");
        } catch (e) {
            vscode.window.showErrorMessage("Setup Error: " + e.message);
        }
    });

    // --- RUN COMMAND ---
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
                    open: () => writeEmitter.fire(`${COLORS.cyan}--- Ready ---\r\n> `),
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
            writeEmitter.fire(`\r\n${COLORS.yellow}[1/2] Syncing...${COLORS.reset}\r\n`);
            
            execSync('git add . && git commit --allow-empty -m "Run"', { 
                cwd: root,
                env: { ...process.env, GIT_AUTHOR_NAME: "Student", GIT_COMMITTER_NAME: "Student", GIT_AUTHOR_EMAIL: "s@edu.com", GIT_COMMITTER_EMAIL: "s@edu.com" }
            });
            
            execSync('git push origin main --force', { cwd: root, stdio: 'pipe' });

            const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            let frameIdx = 0, lastLogContent = "", attempts = 0;
            writeEmitter.fire(`${COLORS.yellow}[2/2] Awaiting Logs...  ${COLORS.reset}`);

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
                    if (attempts++ > 100) {
                        writeEmitter.fire(CLEAR_LINE + `${COLORS.red}Timeout.${COLORS.reset}\r\n> `);
                        clearInterval(poller);
                        isRunning = false;
                    }
                }
            }, 1500); 

        } catch (err) {
            writeEmitter.fire(`\r\n${COLORS.red}Push Failed: ${err.message}${COLORS.reset}\r\n> `);
            isRunning = false;
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

exports.activate = activate;