#!/usr/bin/env node
/**
 * Prescience Telegram Signal Bot V1
 * 
 * Posts high-conviction signals (call-quality-gate score >= 6) to the
 * Prescience community Telegram channel.
 * 
 * Designed to be called by OpenClaw cron or manually by agents.
 * Outputs JSON with signals — the calling agent posts via message tool.
 * 
 * Usage: node telegram-signal-bot.mjs [--dry] [--channel=CHANNEL_ID]
 * 
 * Reads:
 *   - Prescience admin API for scan data
 *   - /data/workspace-shared/config.json for channel routing
 *   - /data/workspace-shared/signals/telegram-post-log.json for dedup
 */

import fs from 'fs';

const CONFIG_PATH = '/data/workspace-shared/config.json';
const POST_LOG_PATH = '/data/workspace-shared/signals/telegram-post-log.json';
const MAX_POSTS_PER_DAY = 3;
const MIN_SCORE_THRESHOLD = 6; // STRONG_CALL

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const channelArg = args.find(a => a.startsWith('--channel='))?.split('=')[1];

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const adminBase = config.admin_api.base_url;
const adminToken = config.admin_api.bearer_token;
const communityChannel = channelArg || config.telegram?.community_channel || config.telegram?.alerts_channel;

// Load + clean post log
let postLog = [];
try { postLog = JSON.parse(fs.readFileSync(POST_LOG_PATH, 'utf-8')); } catch { postLog = []; }
const sevenDaysAgo = Date.now() - 7 * 86400000;
postLog = postLog.filter(p => new Date(p.timestamp).getTime() > sevenDaysAgo);

// Check daily limit
const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
const todayPosts = postLog.filter(p => new Date(p.timestamp).getTime() > todayStart.getTime());
if (todayPosts.length >= MAX_POSTS_PER_DAY) {
  console.log(JSON.stringify({ signals: [], postCount: 0, reason: `Already posted ${todayPosts.length}/${MAX_POSTS_PER_DAY} today` }));
  process.exit(0);
}

// Sports filter
function isSportsMarket(q) {
  if (!q) return false;
  const patterns = [
    /\bvs\.?\b/i, /\bnba\b/i, /\bnfl\b/i, /\bnhl\b/i, /\bmlb\b/i, /\bufc\b/i,
    /\bcbb\b/i, /\bcfb\b/i, /\bpremier league\b/i,
    /blue devils|wolverines|wildcats|bulldogs|celtics|lakers|warriors|suns|magic|76ers|pelicans|cavaliers|nuggets|bucks|knicks|nets|heat|mavericks|thunder|rockets/i,
  ];
  return patterns.some(p => p.test(q));
}

function scoreSignal(m) {
  let score = 0;
  const reasons = [];
  const question = m.question || '';

  if (isSportsMarket(question)) return { score: 0, reasons: ['Sports — skip'], days: 0 };

  // Consensus divergence (0-3)
  const yesPrice = m.currentPrices?.Yes ?? 0.5;
  if (yesPrice >= 0.35 && yesPrice <= 0.65) { score += 3; reasons.push('Near 50/50 — max edge'); }
  else if ((yesPrice >= 0.15 && yesPrice < 0.35) || (yesPrice > 0.65 && yesPrice <= 0.85)) { score += 2; reasons.push('Meaningful divergence'); }
  else if ((yesPrice >= 0.05 && yesPrice < 0.15) || (yesPrice > 0.85 && yesPrice <= 0.95)) { score += 1; reasons.push('Mild lean'); }

  // Data edge (0-3)
  const dataSignals = [
    m.flow_direction_v2 === 'MINORITY_HEAVY',
    (m.fresh_wallet_excess || 0) > 0.10,
    (m.large_position_ratio || 0) > 0.05,
    (m.veteran_minority_flow_score || 0) > 0,
    m.velocity?.velocity_score > 20,
  ].filter(Boolean).length;
  if (dataSignals >= 3) { score += 3; reasons.push('Multiple converging signals'); }
  else if (dataSignals >= 2) { score += 2; reasons.push('Clear flow signal'); }
  else if (dataSignals >= 1) { score += 1; reasons.push('Mild signal'); }

  // Time sensitivity (0-3)
  const days = m.endDate ? Math.max(0, (new Date(m.endDate).getTime() - Date.now()) / 86400000) : 365;
  if (days <= 3) { score += 3; reasons.push('Resolves in <3 days'); }
  else if (days <= 14) { score += 2; reasons.push('Resolves in <2 weeks'); }
  else if (days <= 60) { score += 1; reasons.push('Resolves in <2 months'); }

  // Narrative value (0-3)
  const geoFin = /\b(president|election|trump|biden|fed|interest rate|war|ceasefire|iran|china|russia|ukraine|tariff|gdp|recession|ipo|crypto|bitcoin|ethereum|ai\b|openai|google|apple|tesla|congress|supreme court|nato|opec)\b/i;
  if (geoFin.test(question)) { score += 3; reasons.push('Major event'); }
  else if ((m.total_volume_usd || m.volumeTotal || 0) > 500000) { score += 2; reasons.push('High-volume market'); }
  else if ((m.total_volume_usd || m.volumeTotal || 0) > 100000) { score += 1; reasons.push('Notable market'); }

  if (m.is_dampened || m.consensus_dampened) { score -= 2; reasons.push('Dampened'); }
  if (dataSignals < 2) score = Math.min(score, 5); // Require real data edge

  return { score: Math.max(0, score), reasons, days: Math.round(days) };
}

