#!/usr/bin/env node
/**
 * Prescience Resolution Tracker
 *
 * Checks each signal in the telegram-post-log against Polymarket's Gamma API
 * to detect market resolutions. When a market resolves, generates a
 * proof-of-call receipt, posts it to the free Telegram channel, and
 * saves the data for scorecard tracking.
 *
 * Usage:
 *   node resolution-tracker.mjs [--dry]
 *
 *   --dry   Print receipts but do NOT post to Telegram or write any files
 *
 * Reads:
 *   - /data/workspace-shared/signals/telegram-post-log.json     (our calls)
 *   - /data/workspace-shared/signals/resolution-receipts.json   (already processed, to skip)
 *
 * Writes:
 *   - /data/workspace-shared/signals/resolution-receipts.json   (appends new receipts)
 *   - /data/workspace-shared/signals/scorecard-data.json        (appends scorecard rows)
 *
 * Posts:
 *   - Telegram free channel (-5124728560) via PRESCIENCE_BOT_TOKEN
 *
 * API:
 *   - Gamma API: https://gamma-api.polymarket.com/markets?slug=SLUG
 *     Checks: market.closed === true || market.resolved === true
 *     Outcome: outcomePrices[0] >= 0.99 → YES, <= 0.01 → NO
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── .env loader (same pattern as telegram-signal-bot.mjs) ──────────────────
const envPath = path.resolve(__dirname, '..', '.env');
try {
  const envFile = fs.readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch { /* .env optional */ }

// ── Config ─────────────────────────────────────────────────────────────────
const BOT_TOKEN    = process.env.PRESCIENCE_BOT_TOKEN;
const FREE_CHAT_ID = '-5124728560';
const GAMMA_BASE   = 'https://gamma-api.polymarket.com/markets';

const POST_LOG_PATH  = '/data/workspace-shared/signals/telegram-post-log.json';
const RECEIPTS_PATH  = '/data/workspace-shared/signals/resolution-receipts.json';
const SCORECARD_PATH = '/data/workspace-shared/signals/scorecard-data.json';

const args   = process.argv.slice(2);
const dryRun = args.includes('--dry');

if (!BOT_TOKEN) {
  console.error('[resolution-tracker] ERROR: Missing PRESCIENCE_BOT_TOKEN in .env');
  process.exit(1);
}

// ── File helpers ────────────────────────────────────────────────────────────

function readJsonFile(filePath, fallback = []) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`Failed to read ${filePath}: ${err.message}`);
  }
}

function appendJsonArray(filePath, newEntries) {
  const existing = readJsonFile(filePath, []);
  const updated  = [...existing, ...newEntries];
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
}

// ── Gamma API ───────────────────────────────────────────────────────────────

