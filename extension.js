const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let isRunning = false;
let writeEmitter = new vscode.EventEmitter();

function activate(context) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'remote-runner.run';
    statusBarItem.text = `$(cloud-upload) Run on Remote`;
    statusBarItem.show();

    // SETUP COMMAND
    let setupCmd = vscode.commands.registerCommand('remote-runner.setup', async () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return vscode.window.showErrorMessage("Open a folder first!");

        // 1. Request Repo URL
        const repoUrl = await vscode.window.showInputBox({
            prompt: "Enter your GitHub Repository URL (HTTPS or SSH)",
            placeHolder: "https://github.com/username/repo.git"
        });
        if (!repoUrl) return;

        // 2. Create Structure
        const dirs = ['src', 'input', 'logs', 'output', '.vscode', '.github/workflows'];
        dirs.forEach(d => fs.mkdirSync(path.join(root, d), { recursive: true }));

        // 3. Helper to copy templates
        const copyTemplate = (tempName, destPath) => {
            const tempPath = path.join(context.extensionPath, 'templates', tempName);
            const content = fs.readFileSync(tempPath, 'utf8');
            fs.writeFileSync(path.join(root, destPath), content);
        };

        copyTemplate('python_main.txt', 'src/main.py');
        copyTemplate('java_main.txt', 'src/Main.java');
        copyTemplate('workflow.txt', '.github/workflows/main.yml');
        copyTemplate('py_snippets.json', '.vscode/python.json');
        copyTemplate('java_snippets.json', '.vscode/java.json');
        
        // 4. Initialize Git
        try {
            execSync('git init', { cwd: root });
            execSync(`git remote add origin ${repoUrl}`, { cwd: root });
            execSync('git add . && git commit -m "Initial Remote Runner Setup"', { cwd: root });
            vscode.window.showInformationMessage("Workspace Ready! Remote linked to: " + repoUrl);
        } catch (e) {
            vscode.window.showWarningMessage("Git setup partially failed. Check if remote already exists.");
        }
    });

    // RUN COMMAND (Polling & Pushing)
    let runCmd = vscode.commands.registerCommand('remote-runner.run', async () => {
        if (isRunning) return;
        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const config = vscode.workspace.getConfiguration('remoteRunner');
        const student = config.get('studentName') || 'student1';

        const terminal = vscode.window.createTerminal({
            name: "Remote Runner",
            pty: {
                onDidWrite: writeEmitter.event,
                open: () => writeEmitter.fire('>>> Console Ready. Type inputs below:\r\n'),
                handleInput: data => {
                    writeEmitter.fire(data === '\r' ? '\r\n' : data);
                    fs.appendFileSync(path.join(root, 'input/input.txt'), data === '\r' ? '\n' : data);
                },
                close: () => {}
            }
        });
        terminal.show();

        try {
            isRunning = true;
            writeEmitter.fire('>>> Pushing to GitHub branch...\r\n');
            execSync(`git add . && git commit -m "Run" && git push origin HEAD:code/${student} --force`, { cwd: root });
            
            // Polling logic
            let attempts = 0;
            const poller = setInterval(() => {
                try {
                    execSync(`git fetch origin logs/code/${student}:remote_logs`, { cwd: root });
                    const logs = execSync(`git show remote_logs:logs/output.txt`, { cwd: root }).toString();
                    writeEmitter.fire(`\r\n--- REMOTE RESULT ---\r\n${logs.replace(/\n/g, '\r\n')}`);
                    clearInterval(poller);
                    isRunning = false;
                } catch (e) {
                    if (attempts++ > 30) {
                        writeEmitter.fire('\r\n>>> Timeout: No response from GitHub Actions.\r\n');
                        clearInterval(poller);
                        isRunning = false;
                    }
                }
            }, 4000);
        } catch (e) {
            writeEmitter.fire(`\r\nError: ${e.message}\r\n`);
            isRunning = false;
        }
    });

    context.subscriptions.push(setupCmd, runCmd);
}

module.exports = { activate };