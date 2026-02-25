#!/usr/bin/env node
/**
 * Prescience Proof-of-Call Generator
 *
 * Generates proof-of-call documents from two sources:
 *   1. scanner-alerts.json → active_flags (TARS pre-public detections)
 *   2. telegram-post-log.json (formal bot signals)
 *
 * For each tracked market, fetches the current price from Gamma API
 * and records the price movement from our original detection.
 *
 * This allows generating "Called It" proof even before market resolution.
 * Designed for the Meteora scenario: flagged at 29%, report drops, market
 * spikes to 60%+ — we need to prove we detected it before any media.
 *
 * Usage:
 *   node proof-of-call-generator.mjs [--dry]
 *
 *   --dry   Print proofs but do NOT write any files
 *
 * Writes:
 *   /data/workspace-shared/signals/live-proofs.json
 *
 * Called by cron every 30min (see install-crons.sh).
 * Can also be called manually on demand by any agent.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── .env loader ─────────────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, '..', '.env');
try {
  const envFile = fs.readFileSync(envPath, 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
} catch { /* .env optional */ }

// ── Config ───────────────────────────────────────────────────────────────────
const GAMMA_BASE = 'https://gamma-api.polymarket.com/markets';
const CLOB_BASE  = 'https://clob.polymarket.com';

const SCANNER_ALERTS_PATH = '/data/workspace-shared/signals/scanner-alerts.json';
const POST_LOG_PATH        = '/data/workspace-shared/signals/telegram-post-log.json';
const LIVE_PROOFS_PATH     = '/data/workspace-shared/signals/live-proofs.json';

const args   = process.argv.slice(2);
const dryRun = args.includes('--dry');

// Minimum price movement to flag as notable (in percentage points)
const MIN_PP_MOVE = 3; // 3pp absolute movement from signal price

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function fmtPct(val) {
  const n = parseFloat(val) * 100;
  return n.toFixed(1) + '%';
}

function fmtDelta(from, to) {
  const delta = (to - from) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}pp`;
}

function formatDateEST(iso) {
  const d = new Date(iso);
  // Convert to EST (UTC-5)
  const est = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${est.getUTCFullYear()}-${pad(est.getUTCMonth()+1)}-${pad(est.getUTCDate())} ` +
         `${pad(est.getUTCHours())}:${pad(est.getUTCMinutes())} EST`;
}

// ── Gamma API: fetch market by slug ──────────────────────────────────────────

async function fetchBySlug(slug) {
  try {
    const url = `${GAMMA_BASE}?slug=${encodeURIComponent(slug)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
}

// ── CLOB API: get current YES price from order book ──────────────────────────

async function fetchCurrentPrice(conditionId) {
  try {
    // Try CLOB prices-history for latest price
    const url = `${CLOB_BASE}/prices-history?market=${conditionId}&interval=1h&fidelity=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const history = data.history || [];
    if (history.length === 0) return null;
    // Last entry is most recent
    const last = history[history.length - 1];
    return typeof last.p === 'number' ? last.p : parseFloat(last.p);
  } catch {
    return null;
  }
}

// ── Build proof from scanner active_flag ─────────────────────────────────────