async function fetchMarketBySlug(slug) {
  const url = `${GAMMA_BASE}?slug=${encodeURIComponent(slug)}`;
  const res  = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Gamma API error ${res.status} for slug: ${slug}`);
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

// ── Resolution detection ────────────────────────────────────────────────────

/**
 * Returns null if not resolved, or { outcome, finalPrice, resolvedAt } if resolved.
 *
 * Resolved iff:
 *   market.closed === true || market.resolved === true
 *   AND outcomePrices shows a definitive outcome (>=0.99 or <=0.01)
 *
 * outcomePrices[0] = YES price, outcomePrices[1] = NO price
 */
function detectResolution(market) {
  const isResolved = market.resolved === true || market.closed === true;
  if (!isResolved) return null;

  // Parse outcome prices
  let prices;
  try {
    prices = typeof market.outcomePrices === 'string'
      ? JSON.parse(market.outcomePrices)
      : market.outcomePrices;
  } catch {
    return null;
  }

  if (!Array.isArray(prices) || prices.length < 2) return null;

  const yesPrice = parseFloat(prices[0]);
  const noPrice  = parseFloat(prices[1]);

  let outcome;
  if (yesPrice >= 0.99) {
    outcome = 'YES';
  } else if (noPrice >= 0.99) {
    outcome = 'NO';
  } else {
    // Ambiguous — closed but not definitively resolved yet (e.g. in dispute)
    return null;
  }

  const finalPrice = outcome === 'YES' ? 1.00 : 0.00;

  // Best proxy for resolution timestamp: updatedAt (changes when resolved)
  const resolvedAt = market.updatedAt || market.endDate || new Date().toISOString();

  return { outcome, finalPrice, resolvedAt };
}

// ── P&L calculation ─────────────────────────────────────────────────────────

/**
 * Implied P&L if you bought YES at signalPrice and held to resolution.
 * signalPrice is in [0,1] (e.g. 0.58 = 58¢).
 * Returns a string like "+72.4%" or "-100.0%"
 */
function calcPnL(signalPrice, outcome) {
  if (signalPrice <= 0) return 'N/A';
  const entryPriceCents = signalPrice * 100;
  const exitPriceCents  = outcome === 'YES' ? 100 : 0;
  const pnlPct = ((exitPriceCents - entryPriceCents) / entryPriceCents) * 100;
  const sign   = pnlPct >= 0 ? '+' : '';
  return `${sign}${pnlPct.toFixed(1)}%`;
}

// ── Days between two ISO timestamps ────────────────────────────────────────

function daysBetween(isoA, isoB) {
  const msA = new Date(isoA).getTime();
  const msB = new Date(isoB).getTime();
  return Math.round(Math.abs(msB - msA) / 86400000);
}

// ── Format signal date ──────────────────────────────────────────────────────

function formatDate(iso) {
  const d = new Date(iso);
  return d.toUTCString().replace(' GMT', ' UTC').replace(/:\d\d UTC$/, ' UTC');
}

// ── Build Telegram HTML receipt ─────────────────────────────────────────────

function buildReceiptHtml(signal, resolution, market) {
  const { outcome, resolvedAt }  = resolution;
  const signalDate  = formatDate(signal.timestamp);
  const signalCents = Math.round((signal.yesPrice || 0) * 100);
  const finalCents  = outcome === 'YES' ? 100 : 0;
  const pnl         = calcPnL(signal.yesPrice || 0, outcome);
  const daysAhead   = daysBetween(signal.timestamp, resolvedAt);
  const outcomeEmoji = outcome === 'YES' ? '✅ YES' : '❌ NO';
  const score        = signal.score || signal.threat_score || '?';

  // Escape HTML entities in the question
  const question = (signal.question || market.question || 'Unknown Market')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return [
    '📊 <b>RESOLUTION RECEIPT</b>',
    '',
    `<b>${question}</b>`,
    '',
    `Outcome: ${outcomeEmoji}`,
    `Our signal: ${signalDate} at ${signalCents}¢`,
    `Resolution: ${outcome} at ${finalCents}¢`,
    `Implied P&amp;L: ${pnl}`,
    `Signal score: ${score}/12`,
    '',
    `Called it ${daysAhead} day${daysAhead !== 1 ? 's' : ''} before resolution.`,
    '',
    '<i>Prescience — See who sees first.</i>',
  ].join('\n');
}

// ── Telegram API ────────────────────────────────────────────────────────────

async function postToTelegram(chatId, html) {
  const url  = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id:    chatId,
    text:       html,
    parse_mode: 'HTML',
  });

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  }
  return data;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[resolution-tracker] Starting${dryRun ? ' (DRY RUN)' : ''}…`);

  // Load signal post log
  const postLog = readJsonFile(POST_LOG_PATH, []);
  if (postLog.length === 0) {
    console.log('[resolution-tracker] No signals in post log. Nothing to check.');
    return;
  }
  console.log(`[resolution-tracker] Loaded ${postLog.length} signal(s) from post log.`);

  // Load already-processed receipts (to skip)
  const receipts   = readJsonFile(RECEIPTS_PATH, []);
  const processedSlugs = new Set(receipts.map(r => r.slug));
  console.log(`[resolution-tracker] ${processedSlugs.size} slug(s) already processed.`);

  const newReceipts  = [];
  const newScorecard = [];

  for (const signal of postLog) {
    const { slug, question } = signal;
    if (!slug) {
      console.warn(`[resolution-tracker] Skipping signal with no slug: ${question}`);
      continue;
    }

    if (processedSlugs.has(slug)) {
      console.log(`[resolution-tracker] SKIP (already processed): ${slug}`);
      continue;
    }

    console.log(`[resolution-tracker] Checking: ${slug}`);

    let market;
    try {
      market = await fetchMarketBySlug(slug);
    } catch (err) {
      console.error(`[resolution-tracker] API error for ${slug}: ${err.message}`);
      continue;
    }

    if (!market) {
      console.log(`[resolution-tracker] Market not found on Gamma: ${slug}`);
      continue;
    }

    const resolution = detectResolution(market);

    if (!resolution) {
      console.log(`[resolution-tracker] Not yet resolved: ${slug} (closed=${market.closed}, resolved=${market.resolved})`);
      continue;
    }

    console.log(`[resolution-tracker] RESOLVED: ${slug} → ${resolution.outcome}`);

    // Build receipt HTML
    const html = buildReceiptHtml(signal, resolution, market);

    if (dryRun) {
      console.log('\n── DRY RUN RECEIPT ───────────────────────────────────');
      console.log(html);
      console.log('──────────────────────────────────────────────────────\n');
    } else {
      // Post to Telegram
      try {
        const tgRes = await postToTelegram(FREE_CHAT_ID, html);
        console.log(`[resolution-tracker] Posted to Telegram: message_id=${tgRes.result?.message_id}`);
      } catch (err) {
        console.error(`[resolution-tracker] Telegram post failed for ${slug}: ${err.message}`);
        // Still save the receipt so we don't loop on failures
      }
    }

    // Build receipt record
    const receiptRecord = {
      slug,
      question:       signal.question || market.question,
      signalTimestamp: signal.timestamp,
      signalYesPrice:  signal.yesPrice,
      signalScore:     signal.score || signal.threat_score,
      outcome:         resolution.outcome,
      finalPrice:      resolution.finalPrice,
      resolvedAt:      resolution.resolvedAt,
      pnl:             calcPnL(signal.yesPrice || 0, resolution.outcome),
      daysAhead:       daysBetween(signal.timestamp, resolution.resolvedAt),
      processedAt:     new Date().toISOString(),
    };

    // Build scorecard record
    const scorecardRecord = {
      slug,
      question:        signal.question || market.question,
      signalTimestamp: signal.timestamp,
      signalYesPrice:  signal.yesPrice,
      signalScore:     signal.score || signal.threat_score,
      flowDirection:   signal.flowDirection,
      outcome:         resolution.outcome,
      correct:         resolution.outcome === 'YES', // we always signal bullish (YES direction)
      pnl:             calcPnL(signal.yesPrice || 0, resolution.outcome),
      daysAhead:       daysBetween(signal.timestamp, resolution.resolvedAt),
      resolvedAt:      resolution.resolvedAt,
    };

    newReceipts.push(receiptRecord);
    newScorecard.push(scorecardRecord);
    processedSlugs.add(slug); // prevent double-processing within same run
  }

  // Persist results
  if (newReceipts.length === 0) {
    console.log('[resolution-tracker] No new resolutions found this run.');
    return;
  }

  if (!dryRun) {
    appendJsonArray(RECEIPTS_PATH, newReceipts);
    console.log(`[resolution-tracker] Saved ${newReceipts.length} receipt(s) → ${RECEIPTS_PATH}`);

    appendJsonArray(SCORECARD_PATH, newScorecard);
    console.log(`[resolution-tracker] Saved ${newScorecard.length} scorecard row(s) → ${SCORECARD_PATH}`);
  } else {
    console.log(`[resolution-tracker] DRY RUN: would save ${newReceipts.length} receipt(s) and ${newScorecard.length} scorecard row(s).`);
  }

  console.log('[resolution-tracker] Done.');
}

main().catch(err => {
  console.error('[resolution-tracker] Fatal error:', err);
  process.exit(1);
});
