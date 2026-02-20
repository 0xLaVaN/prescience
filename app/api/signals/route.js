import { NextResponse } from 'next/server';
import { getActiveMarkets, getMarketTrades, fetchJSON } from '../_lib/polymarket';
import { getKalshiCached, getKalshiActiveMarkets, getKalshiMarketTrades, findCrossExchangeMatches } from '../_lib/kalshi';
import { computeDampening, applyDampening } from '../_lib/dampening';
import { requirePayment } from '../_lib/auth.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';

/**
 * Estimate fair value from flow/wallet intelligence.
 * Weighted average of:
 *   1. Flow-implied price (what side money is flowing to)
 *   2. Large-position implied price (sophisticated wallets)
 *   3. Fresh wallet consensus (new entrant belief)
 */
function estimateFairValue({ currentPrice, minoritySideFlow, majoritySideFlow, minorityOutcome, majorityOutcome, freshWalletRatio, largePositionRatio, flowDirectionV2, outcomeBuyVolume, wallets }) {
  // currentPrice is for the minority outcome (the side smart money may be buying)
  const totalFlow = minoritySideFlow + majoritySideFlow;
  if (totalFlow === 0 || !currentPrice) return null;

  // 1. Flow-implied price: if 40% of money goes to minority at 27¢, flow implies ~40¢
  const minorityFlowRatio = totalFlow > 0 ? minoritySideFlow / totalFlow : 0;
  const flowImpliedPrice = Math.min(0.95, Math.max(0.05, minorityFlowRatio));

  // 2. Large position implied: if sophisticated wallets are buying, nudge up
  // Large positions imply higher conviction → higher fair value
  const largePositionBoost = largePositionRatio > 0.05 ? 0.05 + (largePositionRatio * 0.3) : 0;

  // 3. Fresh wallet consensus: high fresh ratio on minority side = new info entering market
  const freshBoost = freshWalletRatio > 0.4 ? 0.03 + (freshWalletRatio - 0.4) * 0.15 : 0;

  // Weighted combo
  const fairValue = (flowImpliedPrice * 0.6) + ((currentPrice + largePositionBoost) * 0.25) + ((currentPrice + freshBoost) * 0.15);

  return Math.round(Math.min(0.95, Math.max(0.05, fairValue)) * 100) / 100;
}

/**
 * Compute confidence score (1-5) based on signal strength
 */
function computeConfidence({ threatScore, flowDirectionV2, freshWalletExcess, largePositionRatio, totalWallets, isDampened }) {
  if (isDampened) return 1;
  let score = 1;
  if (threatScore > 40) score += 2;
  else if (threatScore > 20) score += 1;
  if (flowDirectionV2 === 'MINORITY_HEAVY') score += 1;
  if (freshWalletExcess > 0.10) score += 0.5;
  if (largePositionRatio > 0.05) score += 0.5;
  if (totalWallets > 50) score += 0.5;
  return Math.min(5, Math.round(score));
}

/**
 * Build thesis string from signal data
 */
function buildThesis({ freshWallets, flowDirectionV2, minorityOutcome, majorityOutcome, minoritySideFlow, majoritySideFlow, largePositions, totalWallets, freshWalletRatio }) {
  const parts = [];
  if (freshWallets > 5) parts.push(`${freshWallets} fresh wallets`);
  if (flowDirectionV2 === 'MINORITY_HEAVY') {
    const ratio = majoritySideFlow > 0 ? (minoritySideFlow / majoritySideFlow).toFixed(1) : '∞';
    parts.push(`MINORITY_HEAVY flow (${ratio}:1 ${minorityOutcome}/${majorityOutcome})`);
  } else if (flowDirectionV2 === 'MIXED') {
    parts.push('MIXED flow direction');
  }
  if (largePositions > 0) parts.push(`${largePositions} large positions`);
  if (freshWalletRatio > 0.5) parts.push(`${Math.round(freshWalletRatio * 100)}% fresh wallet ratio`);
  return parts.join(', ') || 'Low signal activity';
}

