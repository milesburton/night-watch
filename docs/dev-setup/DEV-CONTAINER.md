# VS Code Dev Container Setup

Night Watch includes a VS Code dev container for consistent development environments across machines.

## What's Included

The dev container automatically installs:

**Languages & Runtimes:**
- Node.js 22.x LTS
- npm 10.x package manager
- tsx (for running TypeScript directly)

**Development Tools:**
- Git & GitLens
- ESLint integration
- Prettier code formatter
- Python 3 + test debugging
- Docker CLI inside container
- VS Code Remote SSH tools

**Claude AI & Extensions:**
- Anthropic Claude for VS Code
- GitHub Copilot
- GitHub Copilot Chat
- SQLite database browser
- Thunder Client (REST API tester)
- Biome code quality tool
- Material Icon Theme

## Getting Started

### Option 1: GitHub Codespaces (Easiest)

```bash
git clone https://github.com/milesburton/night-watch.git
cd night-watch
# Open in GitHub Codespaces from the Code dropdown
```

### Option 2: Local VS Code

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
2. Install [VS Code](https://code.visualstudio.com/) + [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
3. Clone the repo:
   ```bash
   git clone https://github.com/milesburton/night-watch.git
   cd night-watch
   ```
4. Open in VS Code: `code .`
5. When prompted: **"Reopen in Container"**

VS Code will build the container and open this project inside it automatically.

## Persistent Directories

The container mounts these directories from your host machine (survive container rebuilds):

| Host Path | Container | Purpose |
|-----------|-----------|---------|
| `~/.claude` | `/root/.claude` | Claude Code plugins & config |
| `~/.claude-mem` | `/root/.claude-mem` | Memory persistence |
| `~/.config/claude` | `/home/node/.config/claude` | User permissions |

On first run, these will be created automatically.

## First Run

After the container finishes building (~2 minutes):

```bash
# Terminal opens automatically with prompt to run:
npm install  # Install dependencies

# Then you can:
npm start           # Start development server
npm test            # Run 230+ tests
npm run typecheck   # Check TypeScript
```

## Available Commands

```bash
# Development
npm start              # Run backend + frontend in watch mode
npm run dev            # Same as start

# Testing
npm test               # Run vitest (230+ tests)
npm run test:watch     # Watch mode
npm run coverage       # Code coverage report

# Code Quality
npm run typecheck      # TypeScript check
npm run lint           # Biome linter

# Building
npm run build          # Build for production
cd src/frontend && npm run build  # Build frontend only

# Utilities
npm run predict        # Show next satellite passes
npm run status         # System status
npx tsx src/backend/cli/main.ts --help  # CLI help
```

## IDE Features

**VS Code will auto-launch:**
- TypeScript IntelliSense (autocomplete, go-to-definition)
- ESLint error highlighting
- Prettier on save (format code)
- GitLens blame & history
- Biome code quality
- Docker container management
- Claude Code Assistant

## Troubleshooting

### Container Won't Start

```bash
# Rebuild from scratch
F1 > Dev Containers: Rebuild Container
```

### Dependencies Not Installed

```bash
# In VS Code terminal:
npm install
```

### Port Already in Use (3000, 3001)

```bash
# Kill existing processes
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9

# Or restart container
F1 > Dev Containers: Restart Container
```

## Documentation

- **[Quick Start](../QUICKSTART.md)** - Get running 5 minutes
- **[Claude-Mem Setup](CLAUDE-MEM.md)** - Persistent AI memory
- **[API Reference](../API.md)** - Backend endpoints

## See Also

- [VS Code Dev Containers Docs](https://containers.dev/)
- [GitHub Codespaces Docs](https://docs.github.com/en/codespaces)
