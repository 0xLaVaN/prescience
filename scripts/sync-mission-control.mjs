#!/usr/bin/env node
/**
 * sync-mission-control.mjs
 * Generates /public/data/mission-control.json from gateway cron data + signal files.
 * Run before each Vercel deploy OR via gateway cron every 15min.
 *
 * Data sources:
 *   - Cron jobs + run history: /data/.openclaw/cron/jobs.json + runs/*.jsonl
 *   - Pro subscribers count:   pro-subscribers.json  (signals dir)
 *   - Signal queue count:      telegram-delay-queue.json
 *   - Posts count:             telegram-post-log.json
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGNALS   = '/data/workspace-shared/signals';
const CRON_JOBS = '/data/.openclaw/cron/jobs.json';
const CRON_RUNS = '/data/.openclaw/cron/runs';
const OUT_PATH  = path.resolve(__dirname, '..', 'public', 'data', 'mission-control.json');

function loadJSON(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}

/**
 * Read the last run record for a job from its .jsonl file.
 * Returns { status, lastRunAt, lastDurationMs, nextRunAt, consecutiveErrors, lastError }
 */
function getLastRun(jobId) {
  try {
    const runsFile = path.join(CRON_RUNS, `${jobId}.jsonl`);
    if (!fs.existsSync(runsFile)) return { status: 'unknown', lastRunAt: null, lastDurationMs: null, nextRunAt: null, consecutiveErrors: 0, lastError: null };

    const lines = fs.readFileSync(runsFile, 'utf-8')
      .trim().split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    if (!lines.length) return { status: 'unknown', lastRunAt: null, lastDurationMs: null, nextRunAt: null, consecutiveErrors: 0, lastError: null };

    // Find the last "finished" entry
    const finished = lines.filter(l => l.action === 'finished');
    const last = finished.length ? finished[finished.length - 1] : lines[lines.length - 1];

    // Count consecutive errors from end
    let consecutiveErrors = 0;
    for (let i = finished.length - 1; i >= 0; i--) {
      if (finished[i].status === 'error') consecutiveErrors++;
      else break;
    }

    return {
      status:          last.status || 'unknown',
      lastRunAt:       last.runAtMs   ? new Date(last.runAtMs).toISOString()   : null,
      lastDurationMs:  last.durationMs || null,
      nextRunAt:       last.nextRunAtMs ? new Date(last.nextRunAtMs).toISOString() : null,
      consecutiveErrors,
      lastError:       last.status === 'error' ? (last.summary || 'Unknown error') : null,
    };
  } catch (e) {
    return { status: 'unknown', lastRunAt: null, lastDurationMs: null, nextRunAt: null, consecutiveErrors: 0, lastError: null };
  }
}

/**
 * Format a cron schedule for display.
 */
function fmtSchedule(job) {
  if (!job.schedule) return '?';
  const s = job.schedule;
  if (s.kind === 'every') {
    const ms = s.everyMs;
    if (ms < 60000) return `every ${ms/1000}s`;
    if (ms < 3600000) return `every ${ms/60000}m`;
    if (ms < 86400000) return `every ${ms/3600000}h`;
    return `every ${ms/86400000}d`;
  }
  if (s.kind === 'cron') return s.expr;
  if (s.kind === 'at')   return `at ${s.at}`;
  return JSON.stringify(s);
}

// ── Read gateway cron jobs ────────────────────────────────────────────
const cronData = loadJSON(CRON_JOBS, { jobs: [] });
const allJobs  = cronData.jobs || [];

// Include enabled jobs only (skip disabled ones)
const activeJobs = allJobs.filter(j => j.enabled !== false);

const crons = activeJobs.map(job => {
  const run = getLastRun(job.id);
  return {
    id:               job.id,
    name:             job.name,
    schedule:         fmtSchedule(job),
    agentId:          job.agentId,
    status:           run.status,
    lastRunAt:        run.lastRunAt,
    lastDurationMs:   run.lastDurationMs,
    nextRunAt:        run.nextRunAt,
    consecutiveErrors: run.consecutiveErrors,
    lastError:        run.lastError,
  };
});

// Sort: errors first, then by name
crons.sort((a, b) => {
  if (a.status === 'error' && b.status !== 'error') return -1;
  if (b.status === 'error' && a.status !== 'error') return  1;
  return a.name.localeCompare(b.name);
});

// ── Read signal pipeline data ─────────────────────────────────────────
const postLog    = loadJSON(`${SIGNALS}/telegram-post-log.json`, []);
const delayQueue = loadJSON(`${SIGNALS}/telegram-delay-queue.json`, []);
const proSubs    = loadJSON(`${SIGNALS}/pro-subscribers.json`, []);

const activePro  = Array.isArray(proSubs) ? proSubs.filter(s => s.active && s.expiry_ts > Date.now()).length : 0;
const queuedSigs = Array.isArray(delayQueue) ? delayQueue.filter(s => !s.sent).length : 0;
const postedSigs = Array.isArray(postLog) ? postLog.length : 0;

// ── Build snapshot ────────────────────────────────────────────────────
const snapshot = {
  generated_at: new Date().toISOString(),
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
console.log(`  Crons: ${crons.length} active (${crons.filter(c=>c.status==='ok').length} ok, ${crons.filter(c=>c.status==='error').length} error, ${crons.filter(c=>c.status==='unknown').length} unknown)`);
console.log(`  Pro subs: ${activePro}, Posted: ${postedSigs}, Queued: ${queuedSigs}`);

// Optional: git commit
if (process.argv.includes('--commit')) {
  try {
    execSync(`cd ${path.resolve(__dirname, '..')} && git add public/data/mission-control.json && git diff --cached --quiet || git commit -m "chore: sync mission control snapshot [skip ci]"`, { stdio:'inherit' });
    console.log('  Committed.');
  } catch { console.log('  Nothing to commit.'); }
}

// Optional: Vercel deploy
if (process.argv.includes('--deploy')) {
  try {
    const creds = JSON.parse(fs.readFileSync('/data/.openclaw/credentials.json', 'utf-8'));
    const tok = creds.vercel_token;
    execSync(`cd ${path.resolve(__dirname, '..')} && npx vercel --prod --yes --token=${tok}`, { stdio:'inherit' });
    console.log('  Deployed.');
  } catch (e) { console.error('  Deploy failed:', e.message); }
}
