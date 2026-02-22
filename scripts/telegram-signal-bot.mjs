#!/usr/bin/env node
/**
 * Prescience Telegram Signal Bot V2
 * 
 * Posts high-conviction signals (score >= 6/12) directly to the
 * Prescience community Telegram group via Bot API.
 * 
 * Smart dedup: same market can re-post if signal changed materially
 * (score delta >= 2, price moved >= 10¢, or flow direction flipped).
 * 
 * Usage: node telegram-signal-bot.mjs [--dry] [--channel=CHAT_ID]
 * 
 * Env vars (from .env or environment):
 *   PRESCIENCE_BOT_TOKEN — Telegram bot token
 *   PRESCIENCE_COMMUNITY_CHAT_ID — Target chat ID
 * 
 * Reads:
 *   - Prescience scan API for market data
 *   - /data/workspace-shared/signals/telegram-post-log.json for dedup
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
const POST_LOG_PATH = '/data/workspace-shared/signals/telegram-post-log.json';
const MAX_POSTS_PER_DAY = 3;
const MIN_SCORE_THRESHOLD = 6;
// Use admin API to bypass x402 payment gate
const sharedConfig = JSON.parse(fs.readFileSync('/data/workspace-shared/config.json', 'utf-8'));
const SCAN_URL = `${sharedConfig.admin_api.base_url}/scan?limit=50`;
const ADMIN_TOKEN = sharedConfig.admin_api.bearer_token;
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h base dedup window
const MATERIAL_SCORE_DELTA = 2;   // re-post if score changed by >=2
const MATERIAL_PRICE_DELTA = 0.10; // re-post if price moved >=10¢
const LOG_RETENTION_DAYS = 14;     // keep log for trend tracking

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const channelArg = args.find(a => a.startsWith('--channel='))?.split('=')[1];
const CHAT_ID = channelArg || process.env.PRESCIENCE_COMMUNITY_CHAT_ID;

if (!BOT_TOKEN) { console.error('Missing PRESCIENCE_BOT_TOKEN'); process.exit(1); }
if (!CHAT_ID) { console.error('Missing PRESCIENCE_COMMUNITY_CHAT_ID'); process.exit(1); }

// --- Post log with smart dedup ---

function loadPostLog() {
  try { return JSON.parse(fs.readFileSync(POST_LOG_PATH, 'utf-8')); } catch { return []; }
}

function savePostLog(log) {
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 86400000;
  const cleaned = log.filter(p => new Date(p.timestamp).getTime() > cutoff);
  fs.writeFileSync(POST_LOG_PATH, JSON.stringify(cleaned, null, 2));
}

function isDuplicate(market, scoring, postLog) {
  const slug = market.slug || market.conditionId;
  const prev = postLog.filter(p => p.slug === slug);
  if (prev.length === 0) return false;
  
  const latest = prev.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  const timeSince = Date.now() - new Date(latest.timestamp).getTime();
  
  // Always allow re-post after 24h if it still qualifies
  if (timeSince > DEDUP_WINDOW_MS) return false;
  
  // Within 24h — check if signal changed materially
  const scoreDelta = Math.abs(scoring.score - (latest.score || 0));
  const priceDelta = Math.abs((market.currentPrices?.Yes ?? 0.5) - (latest.yesPrice ?? 0.5));
  const flowFlipped = latest.flowDirection && market.flow_direction_v2 &&
    latest.flowDirection !== market.flow_direction_v2;
  
  if (scoreDelta >= MATERIAL_SCORE_DELTA) return false; // Score jumped — re-post
  if (priceDelta >= MATERIAL_PRICE_DELTA) return false;  // Price moved — re-post
  if (flowFlipped) return false;                          // Flow flipped — re-post
  
  return true; // Nothing changed materially — skip
}

// --- Sports filter ---

function isSportsMarket(q) {
  if (!q) return false;
  const patterns = [
    /\bvs\.?\b/i, /\bnba\b/i, /\bnfl\b/i, /\bnhl\b/i, /\bmlb\b/i, /\bufc\b/i,
    /\bcbb\b/i, /\bcfb\b/i, /\bpremier league\b/i, /\bpga\b/i, /\btennis\b/i,
    /\bf1\b/i, /\bboxing\b/i, /\bmma\b/i,
    /blue devils|wolverines|wildcats|bulldogs|celtics|lakers|warriors|suns|magic|76ers|pelicans|cavaliers|nuggets|bucks|knicks|nets|heat|mavericks|thunder|rockets/i,
  ];
  return patterns.some(p => p.test(q));
}

// --- Signal scoring (4 dimensions, /12) ---

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
  if (dataSignals < 2) score = Math.min(score, 5); // Require real data edge for threshold

  return { score: Math.max(0, score), reasons, days: Math.round(days) };
}

// --- Message formatting ---

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
  if (m.off_hours_amplified) lines.push(`🌙 Off-hours activity detected`);
  lines.push('', `💡 ${sc.reasons.join(' • ')}`, '', `🔗 <a href="https://prescience.markets/market/${m.slug || m.conditionId}">View on Prescience</a>`, '', '<i>Prescience — See who sees first.</i>');
  return lines.join('\n');
}

// --- Telegram Bot API ---

async function sendTelegram(text) {
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
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
    // Fetch scan data (use internal header to bypass x402)
    const resp = await fetch(SCAN_URL, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    if (!resp.ok) throw new Error(`Scan API ${resp.status}: ${resp.statusText}`);
    const data = await resp.json();
    const markets = data.scan || data.markets || [];

    if (markets.length === 0) {
      console.log(JSON.stringify({ signals: [], postCount: 0, reason: 'No markets from scan' }));
      process.exit(0);
    }

    let postLog = loadPostLog();

    // Check daily limit
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const todayPosts = postLog.filter(p => new Date(p.timestamp).getTime() > todayStart.getTime());
    if (todayPosts.length >= MAX_POSTS_PER_DAY) {
      console.log(JSON.stringify({ signals: [], postCount: 0, reason: `Already posted ${todayPosts.length}/${MAX_POSTS_PER_DAY} today` }));
      process.exit(0);
    }

    // Score, dedup, rank
    const scored = markets
      .map(m => ({ market: m, scoring: scoreSignal(m) }))
      .filter(s => s.scoring.score >= MIN_SCORE_THRESHOLD)
      .filter(s => !isDuplicate(s.market, s.scoring, postLog))
      .sort((a, b) => b.scoring.score - a.scoring.score);

    const remaining = MAX_POSTS_PER_DAY - todayPosts.length;
    const toPost = scored.slice(0, remaining);

    const results = [];
    for (const s of toPost) {
      const msg = formatMessage(s.market, s.scoring);
      
      if (dryRun) {
        console.log(`[DRY RUN] Would post: ${s.market.question} (score ${s.scoring.score})`);
      } else {
        try {
          await sendTelegram(msg);
          console.log(`✅ Posted: ${s.market.question} (score ${s.scoring.score})`);
        } catch (err) {
          console.error(`❌ Failed to post ${s.market.question}: ${err.message}`);
          continue;
        }
      }

      // Log with full context for smart dedup
      postLog.push({
        slug: s.market.slug || s.market.conditionId,
        question: s.market.question,
        score: s.scoring.score,
        threat_score: s.market.threat_score,
        yesPrice: s.market.currentPrices?.Yes ?? null,
        flowDirection: s.market.flow_direction_v2 || null,
        timestamp: new Date().toISOString(),
      });

      results.push({
        slug: s.market.slug || s.market.conditionId,
        question: s.market.question,
        score: s.scoring.score,
      });
    }

    if (!dryRun) savePostLog(postLog);

    console.log(JSON.stringify({
      posted: results,
      postCount: results.length,
      totalQualifying: scored.length + results.length, // scored already filtered
      todayTotal: todayPosts.length + results.length,
      maxPerDay: MAX_POSTS_PER_DAY,
      chatId: CHAT_ID,
      dryRun,
    }, null, 2));

  } catch (err) {
    console.error(JSON.stringify({ error: err.message, stack: err.stack }));
    process.exit(1);
  }
}

main();
