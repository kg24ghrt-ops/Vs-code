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

function activate(context) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'remote-runner.run';
    statusBarItem.text = `$(play) Run on Remote`;
    statusBarItem.show();

    // SETUP WORKSPACE
    let setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return vscode.window.showErrorMessage("Please open a folder first!");

        const lang = await vscode.window.showQuickPick(['Python', 'Java'], { placeHolder: 'Select Project Language' });
        if (!lang) return;

        const repoUrl = await vscode.window.showInputBox({ prompt: "GitHub Repo URL (HTTPS/SSH)" });
        if (!repoUrl) return;

        let name = await vscode.window.showInputBox({ 
            prompt: "Student Name",
            validateInput: text => /^[a-zA-Z0-9-]+$/.test(text) ? null : "Only alphanumeric and hyphens allowed."
        });
        const studentName = name || 'student1';
        await vscode.workspace.getConfiguration('remoteRunner').update('studentName', studentName, true);

        // Build Structure
        ['src', 'input', 'logs', '.vscode', '.github/workflows'].forEach(d => 
            fs.mkdirSync(path.join(root, d), { recursive: true }));

        const copy = (src, dest) => {
            const tPath = path.join(context.extensionPath, 'templates', src);
            if (fs.existsSync(tPath)) fs.writeFileSync(path.join(root, dest), fs.readFileSync(tPath));
        };

        if (lang === 'Python') {
            copy('python_main.txt', 'src/main.py');
            copy('py_workflow.txt', '.github/workflows/main.yml');
        } else {
            copy('java_main.txt', 'src/Main.java');
            copy('java_workflow.txt', '.github/workflows/main.yml');
        }

        try {
            try { execSync('git init -b main', { cwd: root }); } catch(e) {}
            try { execSync(`git remote add origin ${repoUrl}`, { cwd: root }); } catch(e) {}
            execSync('git add . && git commit -m "Initial Remote Runner Setup"', { cwd: root });
            vscode.window.showInformationMessage(`Project initialized for ${studentName}!`);
        } catch (err) {
            vscode.window.showErrorMessage("Git Error: " + err.message);
        }
    });

    // RUN ON REMOTE
    let runCmd = vscode.commands.registerCommand('remote-runner.run', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root || isRunning) return;

        const config = vscode.workspace.getConfiguration('remoteRunner');
        const pollInt = config.get('pollInterval') || 4000;
        const inputPath = path.join(root, 'input/input.txt');

        // Ensure input exists and is empty
        if (!fs.existsSync(path.join(root, 'input'))) fs.mkdirSync(path.join(root, 'input'));
        fs.writeFileSync(inputPath, '');

        if (!remoteTerminal) {
            remoteTerminal = vscode.window.createTerminal({
                name: "Remote Runner Console",
                pty: {
                    onDidWrite: writeEmitter.event,
                    open: () => writeEmitter.fire(`${COLORS.cyan}${COLORS.bold}--- Remote Console Ready ---${COLORS.reset}\r\n> `),
                    handleInput: data => {
                        if (data === '\r') {
                            writeEmitter.fire('\r\n> ');
                            fs.appendFileSync(inputPath, '\n');
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
            
            execSync('git add . && git commit --allow-empty -m "Remote Execution Request"', { cwd: root });
            execSync(`git push origin main --force`, { cwd: root });

            writeEmitter.fire(`${COLORS.yellow}[2/2] Awaiting Results...${COLORS.reset}\r\n`);

            let attempts = 0;
            const poller = setInterval(() => {
                try {
                    execSync('git fetch origin logs:remote_logs --force', { cwd: root });
                    const logs = execSync('git show remote_logs:logs/output.txt', { cwd: root }).toString();
                    
                    writeEmitter.fire(`\r\n${COLORS.green}${COLORS.bold}--- REMOTE OUTPUT ---${COLORS.reset}\r\n`);
                    writeEmitter.fire(`${logs.replace(/\n/g, '\r\n')}\r\n`);
                    writeEmitter.fire(`${COLORS.green}${COLORS.bold}>>> Run Complete!${COLORS.reset}\r\n> `);
                    
                    vscode.window.showInformationMessage("Remote Run Complete!");
                    clearInterval(poller);
                    isRunning = false;
                } catch (e) {
                    if (attempts++ > 45) {
                        writeEmitter.fire(`\r\n${COLORS.red}[Error] Timeout waiting for logs.${COLORS.reset}\r\n> `);
                        clearInterval(poller);
                        isRunning = false;
                    }
                }
            }, pollInt);
        } catch (err) {
            writeEmitter.fire(`\r\n${COLORS.red}[Git Error] ${err.message}${COLORS.reset}\r\n> `);
            isRunning = false;
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

function deactivate() { if (remoteTerminal) remoteTerminal.dispose(); }

module.exports = { activate, deactivate };