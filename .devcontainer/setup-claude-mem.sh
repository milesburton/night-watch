#!/bin/bash
set -e

echo "==================================="
echo "Claude-Mem & OpenClaw Setup"
echo "==================================="

# Install Node packages globally
echo "Installing claude-mem..."
npm install -g claude-mem --silent

echo "Installing OpenClaw..."
npm install -g openclaw --silent

# Install UV for Python package management (required for Chroma vector DB)
echo "Installing UV (Python package manager)..."
if ! command -v uv &> /dev/null; then
    curl -fsSL https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

# Setup claude-mem plugin for Claude Code
echo "Setting up claude-mem plugin..."
mkdir -p ~/.claude/plugins/claude-mem

# Copy plugin files
cp -r /usr/lib/node_modules/claude-mem/plugin/* ~/.claude/plugins/claude-mem/

# Setup OpenClaw config directory (will be mounted from host)
mkdir -p ~/.openclaw

echo "==================================="
echo "✅ Setup Complete!"
echo ""
echo "Claude-mem and OpenClaw are installed."
echo "Note: OpenClaw credentials should be mounted from host machine."
echo "==================================="
