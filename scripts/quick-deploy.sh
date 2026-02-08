#!/bin/bash
# Quick deployment script for UI updates
# Usage: ./quick-deploy.sh [hostname/ip]

set -e

TARGET="${1:-rfcapture@raspberrypi-rfcapture.local}"
DEPLOY_PORT="${DEPLOY_PORT:-80}"

echo "🚀 Deploying UI updates to ${TARGET}..."
echo "   Port: ${DEPLOY_PORT}"
echo ""

# Pull latest changes
echo "📥 Pulling latest changes from Git..."
ssh -o ConnectTimeout=30 "${TARGET}" "cd /home/rfcapture/night-watch && git pull"

# Restart container
echo "🔄 Restarting container..."
ssh -o ConnectTimeout=30 "${TARGET}" "cd /home/rfcapture/night-watch && docker compose down && DEPLOY_PORT=${DEPLOY_PORT} docker compose up -d"

# Check status
echo "✅ Checking container status..."
ssh -o ConnectTimeout=30 "${TARGET}" "cd /home/rfcapture/night-watch && docker compose ps"

echo ""
echo "✨ Deployment complete!"
echo "   Access at: http://${TARGET#*@}:${DEPLOY_PORT}"
