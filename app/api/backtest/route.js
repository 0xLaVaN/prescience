import { NextResponse } from 'next/server';
import { requirePayment } from '../_lib/auth.js';
import fs from 'fs';
import path from 'path';
import https from 'https';

const GAMMA_API  = 'https://gamma-api.polymarket.com';
const CLOB_API   = 'https://clob.polymarket.com';

// ── Signal log path (shared across agents) ──────────────────────────────
const POST_LOG_PATH = '/data/workspace-shared/signals/telegram-post-log.json';

// ── HTTP helper ──────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve) => {
    https.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null))
      .on('timeout', () => resolve(null));
  });
}

// ── Determine call direction from signal data ────────────────────────────
// Heuristic: MINORITY_HEAVY + yesPrice < 0.5 → BUY_YES (smart money buying cheap YES)
//            MINORITY_HEAVY + yesPrice > 0.5 → BUY_NO (smart money buying cheap NO)
function inferCallDirection(signal) {
  const { yesPrice, flowDirection } = signal;
  if (flowDirection !== 'MINORITY_HEAVY') return null;
  return yesPrice < 0.5 ? 'BUY_YES' : 'BUY_NO';
}

// ── Fetch market metadata from Gamma API ─────────────────────────────────
async function fetchMarketMeta(slug) {
  const data = await fetchJSON(`${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}&limit=1`);
  if (!data || !data[0]) return null;
  const m = data[0];
  return {
    slug:         m.slug,
    question:     m.question,
    conditionId:  m.conditionId,
    clobTokenIds: JSON.parse(m.clobTokenIds || '[]'),
    active:       m.active,
    closed:       m.closed,
    endDate:      m.endDate,
    volume:       parseFloat(m.volume || 0),
    outcomePrices: m.outcomePrices ? JSON.parse(m.outcomePrices) : null,
    outcomes:      m.outcomes || '["Yes","No"]',
    resolutionSource: m.resolutionSource,
    wideFormatGroupSlug: m.wideFormatGroupSlug,
  };
}

// ── Fetch CLOB price history for a token (YES = index 0) ─────────────────
// Returns: Array of { t: unixSec, p: float } sorted ascending
async function fetchPriceHistory(tokenId, startTs) {
  if (!tokenId) return [];
  const url = `${CLOB_API}/prices-history?market=${tokenId}&startTs=${startTs}&resolution=1d&fidelity=1`;
  const data = await fetchJSON(url);
  return data?.history || [];
}

// ── Calculate P&L for a signal ──────────────────────────────────────────
function calcPnl(callDirection, entryPrice, currentYesPrice) {
  if (!callDirection || !entryPrice || currentYesPrice == null) return null;
  if (callDirection === 'BUY_YES') {
    const entry = entryPrice;
    const exit  = currentYesPrice;
    return { entry, exit, pnl: (exit - entry), pct: ((exit - entry) / entry * 100).toFixed(1) };
  } else { // BUY_NO
    const entry = 1 - entryPrice;
    const exit  = 1 - currentYesPrice;
    return { entry, exit, pnl: (exit - entry), pct: ((exit - entry) / entry * 100).toFixed(1) };
  }
}

// ── Determine if call was correct ────────────────────────────────────────
// For resolved markets: YES → currentYesPrice ≈ 1.0, NO → currentYesPrice ≈ 0.0
function evalCallOutcome(callDirection, resolvedYesPrice) {
  if (resolvedYesPrice == null) return 'pending';
  const yesWon = resolvedYesPrice >= 0.95;
  const noWon  = resolvedYesPrice <= 0.05;
  if (callDirection === 'BUY_YES') {
    if (yesWon) return 'correct';
    if (noWon)  return 'incorrect';
    return 'pending';
  } else {
    if (noWon)  return 'correct';
    if (yesWon) return 'incorrect';
    return 'pending';
  }
}