function formatMessage(m, sc) {
  const threatEmoji = m.threat_score >= 45 ? '🔴' : m.threat_score >= 25 ? '🟡' : '🟢';
  const lines = [
    `🎯 <b>PRESCIENCE SIGNAL</b> — Score ${sc.score}/12`,
    '',
    `<b>${m.question}</b>`,
    '',
    `${threatEmoji} Threat: ${m.threat_score}/100 (${m.threat_level})`,
    `💰 Volume: $${((m.volumeTotal || m.total_volume_usd || 0) / 1000).toFixed(0)}K`,
    `👛 Wallets: ${m.total_wallets || 0} (${m.fresh_wallets || 0} fresh)`,
  ];
  if (m.flow_direction_v2) lines.push(`📡 Flow: ${m.flow_direction_v2} — $${Math.round((m.minority_side_flow_usd || 0) / 1000)}K ${m.minority_outcome || 'minority'}`);
  if (m.veteran_flow_note) lines.push(`🏦 ${m.veteran_flow_note}`);
  if (m.currentPrices?.Yes != null) lines.push(`📈 YES ${(m.currentPrices.Yes * 100).toFixed(0)}¢ | NO ${(m.currentPrices.No * 100).toFixed(0)}¢`);
  if (sc.days < 365) lines.push(`⏳ ${sc.days}d to resolution`);
  lines.push('', `💡 ${sc.reasons.join(' • ')}`, '', `🔗 prescience.markets/market/${m.slug || m.conditionId}`, '', '<i>Prescience — See who sees first.</i>');
  return lines.join('\n');
}

async function main() {
  try {
    const resp = await fetch(`${adminBase}/scan?limit=50`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!resp.ok) throw new Error(`Scan API ${resp.status}`);
    const data = await resp.json();
    const markets = data.scan || [];

    const scored = markets
      .map(m => ({ market: m, scoring: scoreSignal(m) }))
      .filter(s => s.scoring.score >= MIN_SCORE_THRESHOLD)
      .filter(s => !postLog.some(p => p.slug === (s.market.slug || s.market.conditionId)))
      .sort((a, b) => b.scoring.score - a.scoring.score);

    const remaining = MAX_POSTS_PER_DAY - todayPosts.length;
    const toPost = scored.slice(0, remaining);

    const signals = toPost.map(s => ({
      slug: s.market.slug || s.market.conditionId,
      question: s.market.question,
      score: s.scoring.score,
      threat_score: s.market.threat_score,
      message: formatMessage(s.market, s.scoring),
      channel: communityChannel,
    }));

    if (!dryRun) {
      for (const sig of signals) {
        postLog.push({ slug: sig.slug, question: sig.question, score: sig.score, timestamp: new Date().toISOString() });
      }
      fs.writeFileSync(POST_LOG_PATH, JSON.stringify(postLog, null, 2));
    }

    console.log(JSON.stringify({
      signals,
      postCount: signals.length,
      totalQualifying: scored.length,
      skipped: scored.length - signals.length,
      todayTotal: todayPosts.length + signals.length,
      maxPerDay: MAX_POSTS_PER_DAY,
      channel: communityChannel,
      dryRun,
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