function buildFlagProof(flag, currentPrice) {
  const from   = flag.original_price;
  const to     = currentPrice !== null ? currentPrice : flag.current_price;
  const delta  = to - from;
  const absDelta = Math.abs(delta * 100);
  const peakDelta = flag.peak_price ? (flag.peak_price - from) : null;

  const direction = delta > 0 ? 'YES ↑' : 'NO ↑';
  const status = absDelta >= 10
    ? (to > from ? 'CONFIRMED_MOVE' : 'CONFIRMED_FADE')
    : 'MONITORING';

  return {
    id: flag.id,
    source: 'tars-scanner-flag',
    type: 'PRE_PUBLIC_DETECTION',
    market: flag.market,
    slug: flag.slug || null,
    original_flag_time: flag.original_flag_time,
    original_flag_time_est: formatDateEST(flag.original_flag_time),
    original_price: from,
    current_price: to,
    peak_price: flag.peak_price || null,
    delta_from_signal: parseFloat(fmtDelta(from, to).replace('+','').replace('pp','')),
    delta_from_signal_str: fmtDelta(from, to),
    peak_delta_str: peakDelta !== null ? `+${(peakDelta * 100).toFixed(1)}pp` : null,
    direction_called: flag.flow_direction || 'MINORITY_HEAVY',
    conviction: flag.conviction || 'MEDIUM',
    scan_score: flag.scan_score || null,
    status,
    notable: absDelta >= MIN_PP_MOVE,
    flag_summary: flag.summary || '',
    next_trigger: flag.next_trigger || null,
    media_context: flag.media_context || null,
    updated_at: new Date().toISOString(),
    // Telegram-ready proof string
    proof_text: buildProofText({
      market: flag.market,
      source: 'TARS scanner flag',
      flaggedAt: flag.original_flag_time_est || formatDateEST(flag.original_flag_time),
      originalPct: fmtPct(from),
      currentPct: fmtPct(to),
      peakPct: flag.peak_price ? fmtPct(flag.peak_price) : null,
      delta: fmtDelta(from, to),
      note: flag.summary,
    }),
  };
}

// ── Build proof from telegram post-log entry ──────────────────────────────────

function buildSignalProof(signal, currentPrice) {
  const from = signal.yesPrice || 0;
  const to   = currentPrice !== null ? currentPrice : from;
  const delta = to - from;
  const absDelta = Math.abs(delta * 100);

  // Flow direction tells us which direction we're bullish on
  const isBullishYes = signal.flowDirection === 'MINORITY_HEAVY' && from < 0.5;
  const isBullishNo  = signal.flowDirection === 'MINORITY_HEAVY' && from >= 0.5;
  const calledDirection = isBullishYes ? 'YES' : isBullishNo ? 'NO' : 'YES';

  // Are we winning?
  const movingOurWay = (calledDirection === 'YES' && delta > 0) ||
                       (calledDirection === 'NO' && delta < 0);

  const impliedPnL = calledDirection === 'YES'
    ? ((to - from) / from * 100).toFixed(1)
    : ((from - to) / (1 - from) * 100).toFixed(1);
  const pnlStr = `${parseFloat(impliedPnL) >= 0 ? '+' : ''}${impliedPnL}%`;

  const status = absDelta >= 10 ? (movingOurWay ? 'WINNING' : 'LOSING') : 'OPEN';

  return {
    id: `signal-${signal.slug}-${signal.timestamp?.replace(/[:.]/g,'')}`,
    source: 'telegram-post-log',
    type: 'FORMAL_SIGNAL',
    market: signal.question,
    slug: signal.slug,
    signal_timestamp: signal.timestamp,
    signal_timestamp_est: signal.timestamp ? formatDateEST(signal.timestamp) : null,
    signal_yes_price: from,
    current_yes_price: to,
    delta_from_signal: parseFloat(fmtDelta(from, to).replace('+','').replace('pp','')),
    delta_from_signal_str: fmtDelta(from, to),
    called_direction: calledDirection,
    implied_pnl: pnlStr,
    signal_score: signal.score || signal.threat_score,
    flow_direction: signal.flowDirection,
    status,
    notable: absDelta >= MIN_PP_MOVE,
    updated_at: new Date().toISOString(),
    proof_text: buildProofText({
      market: signal.question,
      source: 'Prescience signal bot',
      flaggedAt: signal.timestamp ? formatDateEST(signal.timestamp) : 'unknown',
      originalPct: fmtPct(from),
      currentPct: fmtPct(to),
      peakPct: null,
      delta: fmtDelta(from, to),
      note: `Score ${signal.score || signal.threat_score}/12, ${signal.flowDirection} flow. Called ${calledDirection}.`,
    }),
  };
}

// ── Generate formatted proof text for Telegram / X ───────────────────────────

function buildProofText({ market, source, flaggedAt, originalPct, currentPct, peakPct, delta, note }) {
  const lines = [
    `PROOF OF CALL`,
    ``,
    `Market: ${market}`,
    `Flagged: ${flaggedAt} (${source})`,
    `At signal: ${originalPct}`,
    peakPct ? `Peak: ${peakPct}` : null,
    `Now: ${currentPct} (${delta})`,
    ``,
    note || '',
  ].filter(l => l !== null);
  return lines.join('\n');
}

