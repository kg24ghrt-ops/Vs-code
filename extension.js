const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let isRunning = false;
let writeEmitter = new vscode.EventEmitter();
let remoteTerminal = null;

// ANSI Formatting Constants
const COLORS = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    bold: "\x1b[1m"
};
const CLEAR_LINE = "\x1b[2K\r";

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // 1. Setup Status Bar
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'remote-runner.run';
    statusBarItem.text = `$(play) Run on Remote`;
    statusBarItem.tooltip = "Push code and execute on GitHub Actions";
    statusBarItem.show();

    // 2. SETUP COMMAND (Force Token/HTTPS Refresh)
    let setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return vscode.window.showErrorMessage("Open a folder first!");

        // ignoreFocusOut: true allows you to click away to copy the token!
        const langChoice = await vscode.window.showQuickPick(['Python', 'Java'], { 
            placeHolder: 'Select Project Language',
            ignoreFocusOut: true 
        });
        
        const username = await vscode.window.showInputBox({ 
            prompt: "GitHub Username",
            placeHolder: "Your GitHub handle",
            ignoreFocusOut: true 
        });

        const token = await vscode.window.showInputBox({ 
            prompt: "GitHub Personal Access Token (Classic)", 
            password: true,
            placeHolder: "ghp_xxxxxxxxxxxx",
            ignoreFocusOut: true 
        });

        const repoName = await vscode.window.showInputBox({ 
            prompt: "Repository Name",
            placeHolder: "The name of your GitHub repo",
            ignoreFocusOut: true 
        });
        
        if (!langChoice || !username || !token || !repoName) return;

        const authUrl = `https://${username}:${token}@github.com/${username}/${repoName.trim()}.git`;

        // Create directory structure
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
            // Wipe old .git folder to clear out bad SSH configs
            const gitDir = path.join(root, '.git');
            if (fs.existsSync(gitDir)) fs.rmSync(gitDir, { recursive: true, force: true });

            execSync('git init -b main', { cwd: root });
            execSync(`git config user.name "${username}"`, { cwd: root });
            execSync(`git config user.email "${username}@users.noreply.github.com"`, { cwd: root });
            execSync(`git remote add origin ${authUrl}`, { cwd: root });
            
            execSync('git add . && git commit -m "Setup Workspace with Token"', { cwd: root });
            vscode.window.showInformationMessage("Success! Token auth configured.");
        } catch (e) {
            vscode.window.showErrorMessage("Git Init Error: " + e.message);
        }
    });

    // 3. RUN COMMAND (With Streaming Logs and Clean Spinner)
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
                    open: () => writeEmitter.fire(`${COLORS.cyan}--- Remote Console Ready ---\r\n> `),
                    handleInput: data => {
                        if (data === '\r' || data === '\n') {
                            writeEmitter.fire('\r\n> ');
                            fs.appendFileSync(inputPath, '\n');
                        } else if (data === '\x7f') { // Backspace
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
            
            execSync('git add . && git commit --allow-empty -m "Remote Execution"', { cwd: root });
            execSync('git push origin main --force', { cwd: root });

            const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            let frameIdx = 0, lastLogContent = "", attempts = 0;

            writeEmitter.fire(`${COLORS.yellow}[2/2] Awaiting Results...  ${COLORS.reset}`);

            const poller = setInterval(() => {
                if (lastLogContent === "") {
                    // Update spinner in place
                    writeEmitter.fire(`\b${spinnerFrames[frameIdx]}`);
                    frameIdx = (frameIdx + 1) % spinnerFrames.length;
                }

                try {
                    execSync('git fetch origin logs:remote_logs --force', { cwd: root });
                    const currentLogs = execSync('git show remote_logs:logs/output.txt', { cwd: root }).toString();
                    
                    if (currentLogs.length > lastLogContent.length) {
                        // First data arrival: Clear the "Awaiting Logs" line entirely
                        if (lastLogContent === "") {
                            writeEmitter.fire(CLEAR_LINE);
                            writeEmitter.fire(`${COLORS.green}${COLORS.bold}--- OUTPUT ---${COLORS.reset}\r\n`);
                        }
                        
                        const newChunk = currentLogs.substring(lastLogContent.length);
                        writeEmitter.fire(newChunk.replace(/\n/g, '\r\n'));
                        lastLogContent = currentLogs;
                        
                        if (currentLogs.includes("--- FINISHED ---")) {
                            writeEmitter.fire(`\r\n${COLORS.green}>>> Execution Complete.${COLORS.reset}\r\n> `);
                            clearInterval(poller);
                            isRunning = false;
                        }
                    }
                } catch (e) {
                    if (attempts++ > 120) { // 2 minute timeout
                        writeEmitter.fire(CLEAR_LINE + `${COLORS.red}Timeout waiting for GitHub Action.${COLORS.reset}\r\n> `);
                        clearInterval(poller);
                        isRunning = false;
                    }
                }
            }, 1500); 

        } catch (err) {
            writeEmitter.fire(`\r\n${COLORS.red}Error: Push failed. Check your Token permissions.${COLORS.reset}\r\n> `);
            isRunning = false;
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

function deactivate() {
    if (remoteTerminal) remoteTerminal.dispose();
}

module.exports = { activate, deactivate };