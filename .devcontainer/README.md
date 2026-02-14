# Development Container Documentation

This directory contains VS Code dev container configuration. For actual documentation, see:

## Quick Links

- **[Dev Container Setup Guide](../docs/dev-setup/DEV-CONTAINER.md)** ← Start here
- **[Claude-Mem Integration](../docs/dev-setup/CLAUDE-MEM.md)** - Persistent AI memory
- **[Main Documentation Index](../docs/README.md)** - All docs navigation

## What's Here

- `Dockerfile` - Container image definition
- `devcontainer.json` - VS Code container configuration  
- `setup-claude-mem.sh` - Claude-mem installation script

## Getting Started

1. **Install VS Code extensions**:
   - [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
   - [Docker](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker)

2. **Open in container**:
   - Open this folder in VS Code
   - When prompted: "Reopen in Container"

3. **Read the docs**:
   - See [docs/dev-setup/DEV-CONTAINER.md](../docs/dev-setup/DEV-CONTAINER.md) for detailed setup

That's it! The container will build automatically with all tools, extensions, and dependencies installed.

## Architecture

```
.devcontainer/
  ├── Dockerfile          # Builds container image
  ├── devcontainer.json   # VS Code settings & extensions
  └── setup-claude-mem.sh # Claude-mem installer

docs/dev-setup/
  ├── DEV-CONTAINER.md    # ← Full setup documentation
  ├── CLAUDE-MEM.md       # ← Memory integration guide
  └── [configuration shared with .devcontainer/]

docker/                   # ← Production containers
```

The dev container can be thought of as a "development-specific" variant of the production Docker setup, configured specifically for VS Code.
