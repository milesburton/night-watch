#!/bin/bash
#
# Setup automatic maintenance cron job
# This script adds a daily cron job to decode recordings and clean up failed files
#

CRON_SCHEDULE="0 3 * * *"  # Run at 3 AM daily
PROJECT_DIR="$HOME/night-watch"
LOG_FILE="/var/log/satellite-maintenance.log"

# Create log file if it doesn't exist
sudo touch "$LOG_FILE"
sudo chown $USER:$USER "$LOG_FILE"

# Create cron job
CRON_CMD="cd $PROJECT_DIR && docker compose -f docker/compose.yaml exec -T rfcapture npx tsx /app/src/backend/cli/commands/maintenance.ts --all >> $LOG_FILE 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "maintenance.ts"; then
    echo "Maintenance cron job already exists"
    echo "Current cron jobs:"
    crontab -l | grep "maintenance.ts"
else
    # Add cron job
    (crontab -l 2>/dev/null; echo "$CRON_SCHEDULE $CRON_CMD") | crontab -
    echo "✓ Maintenance cron job added successfully"
    echo "Schedule: $CRON_SCHEDULE (3 AM daily)"
fi

echo ""
echo "Current crontab:"
crontab -l | grep -v "^#" | grep -v "^$"
