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

    // SETUP COMMAND
    let setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const langChoice = await vscode.window.showQuickPick(['Python', 'Java'], { placeHolder: 'Select Language' });
        if (!langChoice) return;

        const repoUrl = await vscode.window.showInputBox({ prompt: "GitHub Repository URL" });
        if (!repoUrl) return;

        // Folders creation
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
            vscode.window.showInformationMessage("Workspace Ready. You can edit the .yml file to change Python/Java versions.");
        } catch (e) { vscode.window.showWarningMessage("Git initialized with existing settings."); }
    });

    // RUN COMMAND
    let runCmd = vscode.commands.registerCommand('remote-runner.run', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root || isRunning) return;

        // Determine current branch dynamically
        let branch = 'main';
        try {
            branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root }).toString().trim();
        } catch(e) { branch = 'main'; }

        if (!remoteTerminal) {
            remoteTerminal = vscode.window.createTerminal({
                name: "Remote Runner Console",
                pty: {
                    onDidWrite: writeEmitter.event,
                    open: () => writeEmitter.fire(`${COLORS.cyan}--- Console Ready ---\r\n> `),
                    handleInput: data => {
                        if (data === '\r') {
                            writeEmitter.fire('\r\n> ');
                            fs.appendFileSync(path.join(root, 'input/input.txt'), '\n');
                        } else {
                            writeEmitter.fire(data);
                            fs.appendFileSync(path.join(root, 'input/input.txt'), data);
                        }
                    },
                    close: () => { remoteTerminal = null; }
                }
            });
        }
        remoteTerminal.show();

        try {
            isRunning = true;
            writeEmitter.fire(`\r\n${COLORS.yellow}[1/2] Syncing ${branch} to GitHub...${COLORS.reset}\r\n`);
            
            execSync('git add . && git commit --allow-empty -m "Remote Run"', { cwd: root });
            execSync(`git push origin ${branch} --force`, { cwd: root });

            const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            let frameIdx = 0, lastLogContent = "", attempts = 0;

            writeEmitter.fire(`${COLORS.yellow}[2/2] Running Remote Actions...  ${COLORS.reset}`);

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
                            clearInterval(poller);
                            isRunning = false;
                            writeEmitter.fire(`\r\n${COLORS.green}>>> Execution Complete.${COLORS.reset}\r\n> `);
                        }
                    }
                } catch (e) {
                    if (attempts++ > 60) {
                        clearInterval(poller);
                        isRunning = false;
                        writeEmitter.fire(CLEAR_LINE + `${COLORS.red}Timeout waiting for logs.${COLORS.reset}\r\n> `);
                    }
                }
            }, 1500); // Polling slightly faster for "Any Version" responsiveness

        } catch (err) {
            writeEmitter.fire(`\r\n${COLORS.red}Error: ${err.message}${COLORS.reset}\r\n> `);
            isRunning = false;
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

function deactivate() { if (remoteTerminal) remoteTerminal.dispose(); }

module.exports = { activate, deactivate };