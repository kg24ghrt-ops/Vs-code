# Remote Runner

Remote Runner is a VS Code extension designed for environments where local code execution is restricted or requires standard hardware. It syncs code to GitHub Actions and streams results back.

## Features
- **Auto-Setup**: Generates project structure (`src`, `input`, `logs`).
- **Pseudo-terminal**: Interactive input handling for Python and Java.
- **GitHub Integration**: Uses Git branches to manage student code and output logs.

## Requirements
- Git installed and authenticated.
- A GitHub repository to act as the runner host.

## Extension Settings
- `remoteRunner.studentName`: Set your unique identifier for branching.