// ── Deduplicate post-log by slug (keep first signal per market) ───────────────

function deduplicatePostLog(postLog) {
  const seen = new Set();
  return postLog.filter(s => {
    if (!s.slug || seen.has(s.slug)) return false;
    seen.add(s.slug);
    return true;
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[proof-generator] Starting${dryRun ? ' (DRY RUN)' : ''}…`);

  const proofs = [];

  // ── Source 1: TARS scanner active_flags ──────────────────────────────────
  const scannerAlerts = readJsonFile(SCANNER_ALERTS_PATH, {});
  const activeFlags = scannerAlerts?.active_flags || [];
  console.log(`[proof-generator] ${activeFlags.length} active flag(s) from scanner.`);

  for (const flag of activeFlags) {
    let currentPrice = null;

    // Try to get live price via slug
    if (flag.slug) {
      const market = await fetchBySlug(flag.slug);
      if (market?.conditionId) {
        currentPrice = await fetchCurrentPrice(market.conditionId);
      }
      if (currentPrice === null && market?.outcomePrices) {
        try {
          const prices = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices)
            : market.outcomePrices;
          currentPrice = parseFloat(prices[0]);
        } catch {}
      }
    }

    // Fall back to scanner-stored current_price
    if (currentPrice === null) currentPrice = flag.current_price;

    const proof = buildFlagProof(flag, currentPrice);
    proofs.push(proof);

    if (dryRun || proof.notable) {
      console.log(`\n── FLAG: ${flag.id} ───────────────────────────────────`);
      console.log(proof.proof_text);
      console.log(`  status=${proof.status} notable=${proof.notable}`);
    }
  }

  // ── Source 2: Telegram post-log formal signals ────────────────────────────
  const postLog = readJsonFile(POST_LOG_PATH, []);
  const deduped = deduplicatePostLog(postLog);
  console.log(`\n[proof-generator] ${deduped.length} unique signal(s) from post log.`);

  for (const signal of deduped) {
    if (!signal.slug) continue;

    let currentPrice = null;

    // Fetch via Gamma
    const market = await fetchBySlug(signal.slug);
    if (market) {
      // Try CLOB live price if conditionId available
      if (market.conditionId) {
        currentPrice = await fetchCurrentPrice(market.conditionId);
      }
      // Fallback: parse outcomePrices from Gamma
      if (currentPrice === null && market.outcomePrices) {
        try {
          const prices = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices)
            : market.outcomePrices;
          currentPrice = parseFloat(prices[0]);
        } catch {}
      }
    }

    const proof = buildSignalProof(signal, currentPrice);
    proofs.push(proof);

    if (dryRun || proof.notable) {
      console.log(`\n── SIGNAL: ${signal.slug?.slice(0,40)} ───────────────────`);
      console.log(`  From ${fmtPct(signal.yesPrice)} → Now ${currentPrice !== null ? fmtPct(currentPrice) : '?'} (${proof.delta_from_signal_str})`);
      console.log(`  Status: ${proof.status} | ImpliedPnL: ${proof.implied_pnl}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // ── Write results ─────────────────────────────────────────────────────────

  const output = {
    generated_at: new Date().toISOString(),
    total_proofs: proofs.length,
    notable_count: proofs.filter(p => p.notable).length,
    proofs,
  };

  if (!dryRun) {
    writeJsonFile(LIVE_PROOFS_PATH, output);
    console.log(`\n[proof-generator] Wrote ${proofs.length} proof(s) → ${LIVE_PROOFS_PATH}`);
    console.log(`[proof-generator] Notable movements: ${output.notable_count}`);
  } else {
    console.log(`\n[proof-generator] DRY RUN: would write ${proofs.length} proof(s).`);
  }

  console.log('[proof-generator] Done.');
}

main().catch(err => {
  console.error('[proof-generator] Fatal error:', err);
  process.exit(1);
});
