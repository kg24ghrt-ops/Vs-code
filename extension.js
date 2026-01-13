const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let isRunning = false;
let writeEmitter = new vscode.EventEmitter();
let remoteTerminal = null;

const COLORS = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    bold: "\x1b[1m"
};
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
        const username = await vscode.window.showInputBox({ prompt: "GitHub Username", ignoreFocusOut: true });
        const token = await vscode.window.showInputBox({ prompt: "Personal Access Token", password: true, ignoreFocusOut: true });
        const repoName = await vscode.window.showInputBox({ prompt: "Repository Name", ignoreFocusOut: true });
        
        if (!langChoice || !username || !token || !repoName) return;

        // --- IMPROVEMENT 1: URL CLEANING ---
        // Removes accidental spaces or ".git" suffix which can break the auth string
        const cleanUser = username.trim();
        const cleanToken = token.trim();
        const cleanRepo = repoName.trim().replace(".git", "");
        
        const authUrl = `https://${cleanUser}:${cleanToken}@github.com/${cleanUser}/${cleanRepo}.git`;

        try {
            const gitDir = path.join(root, '.git');
            if (fs.existsSync(gitDir)) fs.rmSync(gitDir, { recursive: true, force: true });

            execSync('git init -b main', { cwd: root });
            
            // --- IMPROVEMENT 2: GLOBAL IDENTITY FIX ---
            // GitHub sometimes rejects pushes if the local config has no user.name
            execSync(`git config user.name "${cleanUser}"`, { cwd: root });
            execSync(`git config user.email "${cleanUser}@users.noreply.github.com"`, { cwd: root });
            
            execSync(`git remote add origin ${authUrl}`, { cwd: root });

            // Folder and Template logic
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
            vscode.window.showInformationMessage("Setup Complete with Identity Fix.");
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
            
            // --- IMPROVEMENT 3: ERROR VERBOSITY ---
            // This captures the ACTUAL reason GitHub says no (like "Repo not found")
            execSync('git add . && git commit --allow-empty -m "Remote Run"', { cwd: root });
            
            try {
                execSync('git push origin main --force', { cwd: root, stdio: 'pipe' });
            } catch (pushError) {
                const detailedError = pushError.stderr ? pushError.stderr.toString() : pushError.message;
                throw new Error(detailedError);
            }

            // Polling logic...
            const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            let frameIdx = 0, lastLogContent = "", attempts = 0;
            writeEmitter.fire(`${COLORS.yellow}[2/2] Awaiting Action...  ${COLORS.reset}`);

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
                            writeEmitter.fire(CLEAR_LINE);
                            writeEmitter.fire(`${COLORS.green}${COLORS.bold}--- OUTPUT ---${COLORS.reset}\r\n`);
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
            // Displays the specific Git error message in the console
            writeEmitter.fire(`\r\n${COLORS.red}Push Failed: ${err.message}${COLORS.reset}\r\n> `);
            isRunning = false;
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

exports.activate = activate;