# Claude-Mem Setup Guide

Claude-mem is a persistent memory system for Claude Code that automatically captures coding sessions and makes context available in future sessions.

## Installation (Claude Code Plugin)

**Important**: claude-mem is installed as a **Claude Code plugin**, not as an npm package.

### Steps:

1. Start a new Claude Code session in this workspace
2. Run the following commands in the chat:
   ```
   /plugin marketplace add thedotmack/claude-mem
   /plugin install claude-mem
   ```
3. Restart VS Code / Claude Code
4. Context from previous sessions will automatically appear in new sessions

## Features

- **Automatic capture**: Records tool usage and observations during sessions
- **Smart retrieval**: Uses semantic search to find relevant past context
- **Token efficiency**: Progressive disclosure approach
- **Web interface**: View memory stream at `http://localhost:37777`
- **Search tools**: Query history with `/mem-search` skill

## Privacy

Use `<private>` tags in your messages to exclude sensitive information from being captured:

```
<private>
API_KEY=secret-key-123
DATABASE_PASSWORD=sensitive-data
</private>
```

## Documentation

- GitHub: https://github.com/thedotmack/claude-mem
- Full docs: See repo README

## OpenClaw (Optional)

For advanced users running OpenClaw gateways, there's a one-command install:

```bash
curl -fsSL https://install.cmem.ai/openclaw.sh | bash
```

This handles dependencies, plugin setup, AI provider configuration, and worker startup.

**Note**: Standard Claude Code users don't need OpenClaw - just use the plugin installation above.
