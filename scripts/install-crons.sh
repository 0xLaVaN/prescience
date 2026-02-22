#!/usr/bin/env bash
# Install Prescience cron jobs for the delayed posting queue pipeline
# Run once to register:
#   - Signal bot: hourly (detect signals → write to delay queue)
#   - Queue processor: every 5min (post past-due signals to free channel)
#   - Resolution tracker: every 6h (check resolved markets, post receipts)

set -euo pipefail

SIGNAL_BOT="node /data/workspace/prescience/scripts/telegram-signal-bot.mjs"
QUEUE_PROC="node /data/workspace/prescience/scripts/telegram-queue-processor.mjs"
RESOLUTION="node /data/workspace/prescience/scripts/resolution-tracker.mjs"
LOG_DIR="/data/workspace-shared/signals"

mkdir -p "$LOG_DIR"

# Remove old prescience cron lines, then add fresh ones
(crontab -l 2>/dev/null | grep -v 'telegram-signal-bot\|telegram-queue-processor\|resolution-tracker'; \
 echo "# Prescience: queue processor — every 5min"; \
 echo "*/5 * * * * $QUEUE_PROC >> $LOG_DIR/queue-processor.log 2>&1"; \
 echo "# Prescience: signal bot — hourly"; \
 echo "0 * * * * $SIGNAL_BOT >> $LOG_DIR/signal-bot.log 2>&1"; \
 echo "# Prescience: resolution tracker — every 6h"; \
 echo "15 */6 * * * $RESOLUTION >> $LOG_DIR/resolution-tracker.log 2>&1") | crontab -

echo "✅ Cron jobs installed:"
crontab -l | grep -E 'telegram|Prescience|resolution'
