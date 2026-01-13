const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let isRunning = false;
let writeEmitter = new vscode.EventEmitter();
let terminal;

function activate(context) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'remote-runner.run';
    statusBarItem.text = `$(play) Run on Remote`;
    statusBarItem.show();

    // SETUP COMMAND
    let setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            return vscode.window.showErrorMessage("Error: No workspace folder found. Open a folder first.");
        }

        const repoUrl = await vscode.window.showInputBox({ prompt: "GitHub Repo URL (HTTPS or SSH)" });
        if (!repoUrl) return;

        // Create folders
        ['src', 'input', 'logs', '.vscode', '.github/workflows'].forEach(d => 
            fs.mkdirSync(path.join(root, d), { recursive: true }));

        const copyTemp = (file, dest) => {
            const tPath = path.join(context.extensionPath, 'templates', file);
            if(fs.existsSync(tPath)) fs.writeFileSync(path.join(root, dest), fs.readFileSync(tPath));
        };

        copyTemp('python_main.txt', 'src/main.py');
        copyTemp('java_main.txt', 'src/Main.java');
        copyTemp('workflow.txt', '.github/workflows/main.yml');
        copyTemp('py_snippets.json', '.vscode/python.json');

        try {
            execSync('git init', { cwd: root });
            execSync(`git remote add origin ${repoUrl}`, { cwd: root });
            execSync('git add . && git commit -m "Initial setup"', { cwd: root });
            vscode.window.showInformationMessage("Workspace Setup Complete!");
        } catch (e) { console.log("Git already exists"); }
    });

    // RUN COMMAND
    let runCmd = vscode.commands.registerCommand('remote-runner.run', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root || isRunning) return;

        const student = vscode.workspace.getConfiguration('remoteRunner').get('studentName');

        if (!terminal) {
            terminal = vscode.window.createTerminal({
                name: "Remote Console",
                pty: {
                    onDidWrite: writeEmitter.event,
                    open: () => writeEmitter.fire('--- Console Ready ---\r\n'),
                    handleInput: data => {
                        writeEmitter.fire(data === '\r' ? '\r\n' : data);
                        fs.appendFileSync(path.join(root, 'input/input.txt'), data === '\r' ? '\n' : data);
                    },
                    close: () => { terminal = undefined; }
                }
            });
        }
        terminal.show();

        try {
            isRunning = true;
            writeEmitter.fire('>>> Pushing to Remote...\r\n');
            // FIX: added --allow-empty to prevent crash if no changes
            execSync('git add .', { cwd: root });
            execSync('git commit --allow-empty -m "Remote update"', { cwd: root });
            execSync(`git push origin HEAD:code/${student} --force`, { cwd: root });

            let attempts = 0;
            const poller = setInterval(() => {
                try {
                    execSync(`git fetch origin logs/code/${student}:remote_logs`, { cwd: root });
                    const logs = execSync(`git show remote_logs:logs/output.txt`, { cwd: root }).toString();
                    writeEmitter.fire(`\r\n--- OUTPUT ---\r\n${logs.replace(/\n/g, '\r\n')}\r\n`);
                    clearInterval(poller);
                    isRunning = false;
                } catch (e) {
                    if (attempts++ > 30) { clearInterval(poller); isRunning = false; }
                }
            }, 4000);
        } catch (err) {
            writeEmitter.fire(`Error: ${err.message}\r\n`);
            isRunning = false;
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

// FIX: Added proper deactivate
function deactivate() {
    if (terminal) terminal.dispose();
}

module.exports = { activate, deactivate };