#!/usr/bin/env bash
# Install Prescience cron jobs for the delayed posting queue pipeline
# Run once to register:
#   - Signal bot: hourly (detect signals → write to delay queue)
#   - Queue processor: every 5min (post past-due signals to free channel)
#   - Resolution tracker: every 6h (check resolved markets, post receipts)
#   - Volume spike detector: every 30min (detect >5x volume surges → content briefs)
#   - Payment bot keepalive: every 5min (restart if not running)
#   - Payment bot expiry check: daily at 09:00 UTC

set -euo pipefail

SIGNAL_BOT="node /data/workspace/prescience/scripts/telegram-signal-bot.mjs"
QUEUE_PROC="node /data/workspace/prescience/scripts/telegram-queue-processor.mjs"
RESOLUTION="node /data/workspace/prescience/scripts/resolution-tracker.mjs"
VOL_SPIKE="node /data/workspace/prescience/scripts/volume-spike-detector.mjs"
PROOF_GEN="node /data/workspace/prescience/scripts/proof-of-call-generator.mjs"
PAYMENT_BOT="node /data/workspace/prescience/scripts/telegram-payment-bot.mjs"
LOG_DIR="/data/workspace-shared/signals"

mkdir -p "$LOG_DIR"

# Keepalive wrapper: start payment bot if not already running
PAYMENT_KEEPALIVE="pgrep -f 'telegram-payment-bot.mjs' > /dev/null || nohup $PAYMENT_BOT >> $LOG_DIR/payment-bot.log 2>&1 &"

# Remove old prescience cron lines, then add fresh ones
(crontab -l 2>/dev/null | grep -v 'telegram-signal-bot\|telegram-queue-processor\|resolution-tracker\|telegram-payment-bot\|volume-spike-detector\|proof-of-call-generator'; \
 echo "# Prescience: queue processor — every 5min"; \
 echo "*/5 * * * * $QUEUE_PROC >> $LOG_DIR/queue-processor.log 2>&1"; \
 echo "# Prescience: signal bot — hourly"; \
 echo "0 * * * * $SIGNAL_BOT >> $LOG_DIR/signal-bot.log 2>&1"; \
 echo "# Prescience: resolution tracker — every 6h"; \
 echo "15 */6 * * * $RESOLUTION >> $LOG_DIR/resolution-tracker.log 2>&1"; \
 echo "# Prescience: volume spike detector — every 30min"; \
 echo "*/30 * * * * $VOL_SPIKE >> $LOG_DIR/volume-spike-detector.log 2>&1"; \
 echo "# Prescience: proof-of-call generator — every 30min"; \
 echo "10,40 * * * * $PROOF_GEN >> $LOG_DIR/proof-generator.log 2>&1"; \
 echo "# Prescience: payment bot keepalive — every 5min"; \
 echo "*/5 * * * * $PAYMENT_KEEPALIVE"; \
 echo "# Prescience: payment bot expiry check — daily 09:00 UTC"; \
 echo "0 9 * * * $PAYMENT_BOT --check-expiry >> $LOG_DIR/payment-bot-expiry.log 2>&1") | crontab -

echo "✅ Cron jobs installed:"
crontab -l | grep -E 'telegram|Prescience|resolution|volume-spike|proof-of-call'
