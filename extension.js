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

    // --- SETUP COMMAND ---
    let setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return vscode.window.showErrorMessage("Open a folder first!");

        const langChoice = await vscode.window.showQuickPick(['Python', 'Java'], { placeHolder: 'Select Language' });
        
        // These inputs are now MANDATORY to clear the old SSH settings
        const username = await vscode.window.showInputBox({ 
            prompt: "GitHub Username",
            placeHolder: "e.g., kg24ghrt-ops" 
        });
        const token = await vscode.window.showInputBox({ 
            prompt: "GitHub Personal Access Token (Classic)", 
            password: true,
            placeHolder: "ghp_xxxxxxxxxxxx"
        });
        const repoName = await vscode.window.showInputBox({ 
            prompt: "Repository Name",
            placeHolder: "e.g., Test"
        });
        
        if (!langChoice || !username || !token || !repoName) {
            return vscode.window.showErrorMessage("Setup cancelled. All fields are required.");
        }

        // Clean the URL: ensure no trailing .git or spaces
        const cleanRepo = repoName.trim().replace(".git", "");
        const authUrl = `https://${username}:${token}@github.com/${username}/${cleanRepo}.git`;

        // Create folders
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

        try {
            // CRITICAL: Wipe existing git config to remove old SSH origin
            const gitDir = path.join(root, '.git');
            if (fs.existsSync(gitDir)) {
                fs.rmSync(gitDir, { recursive: true, force: true });
            }

            execSync('git init -b main', { cwd: root });
            execSync(`git remote add origin ${authUrl}`, { cwd: root });
            
            // Set local git identity so the bot doesn't complain
            execSync(`git config user.name "${username}"`, { cwd: root });
            execSync(`git config user.email "${username}@users.noreply.github.com"`, { cwd: root });

            execSync('git add . && git commit -m "Setup with Token Auth"', { cwd: root });
            vscode.window.showInformationMessage("Success! Old SSH settings cleared. Token Auth is active.");
        } catch (e) {
            vscode.window.showErrorMessage("Git Error: " + e.message);
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
                    open: () => writeEmitter.fire(`${COLORS.cyan}--- Token Auth Console Ready ---\r\n> `),
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
            writeEmitter.fire(`\r\n${COLORS.yellow}[1/2] Syncing via HTTPS Token...${COLORS.reset}\r\n`);
            
            execSync('git add . && git commit --allow-empty -m "Remote Run"', { cwd: root });
            execSync('git push origin main --force', { cwd: root });

            const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            let frameIdx = 0, lastLogContent = "", attempts = 0;

            writeEmitter.fire(`${COLORS.yellow}[2/2] Awaiting GitHub Action...  ${COLORS.reset}`);

            const poller = setInterval(() => {
                if (lastLogContent === "") {
                    writeEmitter.fire(`\b${spinnerFrames[frameIdx]}`);
                    frameIdx = (frameIdx + 1) % spinnerFrames.length;
                }

                try {
                    // Fetch logs from the remote branch
                    execSync('git fetch origin logs:remote_logs --force', { cwd: root });
                    const currentLogs = execSync('git show remote_logs:logs/output.txt', { cwd: root }).toString();
                    
                    if (currentLogs.length > lastLogContent.length) {
                        if (lastLogContent === "") {
                            writeEmitter.fire(CLEAR_LINE);
                            writeEmitter.fire(`${COLORS.green}${COLORS.bold}--- REMOTE OUTPUT ---${COLORS.reset}\r\n`);
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
                        writeEmitter.fire(CLEAR_LINE + `${COLORS.red}Action Timeout.${COLORS.reset}\r\n> `);
                        clearInterval(poller);
                        isRunning = false;
                    }
                }
            }, 1500); 

        } catch (err) {
            writeEmitter.fire(`\r\n${COLORS.red}Push Failed. Check if your Token has 'repo' permissions.${COLORS.reset}\r\n> `);
            isRunning = false;
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

exports.activate = activate;