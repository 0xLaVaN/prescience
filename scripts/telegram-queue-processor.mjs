#!/usr/bin/env node
/**
 * Prescience Telegram Queue Processor
 *
 * Reads the delay queue and posts any signals past their send_at time
 * to the free Telegram channel. Designed to run every 5 minutes via cron.
 *
 * Queue file: /data/workspace-shared/signals/telegram-delay-queue.json
 *
 * Flow:
 *   1. Read queue
 *   2. Find entries where send_at <= now AND status === 'pending'
 *   3. Post each to Telegram free channel (-5124728560)
 *   4. Mark as 'sent' or 'failed' with timestamp
 *   5. Write queue back (keeps history for audit; clean after 7 days)
 *
 * Future: Pro DM subscribers get instant delivery from the signal bot
 * (skip queue entirely). This processor only handles free-channel delay.
 *
 * Usage:
 *   node telegram-queue-processor.mjs [--dry]
 *   --dry  Print what would be sent without calling Telegram API
 *
 * Env vars (from .env or environment):
 *   PRESCIENCE_BOT_TOKEN — Telegram bot token
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from prescience root
const envPath = path.resolve(__dirname, '..', '.env');
try {
  const envFile = fs.readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch {}

const BOT_TOKEN = process.env.PRESCIENCE_BOT_TOKEN;
const FREE_CHANNEL_ID = '-5124728560';
const QUEUE_PATH = '/data/workspace-shared/signals/telegram-delay-queue.json';
const QUEUE_RETENTION_DAYS = 7; // Keep sent/failed entries for audit, then purge

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');

if (!BOT_TOKEN) {
  console.error(JSON.stringify({ error: 'Missing PRESCIENCE_BOT_TOKEN' }));
  process.exit(1);
}

// --- Queue I/O ---

function loadQueue() {
  try {
    const raw = fs.readFileSync(QUEUE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return []; // No queue yet — that's fine
    throw new Error(`Failed to read queue: ${err.message}`);
  }
}

function saveQueue(queue) {
  // Purge old completed entries
  const cutoff = Date.now() - QUEUE_RETENTION_DAYS * 86400000;
  const cleaned = queue.filter(entry => {
    if (entry.status === 'pending') return true; // Keep all pending
    const ts = entry.sent_at || entry.failed_at || entry.queued_at;
    return new Date(ts).getTime() > cutoff;
  });

  const dir = path.dirname(QUEUE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(cleaned, null, 2));
  return cleaned;
}

// --- Telegram API ---

async function sendTelegram(chatId, text) {
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
  return data.result;
}

// --- Main ---

async function main() {
  try {
    const queue = loadQueue();
    const now = Date.now();

    // Find entries ready to send (past their send_at time, still pending)
    const ready = queue.filter(entry =>
      entry.status === 'pending' &&
      new Date(entry.send_at).getTime() <= now
    );

    if (ready.length === 0) {
      const pending = queue.filter(e => e.status === 'pending');
      const nextSend = pending.length > 0
        ? pending.sort((a, b) => new Date(a.send_at) - new Date(b.send_at))[0]
        : null;

      console.log(JSON.stringify({
        processed: 0,
        pending: pending.length,
        nextSend: nextSend ? {
          question: nextSend.question,
          send_at: nextSend.send_at,
          inMinutes: Math.ceil((new Date(nextSend.send_at).getTime() - now) / 60000),
        } : null,
        dryRun,
      }, null, 2));
      return;
    }

    console.log(`🕐 Found ${ready.length} signal(s) ready to post`);

    const results = { sent: [], failed: [] };

    for (const entry of ready) {
      // Use the stored chat_id or fall back to the free channel
      const chatId = entry.chat_id || FREE_CHANNEL_ID;

      if (dryRun) {
        console.log(`[DRY RUN] Would post to ${chatId}: ${entry.question} (score ${entry.score})`);
        console.log(`  Queued at: ${entry.queued_at}`);
        console.log(`  Send at:   ${entry.send_at}`);
        console.log(`  Delay was: ${Math.round((now - new Date(entry.queued_at).getTime()) / 60000)}min`);
        console.log('  Message preview:');
        console.log(entry.message.split('\n').map(l => '    ' + l).join('\n'));
        results.sent.push({ id: entry.id, slug: entry.slug, question: entry.question, dryRun: true });
        continue;
      }

      try {
        const result = await sendTelegram(chatId, entry.message);
        entry.status = 'sent';
        entry.sent_at = new Date().toISOString();
        entry.telegram_message_id = result?.message_id || null;
        console.log(`✅ Sent: ${entry.question} (score ${entry.score}) → msg_id ${result?.message_id}`);
        results.sent.push({ id: entry.id, slug: entry.slug, question: entry.question });
      } catch (err) {
        entry.status = 'failed';
        entry.failed_at = new Date().toISOString();
        entry.error = err.message;
        console.error(`❌ Failed: ${entry.question}: ${err.message}`);
        results.failed.push({ id: entry.id, slug: entry.slug, question: entry.question, error: err.message });
      }

      // Small delay between posts to avoid Telegram rate limits
      if (ready.indexOf(entry) < ready.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!dryRun) {
      const finalQueue = saveQueue(queue);
      const stillPending = finalQueue.filter(e => e.status === 'pending');
      const nextPending = stillPending.sort((a, b) => new Date(a.send_at) - new Date(b.send_at))[0];

      console.log(JSON.stringify({
        processed: ready.length,
        sent: results.sent.length,
        failed: results.failed.length,
        sentSignals: results.sent,
        failedSignals: results.failed,
        remainingPending: stillPending.length,
        nextSend: nextPending ? {
          question: nextPending.question,
          send_at: nextPending.send_at,
          inMinutes: Math.ceil((new Date(nextPending.send_at).getTime() - now) / 60000),
        } : null,
        dryRun: false,
      }, null, 2));
    } else {
      console.log(JSON.stringify({
        processed: ready.length,
        sent: results.sent.length,
        failed: 0,
        dryRun: true,
        note: 'Dry run — queue not modified',
      }, null, 2));
    }

  } catch (err) {
    console.error(JSON.stringify({ error: err.message, stack: err.stack }));
    process.exit(1);
  }
}

main();
