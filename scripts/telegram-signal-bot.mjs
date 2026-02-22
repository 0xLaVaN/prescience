#!/usr/bin/env node
/**
 * Prescience Telegram Signal Bot
 * 
 * Posts high-conviction signals (call-quality-gate score >= 6) to Telegram.
 * Designed to be called by OpenClaw cron or manually.
 * 
 * This script outputs JSON with the signals to post. The actual posting
 * is done by the calling agent via the message tool.
 * 
 * Usage: node telegram-signal-bot.mjs
 * 
 * Reads:
 *   - Prescience admin API for current scan data
 *   - /data/workspace-shared/signals/call-quality-gate.json for scoring rules
 *   - /data/workspace-shared/signals/telegram-post-log.json for dedup
 * 
 * Outputs JSON to stdout:
 *   { signals: [...], postCount: N, skipped: N }
 */

import fs from 'fs';
import path from 'path';

const CONFIG_PATH = '/data/workspace-shared/config.json';
const GATE_PATH = '/data/workspace-shared/signals/call-quality-gate.json';
const POST_LOG_PATH = '/data/workspace-shared/signals/telegram-post-log.json';
const MAX_POSTS_PER_DAY = 3;
const MIN_SCORE_THRESHOLD = 6; // STRONG_CALL

// Load config
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const adminBase = config.admin_api.base_url;
const adminToken = config.admin_api.bearer_token;

// Load post log (dedup)
let postLog = [];
try {
  postLog = JSON.parse(fs.readFileSync(POST_LOG_PATH, 'utf-8'));
} catch { postLog = []; }

// Clean old entries (keep last 7 days)
const sevenDaysAgo = Date.now() - 7 * 86400000;
postLog = postLog.filter(p => new Date(p.timestamp).getTime() > sevenDaysAgo);

// Count today's posts
const todayStart = new Date();
todayStart.setUTCHours(0, 0, 0, 0);
const todayPosts = postLog.filter(p => new Date(p.timestamp).getTime() > todayStart.getTime());

if (todayPosts.length >= MAX_POSTS_PER_DAY) {
  console.log(JSON.stringify({ signals: [], postCount: 0, skipped: 0, reason: `Already posted ${todayPosts.length}/${MAX_POSTS_PER_DAY} today` }));
  process.exit(0);
}

// Fetch scan data
async function fetchScan() {
  const resp = await fetch(`${adminBase}/scan?limit=50`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  if (!resp.ok) throw new Error(`Scan API returned ${resp.status}`);
  return resp.json();
}

// Score a market using call-quality-gate dimensions
function scoreSignal(market) {
  const m = market;
  let score = 0;
  const reasons = [];

  // 1. Consensus divergence (0-3)
  const yesPrice = m.currentPrices?.Yes ?? 0.5;
  if (yesPrice >= 0.35 && yesPrice <= 0.65) { score += 3; reasons.push('Near 50/50 — max edge'); }
  else if (yesPrice >= 0.15 && yesPrice < 0.35 || yesPrice > 0.65 && yesPrice <= 0.85) { score += 2; reasons.push('Meaningful disagreement'); }
  else if (yesPrice >= 0.05 && yesPrice < 0.15 || yesPrice > 0.85 && yesPrice <= 0.95) { score += 1; reasons.push('Mild lean'); }
  // else 0 — pure echo

  // 2. Data edge (0-3)
  const hasFlowSignal = m.flow_direction_v2 === 'MINORITY_HEAVY';
  const hasFreshWallets = (m.fresh_wallet_excess || 0) > 0.10;
  const hasWhales = (m.large_position_ratio || 0) > 0.05;
  const hasVeteranFlow = (m.veteran_minority_flow_score || 0) > 0;
  const hasVelocity = m.velocity?.velocity_score > 20;
  
  const dataSignals = [hasFlowSignal, hasFreshWallets, hasWhales, hasVeteranFlow, hasVelocity].filter(Boolean).length;
  if (dataSignals >= 3) { score += 3; reasons.push('Multiple converging signals'); }
  else if (dataSignals >= 2) { score += 2; reasons.push('Clear flow signal'); }
  else if (dataSignals >= 1) { score += 1; reasons.push('Mild flow signal'); }

  // 3. Time sensitivity (0-3)
  const daysToExpiry = m.endDate ? Math.max(0, (new Date(m.endDate).getTime() - Date.now()) / 86400000) : 365;
  if (daysToExpiry <= 3) { score += 3; reasons.push('Resolves in <3 days'); }
  else if (daysToExpiry <= 14) { score += 2; reasons.push('Resolves in <2 weeks'); }
  else if (daysToExpiry <= 60) { score += 1; reasons.push('Resolves in <2 months'); }

  // Penalty: dampened markets
  if (m.is_dampened || m.consensus_dampened) { score -= 2; reasons.push('Dampened (noise)'); }

  return { score: Math.max(0, score), reasons, daysToExpiry: Math.round(daysToExpiry) };
}

// Format signal for Telegram
function formatSignalMessage(market, scoring) {
  const m = market;
  const threatEmoji = m.threat_score >= 45 ? '🔴' : m.threat_score >= 25 ? '🟡' : '🟢';
  const yesPrice = m.currentPrices?.Yes;
  const noPrice = m.currentPrices?.No;
  
  // Determine our call direction based on minority flow
  const callSide = m.minority_outcome || 'YES';
  const callPrice = callSide === 'YES' ? yesPrice : noPrice;
  
  const lines = [
    `🎯 **PRESCIENCE SIGNAL** — Score ${scoring.score}/9`,
    '',
    `**${m.question}**`,
    '',
    `📊 Threat Score: ${threatEmoji} ${m.threat_score}/100 (${m.threat_level})`,
    `💰 Volume: $${((m.volumeTotal || m.total_volume_usd || 0) / 1000).toFixed(0)}K`,
    `👛 Wallets: ${m.total_wallets || 0} (${m.fresh_wallets || 0} fresh)`,
  ];

  if (m.flow_direction_v2) {
    lines.push(`📡 Flow: ${m.flow_direction_v2} — $${Math.round((m.minority_side_flow_usd || 0) / 1000)}K ${m.minority_outcome || 'minority'}`);
  }

  if (m.veteran_flow_note) {
    lines.push(`🏦 ${m.veteran_flow_note}`);
  }

  if (yesPrice != null) {
    lines.push(`📈 YES: ${(yesPrice * 100).toFixed(0)}¢ | NO: ${(noPrice * 100).toFixed(0)}¢`);
  }

  if (scoring.daysToExpiry < 365) {
    lines.push(`⏳ Resolves in ${scoring.daysToExpiry} days`);
  }

  lines.push('');
  lines.push(`💡 ${scoring.reasons.join(' • ')}`);
  lines.push('');
  lines.push(`🔗 prescience.markets/market/${m.slug || m.conditionId}`);
  lines.push('');
  lines.push('_Prescience — See who sees first._');

  return lines.join('\n');
}

async function main() {
  try {
    const data = await fetchScan();
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
      message: formatSignalMessage(s.market, s.scoring),
    }));

    // Update post log
    for (const sig of signals) {
      postLog.push({
        slug: sig.slug,
        question: sig.question,
        score: sig.score,
        timestamp: new Date().toISOString(),
      });
    }
    fs.writeFileSync(POST_LOG_PATH, JSON.stringify(postLog, null, 2));

    console.log(JSON.stringify({
      signals,
      postCount: signals.length,
      skipped: scored.length - signals.length,
      todayTotal: todayPosts.length + signals.length,
      maxPerDay: MAX_POSTS_PER_DAY,
    }));

  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
