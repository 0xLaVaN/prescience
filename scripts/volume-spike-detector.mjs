#!/usr/bin/env node
/**
 * Prescience Volume Spike Detector
 *
 * Detects when prediction markets experience abnormal volume surges (>5x baseline)
 * and generates content briefs for BRAND to investigate and for TARS to flag.
 *
 * Volume IS the news cycle — a market going from $10K to $500K daily volume is
 * a story independent of threat score. This catches slow-news-cycle moments and
 * confirms high-conviction signals with volume confirmation.
 *
 * Detection methods:
 *   1. Local history baseline (persisted between runs — primary method)
 *   2. Vercel-side velocity.volume_spike_ratio (computed by scan API in-memory)
 *   3. Volume-vs-liquidity ratio heuristic (fallback for new/untracked markets)
 *
 * Writes to:
 *   /data/workspace-shared/signals/volume-spike-briefs.json
 *   /data/workspace-shared/signals/volume-history.json   (internal baseline store)
 *
 * Usage: node volume-spike-detector.mjs [--dry] [--threshold=5] [--min-volume=50000]
 *
 * Cron: wire into TARS heartbeat or run every 30min alongside signal bot.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────
const SHARED_SIGNALS = '/data/workspace-shared/signals';
const HISTORY_PATH   = path.join(SHARED_SIGNALS, 'volume-history.json');
const BRIEFS_PATH    = path.join(SHARED_SIGNALS, 'volume-spike-briefs.json');

// Load shared config for admin API
const sharedConfig = JSON.parse(
  fs.readFileSync('/data/workspace-shared/config.json', 'utf-8')
);
const SCAN_URL    = `${sharedConfig.admin_api.base_url}/scan?limit=100`;
const ADMIN_TOKEN = sharedConfig.admin_api.bearer_token;

// CLI args
const args = process.argv.slice(2);
const DRY_RUN      = args.includes('--dry');
const THRESHOLD    = parseFloat(args.find(a => a.startsWith('--threshold='))?.split('=')[1] || '5');
const MIN_VOLUME   = parseFloat(args.find(a => a.startsWith('--min-volume='))?.split('=')[1] || '50000');
const BRIEF_TTL_MS = 6 * 60 * 60 * 1000;   // Don't re-brief same market within 6h
const MAX_HISTORY_ENTRIES = 48;              // Keep ~48h of hourly snapshots per market

// Volume-vs-liquidity ratios that signal unusual activity (heuristic fallback)
// vol24h / liquidity — normal is ~0.5-2x, >5x is unusual
const VVL_SPIKE_THRESHOLD = 8; // vol24h must be >8x liquidity (conservative fallback)

// ── Helpers ──────────────────────────────────────────────────────────────────
function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return fallback; }
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function toEST(isoStr) {
  return new Date(isoStr).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: true
  });
}

/** Shorten dollar amount for display (e.g. $1.2M, $45K) */
function fmtUsd(n) {
  if (n == null || isNaN(n)) return 'N/A';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** Get 24h volume from market object (handles field name variants) */
function getVol24h(m) {
  return m.volume24hr || m.volume_24h_usd || m.volume24h || 0;
}

/** Get yes price from market object (handles currentPrices format, case-insensitive) */
function getYesPrice(m) {
  if (m.yes_price != null) return m.yes_price;
  if (m.currentPrices) {
    return m.currentPrices.Yes ?? m.currentPrices.yes ?? m.currentPrices.YES ?? null;
  }
  return null;
}

function getNoPrice(m) {
  if (m.no_price != null) return m.no_price;
  if (m.currentPrices) {
    return m.currentPrices.No ?? m.currentPrices.no ?? m.currentPrices.NO ?? null;
  }
  return null;
}

/** Build a one-sentence narrative for the content brief */
function buildNarrative(market, spikeRatio, baselineVol, spikeSource) {
  const q = market.question || market.title || 'this market';
  const yesP = getYesPrice(market);
  const vol24h = getVol24h(market);

  const flowLabel = {
    MINORITY_HEAVY: 'counter-consensus (minority-side accumulation)',
    MAJORITY_ALIGNED: 'consensus-aligned',
    MIXED: 'mixed-direction',
    NEUTRAL: 'neutral',
  }[market.flow_direction_v2 || market.flow_direction || 'NEUTRAL'] || 'notable';

  const priceStr = yesP != null
    ? ` (YES at ${Math.round(yesP * 100)}¢)`
    : '';

  const threatLabel = (market.threat_score || 0) >= 30 ? 'HIGH-CONVICTION anomaly' :
                      (market.threat_score || 0) >= 15 ? 'MODERATE signal' :
                      'volume-only (no strong wallet anomaly yet)';

  const spikeDesc = spikeSource === 'history'
    ? `${spikeRatio.toFixed(1)}x above its ${fmtUsd(baselineVol)}/day baseline`
    : spikeSource === 'velocity'
    ? `${spikeRatio.toFixed(1)}x above recent baseline (Vercel velocity tracker)`
    : `${spikeRatio.toFixed(1)}x its liquidity pool (${fmtUsd(baselineVol)} liq, ${fmtUsd(vol24h)} vol/24h)`;

  return [
    `Volume on "${q}" surged ${spikeDesc}.`,
    `Flow is ${flowLabel}${priceStr}.`,
    `Threat score: ${market.threat_score || 0} (${threatLabel}).`,
  ].join(' ');
}

/** Generate a content brief template for BRAND */
function buildContentBrief(market, spikeRatio, baselineVol, spikeSource) {
  const q = market.question || market.title || 'Unknown market';
  const vol24h = getVol24h(market);
  const flow = market.flow_direction_v2 || market.flow_direction || 'UNKNOWN';
  const score = market.threat_score || 0;
  const yesP = getYesPrice(market);
  const noP  = getNoPrice(market);
  const yesPStr = yesP != null ? `${Math.round(yesP * 100)}¢` : 'N/A';
  const noPStr  = noP  != null ? `${Math.round(noP  * 100)}¢` : 'N/A';

  const baselineDesc = spikeSource === 'history'
    ? `${fmtUsd(baselineVol)}/day historical avg`
    : spikeSource === 'velocity'
    ? `${fmtUsd(baselineVol)} recent avg (velocity tracker)`
    : `${fmtUsd(baselineVol)} liquidity pool`;

  const lines = [
    `MARKET: ${q}`,
    `VOLUME: ${fmtUsd(vol24h)} today vs ${baselineDesc} (${spikeRatio.toFixed(1)}x spike)`,
    `PRICES: YES ${yesPStr} / NO ${noPStr}`,
    `FLOW: ${flow}${market.minority_side_flow_usd ? ` — ${fmtUsd(market.minority_side_flow_usd)} on minority side` : ''}`,
    `THREAT SCORE: ${score}/100${score >= 15 ? ' ⚡' : ''}`,
    `CATEGORY: ${market.market_category || 'general'}`,
  ];

  if (market.context_note) lines.push(`CONTEXT: ${market.context_note}`);

  lines.push('', 'STORY ANGLE:');

  if (flow === 'MINORITY_HEAVY' && score >= 20) {
    lines.push('→ Someone is betting against consensus with serious money. Insider timing?');
    lines.push('→ Investigate: any recent unconfirmed news? Correlated markets moving?');
    lines.push('→ Look at wallet ages — fresh wallets on minority side = strongest insider signal.');
  } else if (flow === 'MINORITY_HEAVY') {
    lines.push('→ Counter-consensus positioning with unusual volume — could be informed or contrarian.');
    lines.push('→ Worth monitoring: if volume continues and score rises, escalate to HIGH priority.');
  } else if (flow === 'MAJORITY_ALIGNED') {
    lines.push('→ Broad consensus suddenly piling in — public narrative shift underway.');
    lines.push('→ Find the catalyst: what news broke in the last 24h on this topic?');
    lines.push('→ If catalyst is obvious (news article), not a signal. If no catalyst found, investigate.');
  } else if (spikeRatio >= 10) {
    lines.push(`→ Extreme ${spikeRatio.toFixed(0)}x volume surge — this market matters to someone right now.`);
    lines.push('→ Check: any upcoming event, deadline, or announcement related to this topic?');
  } else {
    lines.push('→ Volume surge may reflect developing news. Monitor for catalyst.');
    lines.push('→ Check recent news in last 24h related to this topic.');
  }

  if (market.new_market_flag) {
    lines.push('', '⚠️  NEWLY CREATED MARKET (<48h old) — volume surge on a new market is especially anomalous.');
  }

  if ((market.veteran_minority_flow_score || 0) > 0) {
    lines.push(``, `🧠 VETERAN WALLETS: Established wallets driving minority flow (score=${market.veteran_minority_flow_score}).`);
  }

  if (market.off_hours_amplified) {
    lines.push(``, `🌙 OFF-HOURS: ${Math.round((market.off_hours_trade_pct || 0) * 100)}% of trades during off-hours.`);
  }

  lines.push('', `🔗 https://prescience.markets/market/${market.slug || market.conditionId}`);

  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  const now = Date.now();
  console.log(`[volume-spike-detector] Starting — threshold=${THRESHOLD}x, min_volume=${fmtUsd(MIN_VOLUME)}, dry=${DRY_RUN}`);

  // 1. Fetch scan data
  let markets = [];
  try {
    const resp = await fetch(SCAN_URL, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    markets = data.scan || data.markets || [];
    console.log(`[volume-spike-detector] Fetched ${markets.length} markets from scan API`);
  } catch (err) {
    console.error(`[volume-spike-detector] Scan API error: ${err.message}`);
    process.exit(1);
  }

  // 2. Load history & existing briefs
  const history = loadJson(HISTORY_PATH, {});
  const briefsStore = loadJson(BRIEFS_PATH, { last_updated: null, briefs: [] });
  const existingBriefs = briefsStore.briefs || [];

  // 3. Update history with current scan data
  for (const m of markets) {
    const id = m.conditionId || m.slug;
    if (!id) continue;
    const vol24h = getVol24h(m);

    if (!history[id]) {
      history[id] = { snapshots: [], question: m.question || m.title };
    }

    // Add snapshot (rate-limited to 1/hour per market)
    const snaps = history[id].snapshots;
    const lastSnap = snaps[snaps.length - 1];
    if (!lastSnap || (now - lastSnap.ts) >= 55 * 60 * 1000) { // 55-min grace
      snaps.push({ ts: now, vol24h });
      // Trim
      if (snaps.length > MAX_HISTORY_ENTRIES) {
        history[id].snapshots = snaps.slice(-MAX_HISTORY_ENTRIES);
      }
    }
  }

  // 4. Detect spikes
  const newBriefs = [];

  for (const m of markets) {
    const id = m.conditionId || m.slug;
    if (!id) continue;

    const vol24h = getVol24h(m);
    if (vol24h < MIN_VOLUME) continue; // Skip tiny markets

    // --- Method 1: Local history baseline ---
    const snaps = history[id]?.snapshots || [];
    // Older snapshots (>6h ago) to compute baseline
    const olderSnaps = snaps.filter(s => (now - s.ts) > 6 * 3600 * 1000 && (s.vol24h || 0) > 0);

    let spikeRatio = null;
    let baselineVol = null;
    let spikeSource = null;

    if (olderSnaps.length >= 2) {
      baselineVol = olderSnaps.reduce((sum, s) => sum + s.vol24h, 0) / olderSnaps.length;
      if (baselineVol > 0) {
        const ratio = vol24h / baselineVol;
        if (ratio >= THRESHOLD) {
          spikeRatio = ratio;
          spikeSource = 'history';
        }
      }
    }

    // --- Method 2: Vercel velocity.volume_spike_ratio ---
    if (!spikeRatio && m.velocity?.volume_spike_ratio != null && m.velocity.volume_spike_ratio >= THRESHOLD) {
      spikeRatio = m.velocity.volume_spike_ratio;
      // Reconstruct approximate baseline from ratio
      baselineVol = vol24h / spikeRatio;
      spikeSource = 'velocity';
    }

    // --- Method 3: Volume-vs-liquidity heuristic (fallback) ---
    // Requires liquidity >= MIN_VOLUME to be meaningful (skip micro-liquidity markets).
    // Skip pure sports markets — they routinely have high vol vs thin liq (not anomalous).
    if (!spikeRatio) {
      const liq = m.liquidity || 0;
      const cat = m.market_category || '';
      const isSports = cat === 'sports';
      const vvlThresholdHere = isSports ? VVL_SPIKE_THRESHOLD * 2 : VVL_SPIKE_THRESHOLD;
      if (liq >= MIN_VOLUME && vol24h / liq >= vvlThresholdHere) {
        spikeRatio = vol24h / liq;
        baselineVol = liq; // liquidity as proxy for "normal" volume
        spikeSource = 'vvl_heuristic';
      }
    }

    if (!spikeRatio) continue; // No spike detected

    // Check dedup: don't re-brief same market within TTL
    const recent = existingBriefs.find(b =>
      b.conditionId === id && (now - new Date(b.detected_at).getTime()) < BRIEF_TTL_MS
    );
    if (recent) {
      console.log(`[volume-spike-detector] Skipping ${id} — briefed ${((now - new Date(recent.detected_at).getTime()) / 3600000).toFixed(1)}h ago`);
      continue;
    }

    // Build brief
    const brief = {
      id: `vspike-${id.slice(-12)}-${now}`,
      detected_at: new Date(now).toISOString(),
      detected_at_est: toEST(new Date(now).toISOString()),
      conditionId: id,
      slug: m.slug,
      market_question: m.question || m.title || id,
      current_volume_24h_usd: Math.round(vol24h),
      baseline_volume_usd: Math.round(baselineVol),
      spike_ratio: Math.round(spikeRatio * 10) / 10,
      spike_source: spikeSource,
      flow_direction: m.flow_direction_v2 || m.flow_direction || 'UNKNOWN',
      threat_score: m.threat_score || 0,
      threat_level: m.threat_level || 'LOW',
      yes_price: getYesPrice(m),
      no_price: getNoPrice(m),
      market_category: m.market_category,
      new_market_flag: m.new_market_flag || false,
      veteran_minority_flow_score: m.veteran_minority_flow_score || 0,
      minority_side_flow_usd: m.minority_side_flow_usd || 0,
      off_hours_amplified: m.off_hours_amplified || false,
      velocity_score: m.velocity?.score || 0,
      narrative: buildNarrative(m, spikeRatio, baselineVol, spikeSource),
      content_brief: buildContentBrief(m, spikeRatio, baselineVol, spikeSource),
      status: 'new',
      used_by_brand: false,
    };

    newBriefs.push(brief);
    console.log(`[volume-spike-detector] SPIKE [${spikeSource}]: ${brief.market_question.slice(0, 70)}`);
    console.log(`  → ${spikeRatio.toFixed(1)}x (${fmtUsd(vol24h)} vol vs ${fmtUsd(baselineVol)} baseline) | flow=${brief.flow_direction} | score=${brief.threat_score}`);
  }

  // 5. Write outputs
  if (!DRY_RUN) {
    saveJson(HISTORY_PATH, history);

    // Merge new briefs into store (newest first, cap at 100)
    const merged = [...newBriefs, ...existingBriefs].slice(0, 100);
    saveJson(BRIEFS_PATH, {
      last_updated: new Date(now).toISOString(),
      last_updated_est: toEST(new Date(now).toISOString()),
      total_briefs: merged.length,
      new_this_run: newBriefs.length,
      briefs: merged,
    });

    console.log(`[volume-spike-detector] Wrote ${newBriefs.length} new briefs to ${BRIEFS_PATH}`);
    console.log(`[volume-spike-detector] Updated history for ${Object.keys(history).length} markets`);
  } else {
    console.log(`[volume-spike-detector] DRY RUN — would have written ${newBriefs.length} briefs`);
    if (newBriefs.length > 0) newBriefs.forEach(b => console.log(b.content_brief));
  }

  // Summary output (for cron logs)
  const summary = {
    run_at: new Date(now).toISOString(),
    markets_scanned: markets.length,
    markets_with_history: Object.keys(history).length,
    spikes_detected: newBriefs.length,
    spikes: newBriefs.map(b => ({
      question: b.market_question.slice(0, 60),
      spike_ratio: b.spike_ratio,
      spike_source: b.spike_source,
      volume: fmtUsd(b.current_volume_24h_usd),
      flow: b.flow_direction,
      score: b.threat_score,
    })),
  };
  console.log(JSON.stringify(summary));
  return summary;
}

run().catch(err => {
  console.error('[volume-spike-detector] Fatal:', err.message);
  process.exit(1);
});
