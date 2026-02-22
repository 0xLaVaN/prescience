import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SCORECARD_PATH = '/data/workspace-shared/signals/scorecard-data.json';
const RECEIPTS_PATH = '/data/workspace-shared/signals/resolution-receipts.json';
const POST_LOG_PATH = '/data/workspace-shared/signals/telegram-post-log.json';
const STATIC_PATH = path.join(process.cwd(), 'public', 'data', 'scorecard.json');

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}

function loadJsonObj(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

export async function GET() {
  // Try live signal files first (works locally / self-hosted)
  const postLog = loadJson(POST_LOG_PATH);
  const receipts = loadJson(RECEIPTS_PATH);

  if (postLog.length > 0 || receipts.length > 0) {
    const resolvedSlugs = new Set(receipts.map(r => r.slug));
    const openCalls = postLog
      .filter(p => !resolvedSlugs.has(p.slug))
      .map(p => ({
        slug: p.slug, question: p.question,
        signal_score: p.score || p.threat_score,
        entry_price: p.yesPrice, flow_direction: p.flowDirection,
        called_at: p.timestamp, status: 'open',
      }));
    const resolvedCalls = receipts.map(r => ({
      slug: r.slug, question: r.question || r.market,
      signal_score: r.signal_score || r.threat_score,
      entry_price: r.entry_price || r.yesPrice,
      outcome: r.outcome,
      resolution_price: r.outcome === 'YES' ? 1.0 : r.outcome === 'NO' ? 0.0 : null,
      pnl: r.pnl, called_at: r.called_at || r.signal_timestamp,
      resolved_at: r.resolved_at, status: 'resolved', correct: r.correct,
    }));
    const allCalls = [...resolvedCalls, ...openCalls];
    const resolved = resolvedCalls.filter(c => c.outcome);
    const wins = resolved.filter(c => c.correct === true).length;
    const losses = resolved.filter(c => c.correct === false).length;
    const winRate = resolved.length > 0 ? (wins / resolved.length * 100).toFixed(1) : null;
    let cumPnl = 0;
    for (const r of resolved) { if (r.pnl != null) cumPnl += r.pnl; }

    return NextResponse.json({
      stats: { total_calls: allCalls.length, resolved: resolved.length, open: openCalls.length, wins, losses, win_rate: winRate, cumulative_pnl: cumPnl.toFixed(2) },
      calls: allCalls.sort((a, b) => new Date(b.called_at) - new Date(a.called_at)),
      updated_at: new Date().toISOString(),
    });
  }

  // Fallback: serve static scorecard (Vercel deployment)
  const staticData = loadJsonObj(STATIC_PATH);
  if (staticData) return NextResponse.json(staticData);

  return NextResponse.json({ stats: { total_calls: 0, resolved: 0, open: 0, wins: 0, losses: 0, win_rate: null, cumulative_pnl: '0.00' }, calls: [], updated_at: new Date().toISOString() });
}