// ── Main handler ────────────────────────────────────────────────────────
export async function GET(request) {
  // Same-origin/internal bypass, then x402
  const url = new URL(request.url);
  const internalKey = request.headers.get('x-internal-key');
  const envKey = process.env.PRESCIENCE_INTERNAL_KEY;
  const isSameOrigin = request.headers.get('x-same-origin') === '1';
  if (!(isSameOrigin || (envKey && internalKey === envKey))) {
    const payResult = await requirePayment(request);
    if (payResult !== null) return payResult;
  }

  const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);
  const filterStatus = url.searchParams.get('status') || 'all'; // all | correct | incorrect | pending

  // ── Load signal log ────────────────────────────────────────────────────
  let rawSignals = [];
  try {
    rawSignals = JSON.parse(fs.readFileSync(POST_LOG_PATH, 'utf-8'));
  } catch {
    rawSignals = [];
  }

  // Deduplicate by slug — keep the EARLIEST signal per slug (first call)
  const seen = new Map();
  for (const sig of rawSignals) {
    if (!seen.has(sig.slug)) seen.set(sig.slug, sig);
  }
  const signals = Array.from(seen.values())
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(0, limitParam);

  // ── Enrich each signal ─────────────────────────────────────────────────
  const results = await Promise.all(signals.map(async (sig) => {
    const callDirection = inferCallDirection(sig);
    const signalTs  = Math.floor(new Date(sig.timestamp).getTime() / 1000);

    // Fetch live market metadata
    const meta = await fetchMarketMeta(sig.slug);
    if (!meta) {
      return {
        slug:            sig.slug,
        question:        sig.question,
        call_direction:  callDirection,
        entry_price:     sig.yesPrice,
        signal_at:       sig.timestamp,
        score:           sig.score,
        current_price:   null,
        outcome:         'data_unavailable',
        pnl:             null,
        price_history:   [],
        error:           'market_not_found',
      };
    }

    // Get YES token ID (index 0)
    const yesTokenId = meta.clobTokenIds[0] || null;

    // Fetch price history from signal time
    const history = await fetchPriceHistory(yesTokenId, signalTs);

    // Determine current YES price
    let currentYesPrice = null;
    if (meta.outcomePrices) {
      // Gamma provides comma-separated prices for each outcome
      const prices = Array.isArray(meta.outcomePrices)
        ? meta.outcomePrices
        : meta.outcomePrices.split(',').map(Number);
      currentYesPrice = prices[0] ?? null;
    } else if (history.length > 0) {
      currentYesPrice = history[history.length - 1].p;
    }

    // Check if resolved (very high or very low price means resolved)
    const isResolved  = !meta.active || (currentYesPrice != null && (currentYesPrice >= 0.99 || currentYesPrice <= 0.01));
    const resolvedPrice = isResolved ? currentYesPrice : null;

    // P&L calculation
    const pnlData = calcPnl(callDirection, sig.yesPrice, currentYesPrice);

    // Outcome
    const outcome = evalCallOutcome(callDirection, resolvedPrice);

    // Price 24h and 48h after signal
    const price24h = history.find(h => h.t >= signalTs + 86400)?.p ?? null;
    const price48h = history.find(h => h.t >= signalTs + 172800)?.p ?? null;

    const pnl24h = price24h != null ? calcPnl(callDirection, sig.yesPrice, price24h) : null;
    const pnl48h = price48h != null ? calcPnl(callDirection, sig.yesPrice, price48h) : null;

    // Compact history for chart (downsample to 30 pts)
    const historyCompact = history.length > 30
      ? history.filter((_, i) => i % Math.ceil(history.length / 30) === 0)
      : history;

    return {
      slug:            sig.slug,
      question:        sig.question || meta.question,
      call_direction:  callDirection,
      entry_price:     sig.yesPrice,
      signal_at:       sig.timestamp,
      signal_score:    sig.score,
      flow_direction:  sig.flowDirection,
      current_price:   currentYesPrice,
      is_resolved:     isResolved,
      outcome,
      pnl:             pnlData,
      pnl_24h:         pnl24h,
      pnl_48h:         pnl48h,
      end_date:        meta.endDate,
      volume:          meta.volume,
      price_history:   historyCompact,
    };
  }));

  // Apply status filter
  const filtered = filterStatus === 'all'
    ? results
    : results.filter(r => r.outcome === filterStatus);

  // ── Aggregate stats ────────────────────────────────────────────────────
  const resolved   = results.filter(r => r.outcome === 'correct' || r.outcome === 'incorrect');
  const correct    = results.filter(r => r.outcome === 'correct');
  const incorrect  = results.filter(r => r.outcome === 'incorrect');
  const pending    = results.filter(r => r.outcome === 'pending');

  const winRate = resolved.length > 0
    ? Math.round((correct.length / resolved.length) * 100)
    : null;

  // Average 24h P&L for calls with data
  const pnl24hArr = results.filter(r => r.pnl_24h).map(r => parseFloat(r.pnl_24h.pct));
  const avgPnl24h = pnl24hArr.length > 0
    ? (pnl24hArr.reduce((a, b) => a + b, 0) / pnl24hArr.length).toFixed(1)
    : null;

  const stats = {
    total_signals:   results.length,
    resolved:        resolved.length,
    correct:         correct.length,
    incorrect:       incorrect.length,
    pending:         pending.length,
    win_rate_pct:    winRate,
    avg_pnl_24h_pct: avgPnl24h,
    note:            'Call direction inferred: MINORITY_HEAVY + yesPrice<0.5 → BUY_YES, yesPrice>0.5 → BUY_NO',
  };

  return NextResponse.json({
    signals: filtered,
    stats,
    meta: {
      generated_at:   new Date().toISOString(),
      signal_log:     POST_LOG_PATH,
      filter_status:  filterStatus,
      limit:          limitParam,
    },
  }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
