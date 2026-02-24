#!/usr/bin/env node
/**
 * Syncs signal data from workspace-shared into public/data/scorecard.json
 * Run before deploy to ensure scorecard page has fresh data on Vercel.
 *
 * Usage:
 *   node sync-scorecard.mjs              # just write the JSON
 *   node sync-scorecard.mjs --commit     # write + git commit
 *   node sync-scorecard.mjs --commit --deploy  # write + commit + vercel deploy
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POST_LOG = '/data/workspace-shared/signals/telegram-post-log.json';
const RECEIPTS = '/data/workspace-shared/signals/resolution-receipts.json';
const OUT = path.resolve(__dirname, '..', 'public', 'data', 'scorecard.json');

function load(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; } }

const postLog = load(POST_LOG);
const receipts = load(RECEIPTS);
const resolvedSlugs = new Set(receipts.map(r => r.slug));

// Deduplicate post log by slug — keep latest signal per slug (bot sometimes re-signals same market)
const latestBySlug = {};
for (const p of postLog) {
  if (!p.slug) continue;
  if (!latestBySlug[p.slug] || new Date(p.timestamp) > new Date(latestBySlug[p.slug].timestamp)) {
    latestBySlug[p.slug] = p;
  }
}
const deduplicatedLog = Object.values(latestBySlug);

const openCalls = deduplicatedLog.filter(p => !resolvedSlugs.has(p.slug)).map(p => ({
  slug: p.slug,
  question: p.question,
  signal_score: p.score || p.threat_score,
  entry_price: p.yesPrice,
  flow_direction: p.flowDirection,
  called_at: p.timestamp,
  status: 'open',
}));

const resolvedCalls = receipts.map(r => ({
  slug: r.slug,
  question: r.question || r.market,
  // resolution-tracker writes signalScore / signalYesPrice / signalTimestamp
  signal_score: r.signal_score || r.signalScore,
  entry_price: r.entry_price || r.signalYesPrice,
  outcome: r.outcome,
  pnl: r.pnl,
  called_at: r.called_at || r.signalTimestamp,
  resolved_at: r.resolved_at || r.resolvedAt,
  status: 'resolved',
  correct: r.correct,
}));

const allCalls = [...resolvedCalls, ...openCalls].sort((a, b) => new Date(b.called_at) - new Date(a.called_at));
const resolved = resolvedCalls.filter(c => c.outcome);
const wins = resolved.filter(c => c.correct === true).length;

// Parse pnl strings like "+72.4%" or "-100.0%" into numbers for sum
function parsePnl(pnlStr) {
  if (!pnlStr || pnlStr === 'N/A') return 0;
  return parseFloat(String(pnlStr).replace('%','').replace('+','')) || 0;
}

const data = {
  stats: {
    total_calls: allCalls.length,
    resolved: resolved.length,
    open: openCalls.length,
    wins,
    losses: resolved.length - wins,
    win_rate: resolved.length > 0 ? (wins / resolved.length * 100).toFixed(1) : null,
    cumulative_pnl: resolved.length > 0
      ? (resolved.reduce((s, r) => s + parsePnl(r.pnl), 0) / resolved.length).toFixed(1) + '%'
      : null,
  },
  calls: allCalls,
  updated_at: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
console.log(`Synced ${allCalls.length} calls (${resolved.length} resolved, ${openCalls.length} open) → ${OUT}`);

// Optional: git commit
if (process.argv.includes('--commit')) {
  try {
    execSync(
      `cd ${path.resolve(__dirname, '..')} && git add public/data/scorecard.json && git diff --cached --quiet || git commit -m "chore: sync scorecard snapshot [skip ci]"`,
      { stdio: 'inherit' }
    );
    console.log('  Committed.');
  } catch { console.log('  Nothing to commit.'); }
}

// Optional: Vercel deploy
if (process.argv.includes('--deploy')) {
  try {
    const creds = JSON.parse(fs.readFileSync('/data/.openclaw/credentials.json', 'utf-8'));
    const tok = creds.vercel_token;
    execSync(
      `cd ${path.resolve(__dirname, '..')} && npx vercel --prod --yes --token=${tok}`,
      { stdio: 'inherit' }
    );
    console.log('  Deployed to Vercel.');
  } catch (e) { console.error('  Deploy failed:', e.message); }
}
