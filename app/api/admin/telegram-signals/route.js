import { requireAdmin } from '../../_lib/admin-auth.js';
import { NextResponse } from 'next/server';

const MAX_POSTS_PER_DAY = 3;
const MIN_SCORE = 6;

// In-memory post log (reset on cold start — acceptable for MVP)
const postLog = [];

function scoreSignal(m) {
  let score = 0;
  const reasons = [];

  // Consensus divergence (0-3)
  const yesPrice = m.currentPrices?.Yes ?? 0.5;
  if (yesPrice >= 0.35 && yesPrice <= 0.65) { score += 3; reasons.push('Near 50/50'); }
  else if ((yesPrice >= 0.15 && yesPrice < 0.35) || (yesPrice > 0.65 && yesPrice <= 0.85)) { score += 2; reasons.push('Meaningful divergence'); }
  else if ((yesPrice >= 0.05 && yesPrice < 0.15) || (yesPrice > 0.85 && yesPrice <= 0.95)) { score += 1; reasons.push('Mild lean'); }

  // Data edge (0-3)
  const signals = [
    m.flow_direction_v2 === 'MINORITY_HEAVY',
    (m.fresh_wallet_excess || 0) > 0.10,
    (m.large_position_ratio || 0) > 0.05,
    (m.veteran_minority_flow_score || 0) > 0,
  ].filter(Boolean).length;
  if (signals >= 3) { score += 3; reasons.push('Multiple converging signals'); }
  else if (signals >= 2) { score += 2; reasons.push('Clear flow signal'); }
  else if (signals >= 1) { score += 1; reasons.push('Mild signal'); }

  // Time sensitivity (0-3)
  const days = m.endDate ? Math.max(0, (new Date(m.endDate).getTime() - Date.now()) / 86400000) : 365;
  if (days <= 3) { score += 3; reasons.push('<3 days'); }
  else if (days <= 14) { score += 2; reasons.push('<2 weeks'); }
  else if (days <= 60) { score += 1; reasons.push('<2 months'); }

  if (m.is_dampened || m.consensus_dampened) { score -= 2; reasons.push('Dampened'); }

  return { score: Math.max(0, score), reasons, days: Math.round(days) };
}

async function handler(request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === 'true';

  // Fetch our own scan
  const protocol = url.protocol;
  const host = url.host;
  const scanResp = await fetch(`${protocol}//${host}/api/admin/scan?limit=50`, {
    headers: { 'Authorization': request.headers.get('authorization') },
  });
  if (!scanResp.ok) return NextResponse.json({ error: 'Scan fetch failed' }, { status: 502 });
  const scanData = await scanResp.json();
  const markets = scanData.scan || [];

  // Score and filter
  const scored = markets
    .map(m => ({ market: m, scoring: scoreSignal(m) }))
    .filter(s => s.scoring.score >= MIN_SCORE)
    .sort((a, b) => b.scoring.score - a.scoring.score);

  // Dedup against today's posts
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const todayPosts = postLog.filter(p => new Date(p.ts).getTime() > todayStart.getTime());
  const remaining = MAX_POSTS_PER_DAY - todayPosts.length;

  const fresh = scored.filter(s => !postLog.some(p => p.slug === (s.market.slug || s.market.conditionId)));
  const toPost = fresh.slice(0, Math.max(0, remaining));

  // Format messages
  const signals = toPost.map(s => {
    const m = s.market;
    const sc = s.scoring;
    const threatEmoji = m.threat_score >= 45 ? '🔴' : m.threat_score >= 25 ? '🟡' : '🟢';
    return {
      slug: m.slug || m.conditionId,
      question: m.question,
      callScore: sc.score,
      threatScore: m.threat_score,
      reasons: sc.reasons,
      daysToExpiry: sc.days,
      message: [
        `🎯 PRESCIENCE SIGNAL — Score ${sc.score}/9`,
        '',
        m.question,
        '',
        `${threatEmoji} Threat: ${m.threat_score}/100 (${m.threat_level})`,
        `💰 Vol: $${((m.volumeTotal || m.total_volume_usd || 0) / 1000).toFixed(0)}K | 👛 ${m.total_wallets} wallets`,
        m.flow_direction_v2 ? `📡 Flow: ${m.flow_direction_v2} — $${Math.round((m.minority_side_flow_usd || 0) / 1000)}K ${m.minority_outcome || 'minority'}` : null,
        m.veteran_flow_note ? `🏦 ${m.veteran_flow_note}` : null,
        m.currentPrices?.Yes != null ? `📈 YES ${(m.currentPrices.Yes * 100).toFixed(0)}¢ | NO ${(m.currentPrices.No * 100).toFixed(0)}¢` : null,
        sc.days < 365 ? `⏳ ${sc.days}d to resolution` : null,
        '',
        `💡 ${sc.reasons.join(' • ')}`,
        '',
        `🔗 prescience.markets/market/${m.slug || m.conditionId}`,
      ].filter(Boolean).join('\n'),
    };
  });

  // Log posts (unless dry run)
  if (!dryRun) {
    for (const sig of signals) {
      postLog.push({ slug: sig.slug, ts: new Date().toISOString() });
    }
  }

  return NextResponse.json({
    signals,
    postCount: signals.length,
    totalQualifying: scored.length,
    todayPosted: todayPosts.length,
    maxPerDay: MAX_POSTS_PER_DAY,
    dryRun,
  });
}

export const GET = requireAdmin(handler);
export const dynamic = 'force-dynamic';