async function handleSignals(request) {
  try {
    const { searchParams } = new URL(request.url);
    const minConfidence = searchParams.get('min_confidence')?.toUpperCase(); // HIGH, MEDIUM, LOW
    const actionFilter = searchParams.get('action')?.split(',').map(a => a.trim().toUpperCase()); // BUY_YES,BUY_NO
    const limit = Math.min(parseInt(searchParams.get('limit')) || 20, 50);
    const maxDays = parseInt(searchParams.get('max_days')) || 90;

    // Fetch top markets by volume for deep analysis
    const deepLimit = 50;
    const activeMarkets = await getActiveMarkets(deepLimit);
    const polyMarkets = activeMarkets.map(m => ({ ...m, exchange: 'polymarket' }));

    // Include cached Kalshi markets
    let kalshiMarkets = [];
    try {
      const kalshiCached = getKalshiCached();
      kalshiMarkets = kalshiCached.data || [];
      if (!kalshiCached.isFresh) {
        kalshiMarkets = await getKalshiActiveMarkets(30).catch(() => []);
      }
    } catch { /* ignore */ }

    // Cross-exchange matching for arb detection
    const crossMatches = kalshiMarkets.length > 0
      ? findCrossExchangeMatches(polyMarkets, kalshiMarkets)
      : [];
    const crossMap = new Map();
    for (const m of crossMatches) {
      crossMap.set(m.polymarket.conditionId, m);
    }

    const allMarkets = [...polyMarkets, ...kalshiMarkets];
    const signals = [];

    // Process in batches
    const BATCH_SIZE = 15;
    for (let i = 0; i < allMarkets.length; i += BATCH_SIZE) {
      const batch = allMarkets.slice(i, i + BATCH_SIZE);
      const tradeResults = await Promise.all(
        batch.map(market =>
          (market.exchange === 'kalshi'
            ? getKalshiMarketTrades(market.conditionId, 300)
            : getMarketTrades(market.conditionId, 300)
          ).catch(() => [])
        )
      );

      for (let j = 0; j < batch.length; j++) {
        const market = batch[j];
        const trades = tradeResults[j];
        if (!trades || trades.length < 3) continue;

        try {
          const now = Date.now() / 1000;
          const wallets = {};
          let freshWalletCount = 0;
          let buyVolume = 0, sellVolume = 0;
          const outcomeBuyVolume = {};

          for (const t of trades) {
            const w = (t.proxyWallet || '').toLowerCase();
            if (!w) continue;
            const size = (t.size || 0) * (t.price || 0);
            if (!wallets[w]) wallets[w] = { firstSeen: t.timestamp, volume: 0, trades: 0 };
            wallets[w].volume += size;
            wallets[w].trades++;
            if (t.timestamp < wallets[w].firstSeen) wallets[w].firstSeen = t.timestamp;
            if (t.side === 'BUY') {
              buyVolume += size;
              const outcome = t.outcome || 'unknown';
              outcomeBuyVolume[outcome] = (outcomeBuyVolume[outcome] || 0) + size;
            } else {
              sellVolume += size;
            }
          }

          for (const [, data] of Object.entries(wallets)) {
            const ageDays = (now - data.firstSeen) / 86400;
            if (ageDays < 7 && data.volume > 50) freshWalletCount++;
          }

          const totalVolume = buyVolume + sellVolume;
          const totalWallets = Object.keys(wallets).length;

          // Volume floor
          if (totalWallets < 10 || totalVolume < 500) continue;

          const freshWalletRatio = totalWallets > 0 ? freshWalletCount / totalWallets : 0;
          const isSampleCapped = trades.length >= 295;
          const BASELINE_FRESH_RATIO = isSampleCapped ? 0.60 : 0.30;
          const excessFreshRatio = Math.max(0, freshWalletRatio - BASELINE_FRESH_RATIO);

          const largePositionThreshold = 1000;
          const largePositions = Object.values(wallets).filter(w => w.volume >= largePositionThreshold).length;
          const largePositionRatio = totalWallets > 0 ? largePositions / totalWallets : 0;

          // Parse current prices
          let currentPrices = {};
          try {
            const outcomes = JSON.parse(market.outcomes || '[]');
            const prices = JSON.parse(market.outcomePrices || '[]');
            outcomes.forEach((o, i) => { currentPrices[o] = parseFloat(prices[i]); });
          } catch {}

          // flow_direction_v2
          let flowDirectionV2 = 'NEUTRAL';
          let minoritySideFlow = 0, majoritySideFlow = 0;
          let minorityOutcome = null, majorityOutcome = null;
          try {
            const prices = JSON.parse(market.outcomePrices || '[]');
            const outcomes = JSON.parse(market.outcomes || '[]');
            if (outcomes.length === 2 && prices.length === 2) {
              const p0 = parseFloat(prices[0]) || 0, p1 = parseFloat(prices[1]) || 0;
              const majIdx = p0 >= p1 ? 0 : 1, minIdx = 1 - majIdx;
              majorityOutcome = outcomes[majIdx];
              minorityOutcome = outcomes[minIdx];
              majoritySideFlow = outcomeBuyVolume[majorityOutcome] || 0;
              minoritySideFlow = outcomeBuyVolume[minorityOutcome] || 0;
              const totalOutcomeFlow = majoritySideFlow + minoritySideFlow;
              if (totalOutcomeFlow > 0) {
                const minorityRatio = minoritySideFlow / totalOutcomeFlow;
                flowDirectionV2 = minorityRatio > 0.3 ? 'MINORITY_HEAVY' : minorityRatio > 0.1 ? 'MIXED' : 'MAJORITY_ALIGNED';
              }
            }
          } catch {}

          // Compute threat score (simplified from scan — reuses same formula)
          const absImbalance = Math.abs(totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0);
          let flowV2Score;
          if (flowDirectionV2 === 'MINORITY_HEAVY') {
            const mr = (minoritySideFlow + majoritySideFlow) > 0 ? minoritySideFlow / (minoritySideFlow + majoritySideFlow) : 0;
            flowV2Score = 4 + Math.min(1, mr);
          } else if (flowDirectionV2 === 'MIXED') {
            const mr = (minoritySideFlow + majoritySideFlow) > 0 ? minoritySideFlow / (minoritySideFlow + majoritySideFlow) : 0;
            flowV2Score = 2 + Math.min(1, mr * 3);
          } else {
            flowV2Score = absImbalance * 1;
          }

          const effectiveFwExcess = excessFreshRatio * (
            flowDirectionV2 === 'MAJORITY_ALIGNED' ? 0.2 :
            flowDirectionV2 === 'MIXED' ? 0.6 : 1.0
          );

          const liq = parseFloat(market.liquidityNum) || 1;
          const vol24 = parseFloat(market.volume24hr) || totalVolume;
          const volumeVsLiquidityRatio = liq > 0 ? Math.min(vol24 / liq, 5) / 5 : 0;
          const volLiqMult = flowDirectionV2 === 'MAJORITY_ALIGNED' ? 0.5 : 1.0;

          const rawConviction = (flowV2Score / 5) * 5 + Math.min(largePositionRatio, 1) * 3 + Math.min(effectiveFwExcess / 0.4, 1) * 2 + (volumeVsLiquidityRatio * volLiqMult) * 1;
          let threatScore = Math.round((rawConviction / 11) * 100);

          // Dampening
          const dampening = computeDampening(market);
          const isDampened = dampening.isDampened;
          if (isDampened) threatScore = applyDampening(threatScore, dampening.factor);

          // Consensus caps
          let consensusDampened = false;
          try {
            const prices = JSON.parse(market.outcomePrices || '[]');
            const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
            if (maxPrice >= 0.98 && excessFreshRatio <= 0.20) { threatScore = Math.round(threatScore * 0.4); consensusDampened = true; }
          } catch {}
          if (largePositions === 0) threatScore = Math.min(threatScore, 50);
          if (excessFreshRatio <= 0) threatScore = Math.min(threatScore, 6);
          if (consensusDampened && excessFreshRatio < 0.10) threatScore = Math.min(threatScore, 5);
          else if (consensusDampened) threatScore = Math.min(threatScore, 10);

          // Resolution timing
          const endDate = market.endDate ? new Date(market.endDate) : null;
          const daysToResolution = endDate ? Math.round((endDate.getTime() - Date.now()) / 86400000) : null;

          // Skip markets resolving >maxDays out
          if (daysToResolution !== null && daysToResolution > maxDays) continue;

          // Near-expiry noise
          const hoursToExpiry = endDate ? (endDate.getTime() - Date.now()) / 3600000 : Infinity;
          let expiryNoise = false;
          try {
            const prices = JSON.parse(market.outcomePrices || '[]');
            const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
            if (hoursToExpiry < 48 && maxPrice >= 0.95) expiryNoise = true;
          } catch {}

          // Determine action
          const minorityPrice = minorityOutcome ? (currentPrices[minorityOutcome] || 0) : 0;
          const majorityPrice = majorityOutcome ? (currentPrices[majorityOutcome] || 0) : 0;

          const confidence = computeConfidence({
            threatScore, flowDirectionV2, freshWalletExcess: effectiveFwExcess,
            largePositionRatio, totalWallets, isDampened
          });

          // Fair value estimation
          const fairValue = estimateFairValue({
            currentPrice: minorityPrice,
            minoritySideFlow, majoritySideFlow,
            minorityOutcome, majorityOutcome,
            freshWalletRatio, largePositionRatio,
            flowDirectionV2, outcomeBuyVolume, wallets
          });

          const edge = fairValue !== null ? Math.round((fairValue - minorityPrice) * 100) / 100 : null;
          const edgePct = (edge !== null && minorityPrice > 0) ? Math.round((edge / minorityPrice) * 10000) / 100 : null;

          // Skip if edge too small
          if (edge !== null && Math.abs(edge) < 0.05) continue;

          // Determine action
          let action;
          if (isDampened || expiryNoise || threatScore < 10) {
            action = 'AVOID';
          } else if (threatScore > 20 && flowDirectionV2 === 'MINORITY_HEAVY' && confidence >= 3) {
            action = minorityOutcome === 'Yes' ? 'BUY_YES' : 'BUY_NO';
          } else if (threatScore >= 10 || confidence === 2) {
            action = 'WATCH';
          } else {
            action = 'AVOID';
          }

          // Only return actionable signals
          if (action === 'AVOID') continue;

          // Time sensitivity
          let timeSensitivity = 'LOW';
          if (daysToResolution !== null && daysToResolution < 3) timeSensitivity = 'URGENT';
          else if (daysToResolution !== null && daysToResolution < 14) timeSensitivity = 'MODERATE';
          if (vol24 > liq * 2) timeSensitivity = 'URGENT'; // volume accelerating

          const confidenceLabel = confidence >= 4 ? 'HIGH' : confidence >= 3 ? 'MEDIUM' : 'LOW';

          // Build false positive flags
          const falsePositiveFlags = [];
          if (isDampened) falsePositiveFlags.push(dampening.reason);
          if (consensusDampened) falsePositiveFlags.push('consensus_dampened');
          if (expiryNoise) falsePositiveFlags.push('near_expiry_noise');

          const signal = {
            market: market.question,
            slug: market.slug || market.conditionId,
            exchange: market.exchange || 'polymarket',
            action,
            current_price: {
              yes: currentPrices['Yes'] || currentPrices['yes'] || null,
              no: currentPrices['No'] || currentPrices['no'] || null,
            },
            confidence: confidenceLabel,
            confidence_score: confidence,
            thesis: buildThesis({
              freshWallets: freshWalletCount, flowDirectionV2,
              minorityOutcome, majorityOutcome,
              minoritySideFlow, majoritySideFlow,
              largePositions, totalWallets, freshWalletRatio
            }),
            signals: {
              threat_score: threatScore,
              flow_direction: flowDirectionV2,
              fresh_wallet_ratio: Math.round(freshWalletRatio * 100) / 100,
              fresh_wallet_excess: Math.round(effectiveFwExcess * 100) / 100,
              large_position_ratio: Math.round(largePositionRatio * 100) / 100,
              volume_24hr: vol24,
            },
            edge: {
              estimated_fair_value: fairValue,
              edge: edge,
              edge_pct: edgePct,
              minority_outcome: minorityOutcome,
            },
            timing: {
              resolves: endDate ? endDate.toISOString().split('T')[0] : null,
              days_to_resolution: daysToResolution,
              urgency: timeSensitivity,
            },
            risk: {
              false_positive_flags: falsePositiveFlags,
              dampened: isDampened,
              expiry_noise: expiryNoise,
            },
            updated_at: new Date().toISOString(),
          };

          // Cross-exchange arb detection
          const cross = crossMap.get(market.conditionId);
          if (cross) {
            signal.arb_opportunity = {
              kalshi_price: cross.kalshiPrice,
              polymarket_price: cross.polyPrice,
              price_divergence: cross.priceDivergence,
              similarity: cross.similarity,
            };
          }

          signals.push(signal);
        } catch (err) {
          console.error(`Signal processing failed for ${market?.question?.slice(0, 40)}:`, err?.message);
        }
      }
    }

    // Sort by edge_pct descending (biggest mispricing first)
    signals.sort((a, b) => Math.abs(b.edge?.edge_pct || 0) - Math.abs(a.edge?.edge_pct || 0));

    // Apply filters
    let filtered = signals;
    if (minConfidence) {
      const minMap = { HIGH: 4, MEDIUM: 3, LOW: 1 };
      const minScore = minMap[minConfidence] || 1;
      filtered = filtered.filter(s => s.confidence_score >= minScore);
    }
    if (actionFilter) {
      filtered = filtered.filter(s => actionFilter.includes(s.action));
    }

    const output = filtered.slice(0, limit);

    return NextResponse.json({
      signals: output,
      meta: {
        total_markets_scanned: allMarkets.length,
        signals_generated: output.length,
        signals_before_filter: signals.length,
        scan_timestamp: new Date().toISOString(),
        filters: {
          max_resolution_days: maxDays,
          min_edge: 0.05,
          min_confidence: minConfidence || 'none',
          action_filter: actionFilter || 'all',
        },
        engine: 'Prescience Signals v1.0',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Signal generation failed', detail: err.message }, { status: 500 });
  }
}

export const GET = requirePayment(handleSignals);
