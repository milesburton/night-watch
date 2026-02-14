# Claude-Mem Integration

This dev container includes **claude-mem** for persistent memory across Claude Code sessions.

## What It Does

- Automatically observes your work and tool usage
- Creates semantic summaries for context injection
- Enables searching past work via `/mem-search` command
- Web UI viewer at `http://localhost:37777`

## Getting Started

claude-mem works automatically after container build. No setup required.

```bash
# Verify installation
npm list -g claude-mem

# Access memory viewer
curl http://localhost:37777
```

## Key Directories

These are mounted from your host machine (persist across container rebuilds):

- `~/.claude` - Claude Code configuration
- `~/.claude-mem` - Memory database and settings
- `~/.openclaw` - Platform gateway configuration (optional)

⚠️ **Never commit these to git** — they contain API keys and private data.

## Search Past Work

Inside Claude Code, use:
```
/mem-search bug fix
/mem-search typescript error
/mem-search satellite tracking
```

## Documentation

Detailed setup and configuration:
- **Claude-Mem**: [docs.claude-mem.ai](https://docs.claude-mem.ai)
- **OpenClaw** (optional): [docs.openclaw.ai](https://docs.openclaw.ai)

## Troubleshooting

```bash
# Check if plugin is installed
ls ~/.claude/plugins/claude-mem

# View memory web UI
curl http://localhost:37777

# Check logs
cat ~/.claude-mem/claude-mem.log

# Reset (if corrupted)
rm -rf ~/.claude-mem && docker compose down && docker compose up
```

See [docs.claude-mem.ai](https://docs.claude-mem.ai/troubleshooting) for more help.
