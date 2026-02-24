import { NextResponse } from 'next/server';
import { getActiveMarkets, getAllActiveMarkets, getMarketTrades, fetchJSON } from '../_lib/polymarket';
import { getKalshiActiveMarkets, getKalshiCached, getKalshiMarketTrades, findCrossExchangeMatches } from '../_lib/kalshi';
import { computeDampening, applyDampening } from '../_lib/dampening';
import { computeWhaleIntelligence } from '../_lib/analysis.js';
import { computeVelocity } from '../_lib/velocity.js';
import { requirePayment } from '../_lib/auth.js';
import { computeContextScoring } from '../_lib/context-scoring.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const MARKET_CACHE_TTL = 15 * 60 * 1000;
const slugCache = new Map();

/**
 * Detect if a market is currently live (event in progress).
 * Live events should NOT be scored as signals — price reflects ongoing action.
 *
 * Strategy:
 *  1. Sports/esports keyword match (quick filter)
 *  2. endDate heuristic: if a game-style market ends within 8h, likely live
 *  3. Parse description for explicit start times (e.g. "8:00 PM ET")
 *
 * Returns: { isLive: bool, reason: string|null }
 */
function computeLiveEventFlag(market) {
  const q = (market.question || '').toLowerCase();
  const desc = (market.description || '').toLowerCase();
  const now = Date.now();

  const SPORT_PATTERNS = [
    /\bvs\.?\s/i, /\bnba\b/i, /\bnfl\b/i, /\bnhl\b/i, /\bmlb\b/i, /\bufc\b/i,
    /\bcbb\b/i, /\bcfb\b/i, /\bpremier league\b/i, /\bpga\b/i, /\btennis\b/i,
    /\bf1\b/i, /\bbox(ing)?\b/i, /\bmma\b/i, /\besport/i, /\bcs2\b/i,
    /\bwins? the\b/i, /\bcovers? the spread\b/i, /\bfinal score\b/i,
    /\bgold medal\b/i, /\bolympic/i,
    /celtics|lakers|warriors|knicks|76ers|heat|nuggets|bucks|suns|cavaliers|rockets|mavericks|thunder|nets|pelicans|spurs|bulls|pistons|hornets|raptors|blazers|kings|clippers|jazz|pacers|magic|hawks/i,
    /chiefs|eagles|ravens|bills|49ers|cowboys|packers|bears|lions|falcons|saints|browns|bengals|broncos|seahawks|rams|chargers|raiders|steelers|texans|colts|titans|jaguars|jets|giants|commanders/i,
    /bluejays|yankees|red sox|dodgers|mets|braves|cubs|cardinals|nationals|giants|phillies|astros|padres|mariners|orioles|tigers|twins|rays|royals/i,
    /mongolz|natus vincere|team liquid|cloud9|fnatic|vitality|navi|faze\b/i,
  ];

  const isSportLike = SPORT_PATTERNS.some(p => p.test(q) || p.test(desc));
  if (!isSportLike) return { isLive: false, reason: null };

  const endDateMs = market.endDate ? new Date(market.endDate).getTime() : null;
  if (!endDateMs) return { isLive: false, reason: null };

  const hoursToEnd = (endDateMs - now) / 3600000;

  // Market already resolved
  if (hoursToEnd < 0) return { isLive: true, reason: 'market_resolved' };

  // Short-duration sports market ending within 8 hours = almost certainly live/starting soon
  if (hoursToEnd < 8) return { isLive: true, reason: `ends_in_${Math.round(hoursToEnd * 10) / 10}h` };

  // Try to parse explicit start time from description ("8:00 PM ET", "20:00 UTC", "3pm EST")
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)\s*(et|est|edt|ct|cst|cdt|pt|pst|pdt|ut|utc)/i,
    /(\d{1,2})\s*(am|pm)\s*(et|est|edt|ct|pt|ut|utc)/i,
    /(\d{2}):(\d{2})\s*(utc|gmt|et|est|edt)/i,
  ];
  for (const pat of timePatterns) {
    const m = (market.question + ' ' + (market.description || '')).match(pat);
    if (m) {
      try {
        // Build a date from today + parsed time
        let h = parseInt(m[1]), min = parseInt(m[2] || '0');
        const ampm = (m[3] || '').toLowerCase();
        const tz = (m[4] || m[3] || '').toLowerCase();
        if (ampm === 'pm' && h < 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        // UTC offset: ET≈+5 (winter), CT≈+6, PT≈+8
        const utcOffset = /et|est/.test(tz) ? 5 : /ct|cst/.test(tz) ? 6 : /pt|pst/.test(tz) ? 8 : 0;
        const todayUTC = new Date();
        todayUTC.setUTCHours(h + utcOffset, min, 0, 0);
        const eventStartMs = todayUTC.getTime();
        // If event started in the last 6h and hasn't ended yet
        if (eventStartMs <= now && now - eventStartMs < 6 * 3600000) {
          return { isLive: true, reason: `event_started_${Math.round((now - eventStartMs) / 60000)}min_ago` };
        }
      } catch { /* time parse failed, skip */ }
    }
  }

  return { isLive: false, reason: null };
}

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
        // Use standard fetch sorted by volume for deep scan candidates
        // Use batch fetch for lightweight coverage (cached, doesn't block)
        const polyDeepLimit = Math.min(limit, 50); // Top 50 by volume for deep scan
        const polyBroadLimit = Math.max(limit * 2, 200); // Broader set for lightweight
        // Fast fetch: top markets by volume (single API call, ~200ms)
        marketPromises.push(
          getActiveMarkets(polyDeepLimit)
            .then(markets => markets.map(m => ({ ...m, exchange: 'polymarket', _deepScanCandidate: true })))
            .catch(() => [])
        );
        // Broad fetch: all active for lightweight coverage (cached after first call)
        marketPromises.push(
          getAllActiveMarkets(polyBroadLimit)
            .then(markets => {
              polymarketCount = markets.length;
              return markets.map(m => ({ ...m, exchange: 'polymarket' }));
            })
            .catch(err => {
              console.error('Polymarket broad fetch failed:', err);
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

      // Dedup by conditionId (deep candidates + broad may overlap)
      const seen = new Set();
      const deduped = [];
      for (const m of allFetched) {
        const key = `${m.exchange}_${m.conditionId}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(m);
        }
      }

      // Cross-exchange dedup: if same question on both exchanges, merge
      const polyMarkets = deduped.filter(m => m.exchange === 'polymarket');
      const kalshiMarkets = deduped.filter(m => m.exchange === 'kalshi');

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

    // Split: deep-scan candidates (top by volume, flagged during fetch) vs lightweight
    const deepCandidates = activeMarkets.filter(m => m._deepScanCandidate);
    const sorted = [...activeMarkets].sort((a, b) => (parseFloat(b.volume24hr) || 0) - (parseFloat(a.volume24hr) || 0));
    // Deep scan: use flagged candidates, or top 40 by volume
    const deepScanLimit = 40;
    const deepScanMarkets = deepCandidates.length > 0 
      ? deepCandidates.slice(0, deepScanLimit)
      : sorted.slice(0, deepScanLimit);
    const deepIds = new Set(deepScanMarkets.map(m => `${m.exchange}_${m.conditionId}`));
    const lightweightMarkets = activeMarkets.filter(m => !deepIds.has(`${m.exchange}_${m.conditionId}`));

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
        let offHoursTrades = 0, offHoursVolume = 0, offHoursLargeVolume = 0;

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

          // Off-hours detection (22:00-06:00 EST = 03:00-11:00 UTC, or weekends)
          const tradeDate = new Date((t.timestamp || 0) * 1000);
          const utcHour = tradeDate.getUTCHours();
          const utcDay = tradeDate.getUTCDay(); // 0=Sun, 6=Sat
          const isWeekend = utcDay === 0 || utcDay === 6;
          const isOffHoursUTC = utcHour >= 3 && utcHour < 11; // 22:00-06:00 EST
          if (isWeekend || isOffHoursUTC) {
            offHoursTrades++;
            offHoursVolume += size;
            if (size >= 5) offHoursLargeVolume += size; // $5+ trades (size is already in USD)
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
        const flowDampenedExcess = excessFreshRatio * (
          flowDirectionV2 === 'MAJORITY_ALIGNED' ? 0.2 :
          flowDirectionV2 === 'MIXED' ? 0.6 : 1.0
        );

        // Context-aware scoring: category classification + category-specific multipliers
        const contextScoring = computeContextScoring(market, {
          freshWalletExcess: excessFreshRatio,
          flowDirectionV2,
          currentPrices,
          threatScore: 0, // not yet computed — passed for reference only
          consensusDampened: false, // pre-dampening stage
        });
        // Apply context fw_excess multiplier ON TOP of flow-direction dampening
        const effectiveFwExcess = flowDampenedExcess * contextScoring.fw_excess_multiplier;
        const normFreshExcess = Math.min(effectiveFwExcess / 0.4, 1);

        const volLiqWeightMultiplier = flowDirectionV2 === 'MAJORITY_ALIGNED' ? 0.5 : 1.0;
        const normVolLiq = volumeVsLiquidityRatio * volLiqWeightMultiplier;

        const rawConviction = normFlowV2 * 5 + normLargePositionRatio * 3 + normFreshExcess * 2 + normVolLiq * 1;

        // Off-hours signal amplifier: large trades during off-hours get boosted
        const offHoursTradesPct = trades.length > 0 ? offHoursTrades / trades.length : 0;
        const offHoursMultiplier = offHoursLargeVolume >= 5000 ? 1.5 :
                                    offHoursLargeVolume >= 1000 ? 1.3 :
                                    offHoursTradesPct > 0.5 ? 1.15 : 1.0;

        let threatScore = Math.round((rawConviction / 11) * 100 * offHoursMultiplier);

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

        // NEW MARKET EARLY DETECTION: first 48h + whale activity = price mispricing window
        let newMarketFlag = false;
        let newMarketBoost = 0;
        let marketAgeHours = null;
        const createdAtRaw = market.createdAt || market.startDate;
        if (createdAtRaw) {
          const createdAtMs = new Date(createdAtRaw).getTime();
          if (!isNaN(createdAtMs)) {
            marketAgeHours = Math.round((Date.now() - createdAtMs) / 36000) / 100; // hours, 2dp
            if (marketAgeHours >= 0 && marketAgeHours < 48) {
              newMarketFlag = true;
              // Detect whale activity: max single-wallet volume OR total volume thresholds
              const maxSingleWalletVol = Math.max(0, ...Object.values(wallets).map(w => w.volume));
              if (!consensusDampened) {
                if (maxSingleWalletVol > 50000 || totalVolume > 100000) newMarketBoost = 5;
                else if (maxSingleWalletVol > 20000 || totalVolume > 50000) newMarketBoost = 4;
                else if (maxSingleWalletVol > 5000 || totalVolume > 10000) newMarketBoost = 3;
              }
              threatScore += newMarketBoost;
            }
          }
        }

        // Veteran minority flow scoring: detect large counter-consensus flows from established wallets
        let veteranMinorityFlowScore = 0;
        let veteranFlowNote = '';
        if (flowDirectionV2 === 'MINORITY_HEAVY' && excessFreshRatio < 0.05 && minoritySideFlow >= 50000 && !consensusDampened) {
          // Base score: 2-6 based on minority flow magnitude
          if (minoritySideFlow >= 500000) veteranMinorityFlowScore = 6;
          else if (minoritySideFlow >= 200000) veteranMinorityFlowScore = 4;
          else if (minoritySideFlow >= 100000) veteranMinorityFlowScore = 3;
          else veteranMinorityFlowScore = 2;

          // Time sensitivity multiplier
          const daysToResolution = market.endDate ? Math.max(0, (new Date(market.endDate).getTime() - Date.now()) / 86400000) : 365;
          let timeMult = 1.0;
          if (daysToResolution <= 7) timeMult = 1.5;
          else if (daysToResolution <= 30) timeMult = 1.2;
          else if (daysToResolution > 365) timeMult = 0.5;

          veteranMinorityFlowScore = Math.round(veteranMinorityFlowScore * timeMult);
          threatScore += veteranMinorityFlowScore;

          const daysStr = daysToResolution < 1 ? '<1 day' : Math.round(daysToResolution) + ' days';
          veteranFlowNote = `$${Math.round(minoritySideFlow / 1000)}K minority ${minorityOutcome}-flow from veteran wallets, ${daysStr} to resolution`;
        }

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

        // Context-aware scoring: apply category dampening + extreme longshot cap
        if (contextScoring.context_dampening < 1.0) {
          threatScore = Math.round(threatScore * contextScoring.context_dampening);
        }
        if (contextScoring.threat_score_cap !== null) {
          threatScore = Math.min(threatScore, contextScoring.threat_score_cap);
        }

        // LIVE EVENT DETECTION — cap threat score at 0 for live games
        const liveEvent = computeLiveEventFlag(market);
        if (liveEvent.isLive) threatScore = 0;

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
          veteran_minority_flow_score: veteranMinorityFlowScore,
          ...(veteranFlowNote && { veteran_flow_note: veteranFlowNote }),
          ...(marketAgeHours !== null && { market_age_hours: marketAgeHours }),
          ...(newMarketFlag && { new_market_flag: true, new_market_boost: newMarketBoost }),
          off_hours_trade_pct: Math.round(offHoursTradesPct * 100) / 100,
          off_hours_volume_usd: Math.round(offHoursVolume * 100) / 100,
          off_hours_large_volume_usd: Math.round(offHoursLargeVolume * 100) / 100,
          ...(offHoursMultiplier > 1 && { off_hours_amplified: true, off_hours_multiplier: offHoursMultiplier }),
          market_category: contextScoring.market_category,
          ...(contextScoring.context_note && { context_note: contextScoring.context_note }),
          ...(contextScoring.fw_excess_multiplier < 1 && { context_fw_multiplier: contextScoring.fw_excess_multiplier }),
          ...(contextScoring.context_dampening < 1 && { context_dampening: contextScoring.context_dampening }),
        };

        // Add dampening info
        if (dampening.isDampened) {
          entry.is_dampened = true;
          entry.dampening_factor = dampening.factor;
          entry.dampening_reason = dampening.reason;
        }

        // Live event flag
        if (liveEvent.isLive) {
          entry.live_event = true;
          entry.live_event_reason = liveEvent.reason;
          entry.live_event_note = 'LIVE — price reflects ongoing event, not predictive flow. Do not signal.';
        }

        // Add cross-exchange data if present
        if (market._crossExchange) {
          entry.cross_exchange = market._crossExchange;
        }

        // Velocity detection
        const velocity = computeVelocity(market.conditionId, {
          volume24h: parseFloat(market.volume24hr) || totalVolume,
          totalVolume,
          totalWallets,
          freshWallets: freshWalletCount,
          flowDirectionV2,
          minoritySideFlow,
          majoritySideFlow,
          threatScore,
          liquidity: parseFloat(market.liquidityNum) || 1,
        });
        if (velocity.velocity_score > 0) {
          entry.velocity = {
            score: velocity.velocity_score,
            volume_spike_ratio: velocity.volume_spike_ratio,
            fresh_wallet_rate_per_hour: velocity.fresh_wallet_rate_per_hour,
            flow_changed: velocity.flow_changed,
            previous_flow: velocity.previous_flow,
            breakdown: velocity.details,
            snapshots_available: velocity.snapshots_available,
          };
        }

        // Whale intelligence (deep scan only, non-blocking)
        entry._conditionId = market.conditionId;
        entry._market = market;

        markets.push(entry);
      } catch (marketErr) {
        console.error(`Scan: market ${market?.question?.slice(0, 40)} failed:`, marketErr?.message);
      }
      } // end for j
    } // end for i (batch loop)

    // Whale intelligence enrichment for deep-scanned markets (top 40)
    // Process in parallel batches to respect rate limits
    const deepScannedMarkets = markets.filter(m => m._conditionId);
    const WHALE_BATCH = 10;
    for (let i = 0; i < deepScannedMarkets.length; i += WHALE_BATCH) {
      const batch = deepScannedMarkets.slice(i, i + WHALE_BATCH);
      const whaleResults = await Promise.all(
        batch.map(m =>
          computeWhaleIntelligence(m._conditionId, m._market).catch(err => {
            console.error(`Whale intel failed for ${m._conditionId}:`, err?.message);
            return null;
          })
        )
      );
      for (let j = 0; j < batch.length; j++) {
        const whale = whaleResults[j];
        if (whale) {
          batch[j].whale_intelligence = {
            whale_concentration: whale.whale_concentration,
            whale_concentration_pct: whale.whale_concentration_pct,
            fresh_whale: whale.fresh_whale,
            fresh_whale_count: whale.fresh_whale_count,
            whale_pnl_divergence: whale.whale_pnl_divergence,
            counter_flow: whale.counter_flow,
            counter_flow_detail: whale.counter_flow_detail,
            top_holders_count: whale.top_holders_count,
            whale_trades_count: whale.whale_trades_count,
            positions_count: whale.positions_count,
          };
        }
        // Clean up internal fields
        delete batch[j]._conditionId;
        delete batch[j]._market;
      }
    }

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

    // Volume floor output filter: remove any market that slipped through with insufficient activity
    // This is a belt-and-suspenders guard — the deep scan loop also has a continue check
    const filteredMarkets = markets.filter(m => {
      // Lightweight markets (no trade analysis) are OK — they show score=0
      if (m.scan_depth === 'lightweight') return true;
      // Deep-scanned markets must meet minimum thresholds
      if (m.total_wallets !== undefined && m.total_wallets < 10) return false;
      if (m.total_volume_usd !== undefined && m.total_volume_usd < 500) return false;
      return true;
    });

    filteredMarkets.sort((a, b) => b.threat_score - a.threat_score);
    const outputMarkets = filteredMarkets.slice(0, limit);

    return NextResponse.json({
      scan: outputMarkets,
      meta: {
        markets_scanned: outputMarkets.length,
        total_markets_analyzed: filteredMarkets.length,
        volume_floor_filtered: markets.length - filteredMarkets.length,
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
export { handleScan };
