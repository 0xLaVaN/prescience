import { NextResponse } from 'next/server';
import { getActiveMarkets, getAllActiveMarkets, getMarketTrades, fetchJSON } from '../_lib/polymarket';
import { getKalshiActiveMarkets, getKalshiCached, getKalshiMarketTrades, findCrossExchangeMatches } from '../_lib/kalshi';
import { computeDampening, applyDampening } from '../_lib/dampening';
import { requirePayment } from '../_lib/auth.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const MARKET_CACHE_TTL = 15 * 60 * 1000;
const slugCache = new Map();

async function handleScan(request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const exchange = searchParams.get('exchange'); // 'polymarket', 'kalshi', or 'both' (default: both)
    const limit = Math.min(parseInt(searchParams.get('limit')) || 100, 500);

    let activeMarkets = [];
    let kalshiCount = 0, polymarketCount = 0;

    if (slug) {
      // Handle specific market by slug
      const cacheKey = `market_slug_${slug}`;
      let market = slugCache.get(cacheKey);
      if (!market || Date.now() - market._ts > MARKET_CACHE_TTL) {
        const results = await fetchJSON(`${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}&limit=1`);
        market = results && results.length > 0 ? results[0] : null;
        if (market) {
          market._ts = Date.now();
          market.exchange = 'polymarket';
          slugCache.set(cacheKey, market);
        }
      }
      activeMarkets = market ? [market] : [];
    } else {
      const effectiveExchange = exchange || 'both';
      const fetchPolymarket = effectiveExchange === 'polymarket' || effectiveExchange === 'both';
      const fetchKalshi = effectiveExchange === 'kalshi' || effectiveExchange === 'both';

      const marketPromises = [];

      if (fetchPolymarket) {
        // Fetch 3x the limit to account for volume floor filtering
        const polyLimit = fetchKalshi ? Math.ceil(limit * 2) : Math.ceil(limit * 3);
        const fetcher = polyLimit > 50 ? getAllActiveMarkets(polyLimit) : getActiveMarkets(polyLimit);
        marketPromises.push(
          fetcher
            .then(markets => {
              polymarketCount = markets.length;
              return markets.map(m => ({ ...m, exchange: 'polymarket' }));
            })
            .catch(err => {
              console.error('Polymarket fetch failed:', err);
              return [];
            })
        );
      }

      if (fetchKalshi) {
        const kalshiLimit = fetchPolymarket ? Math.ceil(limit * 1) : Math.ceil(limit * 2);
        // Try cached first, fall back to fresh fetch
        const kalshiCached = getKalshiCached();
        if (kalshiCached.isFresh && kalshiCached.data.length > 0) {
          marketPromises.push(
            Promise.resolve(kalshiCached.data.slice(0, kalshiLimit)).then(markets => {
              kalshiCount = markets.length;
              return markets;
            })
          );
        } else {
          marketPromises.push(
            getKalshiActiveMarkets(kalshiLimit)
              .then(markets => {
                kalshiCount = markets.length;
                return markets;
              })
              .catch(err => {
                console.error('Kalshi fetch failed:', err);
                return [];
              })
          );
        }
      }

      const marketResults = await Promise.all(marketPromises);
      const allFetched = marketResults.flat();

      // Cross-exchange dedup: if same question on both exchanges, merge
      const polyMarkets = allFetched.filter(m => m.exchange === 'polymarket');
      const kalshiMarkets = allFetched.filter(m => m.exchange === 'kalshi');

      if (polyMarkets.length > 0 && kalshiMarkets.length > 0) {
        const matches = findCrossExchangeMatches(polyMarkets, kalshiMarkets);
        const dedupedKalshiIds = new Set(matches.map(m => m.kalshi.conditionId));

        // For matched markets, enrich polymarket entry with cross-exchange data
        for (const match of matches) {
          const polyEntry = polyMarkets.find(m => m.conditionId === match.polymarket.conditionId);
          if (polyEntry) {
            polyEntry._crossExchange = {
              kalshi_ticker: match.kalshi.conditionId,
              kalshi_price: match.kalshiPrice,
              poly_price: match.polyPrice,
              price_divergence: match.priceDivergence,
              similarity: match.similarity
            };
          }
        }

        // Include unmatched Kalshi markets + all Polymarket markets
        const unmatchedKalshi = kalshiMarkets.filter(m => !dedupedKalshiIds.has(m.conditionId));
        activeMarkets = [...polyMarkets, ...unmatchedKalshi];
      } else {
        activeMarkets = allFetched;
      }
    }

    const markets = [];
    let dampenedCount = 0;

    // Split: deep-scan top markets by volume, lightweight for the rest
    // Vercel hobby has 10s timeout. Each trade fetch ~300ms. 
    // With concurrency of 20, we can do ~20 markets per second → 40 markets in ~2s safe budget
    const sorted = [...activeMarkets].sort((a, b) => (parseFloat(b.volume24hr) || 0) - (parseFloat(a.volume24hr) || 0));
    const deepScanLimit = Math.min(sorted.length, 40);
    const deepScanMarkets = sorted.slice(0, deepScanLimit);
    const lightweightMarkets = sorted.slice(deepScanLimit);

    // Fetch trades concurrently in batches of 20
    const BATCH_SIZE = 20;
    for (let i = 0; i < deepScanMarkets.length; i += BATCH_SIZE) {
      const batch = deepScanMarkets.slice(i, i + BATCH_SIZE);
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
        try {
        if (!trades || trades.length < 3) continue;

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
        const flowImbalance = totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;

        let currentPrices = {};
        try {
          const outcomes = JSON.parse(market.outcomes || '[]');
          const prices = JSON.parse(market.outcomePrices || '[]');
          outcomes.forEach((o, i) => { currentPrices[o] = parseFloat(prices[i]); });
        } catch {}

        const absImbalance = Math.abs(flowImbalance);
        const totalWallets = Object.keys(wallets).length;

        // Volume floor: Skip markets with insufficient activity
        if (totalWallets < 10 || totalVolume < 500) {
          continue;
        }

        const freshWalletRatio = totalWallets > 0 ? freshWalletCount / totalWallets : 0;
        const isSampleCapped = trades.length >= 295;
        const BASELINE_FRESH_RATIO = isSampleCapped ? 0.60 : 0.30;
        const excessFreshRatio = Math.max(0, freshWalletRatio - BASELINE_FRESH_RATIO);

        const liq = parseFloat(market.liquidityNum) || 1;
        const largePositionThreshold = 1000;
        const largePositions = Object.values(wallets).filter(w => w.volume >= largePositionThreshold).length;
        const largePositionRatio = totalWallets > 0 ? largePositions / totalWallets : 0;
        const vol24 = parseFloat(market.volume24hr) || totalVolume;
        const volumeVsLiquidityRatio = liq > 0 ? Math.min(vol24 / liq, 5) / 5 : 0;

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

        let flowV2Score;
        if (flowDirectionV2 === 'MINORITY_HEAVY') {
          const minorityRatio = (minoritySideFlow + majoritySideFlow) > 0 ? minoritySideFlow / (minoritySideFlow + majoritySideFlow) : 0;
          flowV2Score = 4 + Math.min(1, minorityRatio);
        } else if (flowDirectionV2 === 'MIXED') {
          const minorityRatio = (minoritySideFlow + majoritySideFlow) > 0 ? minoritySideFlow / (minoritySideFlow + majoritySideFlow) : 0;
          flowV2Score = 2 + Math.min(1, minorityRatio * 3);
        } else {
          flowV2Score = absImbalance * 1;
        }
        const normFlowV2 = flowV2Score / 5;
        const normLargePositionRatio = Math.min(largePositionRatio, 1);

        // Dampening: flow_direction_v2 based
        const effectiveFwExcess = excessFreshRatio * (
          flowDirectionV2 === 'MAJORITY_ALIGNED' ? 0.2 :
          flowDirectionV2 === 'MIXED' ? 0.6 : 1.0
        );
        const normFreshExcess = Math.min(effectiveFwExcess / 0.4, 1);

        const volLiqWeightMultiplier = flowDirectionV2 === 'MAJORITY_ALIGNED' ? 0.5 : 1.0;
        const normVolLiq = volumeVsLiquidityRatio * volLiqWeightMultiplier;

        const rawConviction = normFlowV2 * 5 + normLargePositionRatio * 3 + normFreshExcess * 2 + normVolLiq * 1;
        let threatScore = Math.round((rawConviction / 11) * 100);

        // Existing dampening rules
        let consensusDampened = false;
        try {
          const prices = JSON.parse(market.outcomePrices || '[]');
          const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
          if (maxPrice >= 0.98 && excessFreshRatio <= 0.20) { threatScore = Math.round(threatScore * 0.4); consensusDampened = true; }
        } catch {}

        if (largePositions === 0) threatScore = Math.min(threatScore, 50);

        let freshExcessCapped = false;
        if (excessFreshRatio <= 0) { threatScore = Math.min(threatScore, 6); freshExcessCapped = true; }

        let nearExpiryConsensus = false;
        try {
          const prices = JSON.parse(market.outcomePrices || '[]');
          const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
          const hoursToExpiry = market.endDate ? (new Date(market.endDate).getTime() - Date.now()) / 3600000 : Infinity;
          if (hoursToExpiry < 48 && maxPrice >= 0.95) { nearExpiryConsensus = true; threatScore = Math.round(threatScore * 0.3); }
        } catch {}

        // NEW: False positive dampening (meme/sports/expiry rules)
        const dampening = computeDampening(market);
        if (dampening.isDampened) {
          threatScore = applyDampening(threatScore, dampening.factor);
          dampenedCount++;
        }

        // Consensus hard cap
        if (consensusDampened && excessFreshRatio < 0.10) threatScore = Math.min(threatScore, 5);
        else if (consensusDampened) threatScore = Math.min(threatScore, 10);

        const threatLevel = threatScore >= 70 ? 'CRITICAL' : threatScore >= 45 ? 'HIGH' : threatScore >= 25 ? 'MODERATE' : 'LOW';

        const entry = {
          exchange: market.exchange || 'polymarket',
          question: market.question,
          conditionId: market.conditionId,
          slug: market.slug,
          volume24hr: market.volume24hr,
          volumeTotal: market.volumeNum,
          liquidity: market.liquidityNum,
          endDate: market.endDate,
          currentPrices,
          fresh_wallets: freshWalletCount,
          fresh_wallet_ratio: Math.round(freshWalletRatio * 100) / 100,
          fresh_wallet_excess: Math.round(excessFreshRatio * 100) / 100,
          sample_capped: isSampleCapped,
          total_wallets: totalWallets,
          total_trades: trades.length,
          total_volume_usd: Math.round(totalVolume * 100) / 100,
          flow_direction: flowImbalance > 0.1 ? 'BUY' : flowImbalance < -0.1 ? 'SELL' : 'NEUTRAL',
          flow_imbalance: Math.round(Math.abs(flowImbalance) * 100) / 100,
          large_positions: largePositions,
          large_position_ratio: Math.round(largePositionRatio * 100) / 100,
          volume_vs_liquidity: Math.round(volumeVsLiquidityRatio * 100) / 100,
          threat_score: threatScore,
          threat_level: threatLevel,
          conviction_weights: { flow_direction_v2: 5, large_position_ratio: 3, fresh_wallet_excess: 2, volume_vs_liquidity: 1 },
          near_expiry_consensus: nearExpiryConsensus,
          flow_direction_v2: flowDirectionV2,
          minority_side_flow_usd: Math.round(minoritySideFlow * 100) / 100,
          majority_side_flow_usd: Math.round(majoritySideFlow * 100) / 100,
          minority_outcome: minorityOutcome,
          majority_outcome: majorityOutcome,
          consensus_dampened: consensusDampened,
          fresh_excess_capped: freshExcessCapped,
        };

        // Add dampening info
        if (dampening.isDampened) {
          entry.is_dampened = true;
          entry.dampening_factor = dampening.factor;
          entry.dampening_reason = dampening.reason;
        }

        // Add cross-exchange data if present
        if (market._crossExchange) {
          entry.cross_exchange = market._crossExchange;
        }

        markets.push(entry);
      } catch (marketErr) {
        console.error(`Scan: market ${market?.question?.slice(0, 40)} failed:`, marketErr?.message);
      }
      } // end for j
    } // end for i (batch loop)

    // Add lightweight markets (no trade analysis, basic metadata only)
    for (const market of lightweightMarkets) {
      let currentPrices = {};
      try {
        const outcomes = JSON.parse(market.outcomes || '[]');
        const prices = JSON.parse(market.outcomePrices || '[]');
        outcomes.forEach((o, i) => { currentPrices[o] = parseFloat(prices[i]); });
      } catch {}

      const dampening = computeDampening(market);
      if (dampening.isDampened) dampenedCount++;

      markets.push({
        exchange: market.exchange || 'polymarket',
        question: market.question,
        conditionId: market.conditionId,
        slug: market.slug,
        volume24hr: market.volume24hr,
        volumeTotal: market.volumeNum,
        liquidity: market.liquidityNum,
        endDate: market.endDate,
        currentPrices,
        threat_score: 0,
        threat_level: 'LOW',
        scan_depth: 'lightweight',
        is_dampened: dampening.isDampened || undefined,
        dampening_reason: dampening.reason || undefined,
      });
    }

    markets.sort((a, b) => b.threat_score - a.threat_score);
    const outputMarkets = markets.slice(0, limit);

    return NextResponse.json({
      scan: outputMarkets,
      meta: {
        markets_scanned: outputMarkets.length,
        total_markets_analyzed: markets.length,
        polymarket_markets: polymarketCount || markets.filter(m => m.exchange === 'polymarket').length,
        kalshi_markets: kalshiCount || markets.filter(m => m.exchange === 'kalshi').length,
        dampened_markets: dampenedCount,
        timestamp: new Date().toISOString(),
        engine: 'Prescience Scan v3.0 — Wide Net',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Market scan failed', detail: err.message }, { status: 500 });
  }
}

export const GET = requirePayment(handleScan);
