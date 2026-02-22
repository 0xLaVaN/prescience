#!/usr/bin/env node
/**
 * Syncs signal data from workspace-shared into public/data/scorecard.json
 * Run before deploy to ensure scorecard page has fresh data on Vercel.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POST_LOG = '/data/workspace-shared/signals/telegram-post-log.json';
const RECEIPTS = '/data/workspace-shared/signals/resolution-receipts.json';
const OUT = path.resolve(__dirname, '..', 'public', 'data', 'scorecard.json');

function load(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; } }

const postLog = load(POST_LOG);
const receipts = load(RECEIPTS);
const resolvedSlugs = new Set(receipts.map(r => r.slug));

const openCalls = postLog.filter(p => !resolvedSlugs.has(p.slug)).map(p => ({
  slug: p.slug, question: p.question, signal_score: p.score || p.threat_score,
  entry_price: p.yesPrice, flow_direction: p.flowDirection, called_at: p.timestamp, status: 'open',
}));

const resolvedCalls = receipts.map(r => ({
  slug: r.slug, question: r.question || r.market, signal_score: r.signal_score,
  entry_price: r.entry_price, outcome: r.outcome, pnl: r.pnl,
  called_at: r.called_at, resolved_at: r.resolved_at, status: 'resolved', correct: r.correct,
}));

const allCalls = [...resolvedCalls, ...openCalls].sort((a, b) => new Date(b.called_at) - new Date(a.called_at));
const resolved = resolvedCalls.filter(c => c.outcome);
const wins = resolved.filter(c => c.correct === true).length;

const data = {
  stats: {
    total_calls: allCalls.length, resolved: resolved.length, open: openCalls.length,
    wins, losses: resolved.length - wins,
    win_rate: resolved.length > 0 ? (wins / resolved.length * 100).toFixed(1) : null,
    cumulative_pnl: resolved.reduce((s, r) => s + (r.pnl || 0), 0).toFixed(2),
  },
  calls: allCalls,
  updated_at: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
console.log(`Synced ${allCalls.length} calls (${resolved.length} resolved, ${openCalls.length} open) → ${OUT}`);
