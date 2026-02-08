#!/bin/bash
# Background deployment monitor - keeps trying until successful
# Usage: ./deploy-monitor.sh [hostname/ip] &

TARGET="${1:-rfcapture@raspberrypi-rfcapture.local}"
DEPLOY_PORT="${DEPLOY_PORT:-80}"
LOG_FILE="/tmp/deploy-monitor.log"

echo "🔄 Deploy monitor started at $(date)" | tee -a "$LOG_FILE"
echo "   Target: ${TARGET}" | tee -a "$LOG_FILE"
echo "   Port: ${DEPLOY_PORT}" | tee -a "$LOG_FILE"
echo "   Log: ${LOG_FILE}" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

attempt=1
while true; do
  echo "[Attempt $attempt] $(date +%H:%M:%S) - Testing connection..." >> "$LOG_FILE"

  if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "${TARGET}" "echo 'ok'" >/dev/null 2>&1; then
    echo "✅ CONNECTION ESTABLISHED at $(date)" | tee -a "$LOG_FILE"

    # Deploy
    echo "📥 Pulling changes..." | tee -a "$LOG_FILE"
    ssh -o ConnectTimeout=30 "${TARGET}" "cd /home/rfcapture/night-watch && git pull" | tee -a "$LOG_FILE"

    echo "🔄 Restarting container..." | tee -a "$LOG_FILE"
    ssh -o ConnectTimeout=30 "${TARGET}" "cd /home/rfcapture/night-watch && docker compose down && DEPLOY_PORT=${DEPLOY_PORT} docker compose up -d" | tee -a "$LOG_FILE"

    echo "✅ Deployment complete!" | tee -a "$LOG_FILE"
    ssh -o ConnectTimeout=30 "${TARGET}" "cd /home/rfcapture/night-watch && docker compose ps" | tee -a "$LOG_FILE"

    echo "" | tee -a "$LOG_FILE"
    echo "🎉 SUCCESS! Access at: http://${TARGET#*@}:${DEPLOY_PORT}" | tee -a "$LOG_FILE"
    exit 0
  fi

  # Wait before retry (longer between attempts to avoid spam)
  sleep 30
  attempt=$((attempt + 1))
done
