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

/**
 * @param {vscode.ExtensionContext} context
 */
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
        const repoUrl = await vscode.window.showInputBox({ prompt: "GitHub Repository URL (SSH or HTTPS)" });
        if (!langChoice || !repoUrl) return;

        // --- AUTOMATIC SSH HANDSHAKE ---
        if (repoUrl.includes('git@github.com')) {
            try {
                const sshCmd = process.platform === 'win32' 
                    ? 'if not exist %USERPROFILE%\\.ssh mkdir %USERPROFILE%\\.ssh && ssh-keyscan -t rsa github.com >> %USERPROFILE%\\.ssh\\known_hosts'
                    : 'mkdir -p ~/.ssh && ssh-keyscan -t rsa github.com >> ~/.ssh/known_hosts';
                execSync(sshCmd, { stdio: 'ignore' });
            } catch (e) { /* Fallback for systems without ssh-keyscan */ }
        }

        // Folder structure
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
            execSync('git init -b main', { cwd: root });
            execSync(`git remote add origin ${repoUrl}`, { cwd: root });
            execSync('git add . && git commit -m "Setup Workspace"', { cwd: root });
            vscode.window.showInformationMessage("Workspace Ready! You can now edit the .yml to change versions.");
        } catch (e) { vscode.window.showWarningMessage("Git updated with new origin."); }
    });

    // --- RUN COMMAND ---
    let runCmd = vscode.commands.registerCommand('remote-runner.run', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root || isRunning) return;

        const inputPath = path.join(root, 'input/input.txt');
        if (!fs.existsSync(path.dirname(inputPath))) fs.mkdirSync(path.dirname(inputPath));
        
        // Detect current branch dynamically
        let branch = 'main';
        try { branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root }).toString().trim(); } catch(e) {}

        if (!remoteTerminal) {
            remoteTerminal = vscode.window.createTerminal({
                name: "Remote Runner Console",
                pty: {
                    onDidWrite: writeEmitter.event,
                    open: () => writeEmitter.fire(`${COLORS.cyan}--- Console Ready ---\r\n> `),
                    handleInput: data => {
                        // CLEAN INPUT HANDLING
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
            writeEmitter.fire(`\r\n${COLORS.yellow}[1/2] Syncing to GitHub (${branch})...${COLORS.reset}\r\n`);
            
            execSync('git add . && git commit --allow-empty -m "Remote Execution Request"', { cwd: root });
            execSync(`git push origin ${branch} --force`, { cwd: root });

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
                            writeEmitter.fire(CLEAR_LINE);
                            writeEmitter.fire(`${COLORS.green}${COLORS.bold}--- REMOTE OUTPUT ---${COLORS.reset}\r\n`);
                        }
                        const newChunk = currentLogs.substring(lastLogContent.length);
                        writeEmitter.fire(newChunk.replace(/\n/g, '\r\n'));
                        lastLogContent = currentLogs;
                        
                        if (currentLogs.includes("--- FINISHED ---")) {
                            writeEmitter.fire(`\r\n${COLORS.green}>>> Run Complete!${COLORS.reset}\r\n> `);
                            clearInterval(poller);
                            isRunning = false;
                        }
                    }
                } catch (e) {
                    if (attempts++ > 100) { // Extended timeout for heavy Java builds
                        writeEmitter.fire(CLEAR_LINE + `${COLORS.red}Timeout waiting for GitHub Action.${COLORS.reset}\r\n> `);
                        clearInterval(poller);
                        isRunning = false;
                    }
                }
            }, 1500); 

        } catch (err) {
            writeEmitter.fire(`\r\n${COLORS.red}Error: Push Failed. Ensure SSH keys are set up on GitHub.${COLORS.reset}\r\n> `);
            isRunning = false;
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

function deactivate() { if (remoteTerminal) remoteTerminal.dispose(); }

module.exports = { activate, deactivate };