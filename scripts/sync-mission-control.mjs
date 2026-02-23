#!/usr/bin/env node
/**
 * sync-mission-control.mjs
 * Generates /public/data/mission-control.json from local signal files.
 * Run before each Vercel deploy OR on a cron (via gateway agentTurn).
 *
 * Data sources (all local — no gateway API required):
 *   - Pro subscribers count:   pro-subscribers.json
 *   - Signal queue count:      telegram-delay-queue.json
 *   - Posts count:             telegram-post-log.json
 *   - Cron status:             log files in /data/workspace-shared/signals/
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGNALS   = '/data/workspace-shared/signals';
const OUT_PATH  = path.resolve(__dirname, '..', 'public', 'data', 'mission-control.json');

function loadJSON(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}

function tailLog(logFile, lines = 10) {
  try {
    return fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean).slice(-lines).join('\n');
  } catch { return ''; }
}

function parseLogStatus(logTail) {
  if (!logTail) return { status: 'unknown', lastRunAt: null };
  const lower = logTail.toLowerCase();
  const hasError = /error|failed|exception|✗/i.test(lower);
  const tsMatch = logTail.match(/\d{4}-\d{2}-\d{2}T[\d:.Z-]+/);
  return {
    status:    hasError ? 'error' : 'ok',
    lastRunAt: tsMatch ? tsMatch[0] : null,
  };
}

// Read signal files
const postLog    = loadJSON(`${SIGNALS}/telegram-post-log.json`, []);
const delayQueue = loadJSON(`${SIGNALS}/telegram-delay-queue.json`, []);
const proSubs    = loadJSON(`${SIGNALS}/pro-subscribers.json`, []);

const activePro  = proSubs.filter(s => s.active && s.expiry_ts > Date.now()).length;
const queuedSigs = delayQueue.filter(s => !s.sent).length;
const postedSigs = postLog.length;

// Parse log files for cron status
const signalBotLog     = tailLog(`${SIGNALS}/signal-bot.log`);
const queueProcLog     = tailLog(`${SIGNALS}/queue-processor.log`);
const resTrackerLog    = tailLog(`${SIGNALS}/resolution-tracker.log`);
const paymentBotLog    = tailLog(`${SIGNALS}/payment-bot.log`);

const signalBotStatus  = parseLogStatus(signalBotLog);
const queueProcStatus  = parseLogStatus(queueProcLog);
const resTrackerStatus = parseLogStatus(resTrackerLog);
const paymentBotStatus = parseLogStatus(paymentBotLog);

// Build cron list (known schedules hardcoded, status from logs)
const now = new Date();

function nextRun(cronExpr) {
  // Minimal next-run estimation for common patterns
  const [min, hr, dom, mon, dow] = cronExpr.split(' ');
  try {
    const d = new Date();
    if (min === '*/5')  { d.setMinutes(Math.ceil(d.getMinutes()/5)*5,0,0); }
    else if (min === '*/30') { d.setMinutes(Math.ceil(d.getMinutes()/30)*30,0,0); }
    else if (hr === '*') { d.setMinutes(parseInt(min)||0,0,0); d.setHours(d.getHours()+1); }
    else { d.setMinutes(parseInt(min)||0,0,0); d.setHours(parseInt(hr)||0); if (d < now) d.setDate(d.getDate()+1); }
    return d.toISOString();
  } catch { return null; }
}

const crons = [
  {
    id: '17a53784', name: 'builder-heartbeat',
    schedule: '0 */3 * * *', agentId: 'builder',
    ...signalBotStatus,
    nextRunAt: nextRun('0 */3 * * *'),
    lastDurationMs: null, consecutiveErrors: 0,
  },
  {
    id: 'prescience-signals', name: 'prescience-telegram-signals',
    schedule: '0 * * * *', agentId: 'builder',
    ...signalBotStatus,
    nextRunAt: nextRun('0 * * * *'),
    lastDurationMs: null, consecutiveErrors: signalBotStatus.status === 'error' ? 1 : 0,
  },
  {
    id: 'prescience-queue', name: 'prescience-queue-processor',
    schedule: '*/30 * * * *', agentId: 'builder',
    ...queueProcStatus,
    nextRunAt: nextRun('*/30 * * * *'),
    lastDurationMs: null, consecutiveErrors: queueProcStatus.status === 'error' ? 1 : 0,
  },
  {
    id: 'prescience-resolution', name: 'prescience-resolution-tracker',
    schedule: '15 */6 * * *', agentId: 'builder',
    ...resTrackerStatus,
    nextRunAt: nextRun('15 */6 * * *'),
    lastDurationMs: null, consecutiveErrors: resTrackerStatus.status === 'error' ? 1 : 0,
  },
  {
    id: 'payment-bot', name: 'telegram-payment-bot',
    schedule: '*/5 * * * *', agentId: 'builder',
    ...paymentBotStatus,
    nextRunAt: nextRun('*/5 * * * *'),
    lastDurationMs: null, consecutiveErrors: paymentBotStatus.status === 'error' ? 1 : 0,
  },
];

const snapshot = {
  generated_at: now.toISOString(),
  sync_source:  'sync-mission-control.mjs',
  crons,
  signals: {
    total_queued:    queuedSigs,
    total_posted:    postedSigs,
    pro_subscribers: activePro,
  },
};

// Write output
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2));
console.log(`[sync-mission-control] Written to ${OUT_PATH}`);
console.log(`  Crons: ${crons.length}, Pro subs: ${activePro}, Posted: ${postedSigs}, Queued: ${queuedSigs}`);

// Optional: git add + commit the updated file
if (process.argv.includes('--commit')) {
  try {
    execSync(`cd ${path.resolve(__dirname, '..')} && git add public/data/mission-control.json && git diff --cached --quiet || git commit -m "chore: sync mission control snapshot [skip ci]"`, { stdio:'inherit' });
    console.log('  Committed.');
  } catch { console.log('  Nothing to commit.'); }
}

if (process.argv.includes('--deploy')) {
  try {
    const creds = JSON.parse(fs.readFileSync('/data/.openclaw/credentials.json', 'utf-8'));
    const tok = creds.vercel_token;
    execSync(`cd ${path.resolve(__dirname, '..')} && npx vercel --prod --yes --token=${tok}`, { stdio:'inherit' });
    console.log('  Deployed.');
  } catch (e) { console.error('  Deploy failed:', e.message); }
}
