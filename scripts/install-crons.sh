#!/usr/bin/env bash
# Install Prescience cron jobs for the delayed posting queue pipeline
# Run once to register:
#   - Signal bot: hourly (detect signals → write to delay queue)
#   - Queue processor: every 5min (post past-due signals to free channel)

set -euo pipefail

SIGNAL_BOT="node /data/workspace/prescience/scripts/telegram-signal-bot.mjs"
QUEUE_PROC="node /data/workspace/prescience/scripts/telegram-queue-processor.mjs"
LOG_DIR="/data/workspace-shared/signals"

mkdir -p "$LOG_DIR"

# Remove old prescience cron lines, then add fresh ones
(crontab -l 2>/dev/null | grep -v 'telegram-signal-bot\|telegram-queue-processor'; \
 echo "# Prescience: queue processor — every 5min"; \
 echo "*/5 * * * * $QUEUE_PROC >> $LOG_DIR/queue-processor.log 2>&1"; \
 echo "# Prescience: signal bot — hourly"; \
 echo "0 * * * * $SIGNAL_BOT >> $LOG_DIR/signal-bot.log 2>&1") | crontab -

echo "✅ Cron jobs installed:"
crontab -l | grep -E 'telegram|Prescience'
