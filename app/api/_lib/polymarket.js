/**
 * PRESCIENCE — Shared Polymarket data fetching & scoring utilities
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';
const DATA_API = 'https://data-api.polymarket.com';

// Cache
const CACHE_TTL = 5 * 60 * 1000;
const MARKET_CACHE_TTL = 15 * 60 * 1000;

const cache = new Map();

function cached(key, ttl, fn) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return Promise.resolve(entry.data);
  return fn().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
  return res.json();
}

export async function getResolvedMarkets(limit = 50) {
  return cached(`resolved_markets_${limit}`, MARKET_CACHE_TTL, async () => {
    const markets = await fetchJSON(
      `${GAMMA_API}/markets?closed=true&limit=${limit}&order=closedTime&ascending=false`
    );
    return markets.filter(m => {
      try {
        const prices = JSON.parse(m.outcomePrices || '[]');
        return prices.some(p => parseFloat(p) === 1 || parseFloat(p) === 0);
      } catch { return false; }
    });
  });
}

export async function getActiveMarkets(limit = 30) {
  return cached(`active_markets_${limit}`, MARKET_CACHE_TTL, async () => {
    return fetchJSON(
      `${GAMMA_API}/markets?closed=false&limit=${limit}&order=volume24hr&ascending=false`
    );
  });
}

/**
 * Fetch ALL active Polymarket markets via pagination.
 * Returns up to maxMarkets, sorted by volume (descending).
 * Results cached for 15 min.
 */
export async function getAllActiveMarkets(maxMarkets = 2000) {
  return cached(`all_active_markets_${maxMarkets}`, MARKET_CACHE_TTL, async () => {
    const allMarkets = [];
    const batchSize = 100;
    let offset = 0;
    let failCount = 0;

    while (allMarkets.length < maxMarkets && failCount < 3) {
      try {
        const batch = await fetchJSON(
          `${GAMMA_API}/markets?active=true&limit=${batchSize}&offset=${offset}`
        );
        if (!batch || !Array.isArray(batch) || batch.length === 0) break;
        allMarkets.push(...batch);
        offset += batchSize;
        // If we got fewer than batchSize, we've reached the end
        if (batch.length < batchSize) break;
      } catch (err) {
        console.error(`Polymarket batch fetch failed at offset ${offset}:`, err.message);
        failCount++;
        offset += batchSize; // Skip failed batch
      }
    }

    // Sort by 24h volume descending, dedup by conditionId
    const seen = new Set();
    const deduped = [];
    for (const m of allMarkets) {
      const key = m.conditionId || m.slug;
      if (key && !seen.has(key)) {
        seen.add(key);
        deduped.push(m);
      }
    }

    deduped.sort((a, b) => (parseFloat(b.volume24hr) || 0) - (parseFloat(a.volume24hr) || 0));
    return deduped.slice(0, maxMarkets);
  });
}

export async function getMarketTrades(conditionId, limit = 500) {
  return cached(`trades_${conditionId}_${limit}`, CACHE_TTL, async () => {
    return fetchJSON(
      `${DATA_API}/trades?market=${conditionId}&limit=${limit}`
    );
  });
}

export function computePrescienceScore(trades, markets = []) {
  if (!trades || trades.length === 0) {
    return { score: 0, breakdown: {}, confidence: 'none', tradeCount: 0, archetype: 'unknown' };
  }

  const now = Date.now() / 1000;
  const archetype = classifyArchetype(trades, markets);

  const marketMap = {};
  const marketCloseTimes = {};
  const marketCreateTimes = {};
  const marketLiqMap = {};
  const marketTagMap = {};
  for (const m of markets) {
    if (m.conditionId) {
      marketMap[m.conditionId] = m;
      if (m.closedTime) marketCloseTimes[m.conditionId] = new Date(m.closedTime).getTime() / 1000;
      if (m.createdAt) marketCreateTimes[m.conditionId] = new Date(m.createdAt).getTime() / 1000;
      if (m.liquidityNum) marketLiqMap[m.conditionId] = parseFloat(m.liquidityNum) || 0;
      marketTagMap[m.conditionId] = m.tags || m.category || null;
    }
  }

  const winningOutcomes = {};
  for (const m of markets) {
    if (!m.conditionId || !m.outcomePrices) continue;
    try {
      const prices = JSON.parse(m.outcomePrices);
      const outcomes = JSON.parse(m.outcomes || '[]');
      const winIdx = prices.findIndex(p => parseFloat(p) === 1);
      if (winIdx !== -1) winningOutcomes[m.conditionId] = outcomes[winIdx];
    } catch {}
  }

  const timestamps = trades.map(t => t.timestamp).sort();
  const firstTrade = timestamps[0];
  const walletAgeDays = (now - firstTrade) / 86400;
  const walletAgeScore = Math.max(0, Math.min(100, 100 - (walletAgeDays / 180) * 100));

  const liqRelSizes = [];
  for (const t of trades) {
    const liq = marketLiqMap[t.conditionId];
    const size = (t.size || 0) * (t.price || 0);
    if (liq && liq > 0) liqRelSizes.push(size / liq);
  }
  const avgLiqRelSize = liqRelSizes.length > 0 ? liqRelSizes.reduce((a, b) => a + b, 0) / liqRelSizes.length : 0;
  const liquiditySizeScore = Math.max(0, Math.min(100, (avgLiqRelSize / 0.05) * 100));

  let timingScores = [];
  for (const t of trades) {
    const closeTime = marketCloseTimes[t.conditionId];
    const createTime = marketCreateTimes[t.conditionId];
    if (!closeTime || t.timestamp >= closeTime) continue;
    const marketDurationHrs = createTime ? (closeTime - createTime) / 3600 : null;
    const hoursBeforeClose = (closeTime - t.timestamp) / 3600;
    let normalizedTiming;
    if (marketDurationHrs && marketDurationHrs > 0) {
      const fractionRemaining = hoursBeforeClose / marketDurationHrs;
      const durationMultiplier = Math.min(1, marketDurationHrs / (24 * 7));
      normalizedTiming = Math.max(0, Math.min(100, (1 - fractionRemaining) * 100 * durationMultiplier));
    } else {
      normalizedTiming = Math.max(0, Math.min(100, 100 - (hoursBeforeClose / 168) * 100)) * 0.5;
    }
    const winOutcome = winningOutcomes[t.conditionId];
    if (winOutcome && t.side === 'BUY') {
      timingScores.push(t.outcome === winOutcome ? normalizedTiming : 0);
    } else {
      timingScores.push(normalizedTiming * 0.3);
    }
  }
  const timingScore = timingScores.length > 0 ? timingScores.reduce((a, b) => a + b, 0) / timingScores.length : 30;

  const { wins, losses, softWins, softLosses } = computeWinLoss(trades, markets);
  const totalBets = wins + losses;
  const softTotal = softWins + softLosses;
  const blendedWins = wins + softWins * 0.5;
  const blendedTotal = totalBets + softTotal * 0.5;
  const winRate = blendedTotal > 0 ? blendedWins / blendedTotal : 0.5;
  const winRateScore = Math.max(0, Math.min(100, (winRate - 0.5) * 200));

  const uniqueMarkets = new Set(trades.map(t => t.conditionId)).size;
  const concentrationScore = Math.max(0, Math.min(100, 100 - (uniqueMarkets / 20) * 100));

  const tradesByMarket = {};
  for (const t of trades) {
    if (!tradesByMarket[t.conditionId]) tradesByMarket[t.conditionId] = [];
    tradesByMarket[t.conditionId].push(t);
  }
  const tagWins = {};
  for (const [cid, mTrades] of Object.entries(tradesByMarket)) {
    const tag = marketTagMap[cid];
    const tagKey = Array.isArray(tag) ? tag[0] : (tag || 'unknown');
    if (!tagWins[tagKey]) tagWins[tagKey] = { wins: 0, total: 0 };
    const winOutcome = winningOutcomes[cid];
    if (!winOutcome) continue;
    for (const t of mTrades) {
      if (t.side !== 'BUY') continue;
      tagWins[tagKey].total++;
      if (t.outcome === winOutcome) tagWins[tagKey].wins++;
    }
  }

  let domainEdgeScore = 0, topDomain = null;
  const tagEntries = Object.entries(tagWins).filter(([, v]) => v.total >= 2);
  if (tagEntries.length > 0) {
    for (const [tag, { wins: tw, total: tt }] of tagEntries) {
      const rate = tw / tt;
      if (rate > 0.7 && tt >= 3) {
        const score = Math.min(100, (rate - 0.5) * 200 * Math.min(1, tt / 5));
        if (score > domainEdgeScore) { domainEdgeScore = score; topDomain = tag; }
      }
    }
    const winningDomains = tagEntries.filter(([, v]) => v.total >= 2 && v.wins / v.total > 0.6).length;
    if (winningDomains > 3) domainEdgeScore *= 0.5;
  }

  const betSizes = trades.map(t => (t.size || 0) * (t.price || 0));
  const totalVolume = betSizes.reduce((a, b) => a + b, 0);
  const volumeScore = Math.min(100, (Math.log10(Math.max(1, totalVolume)) / 5) * 100);

  const weights = { wallet_age: 0.10, timing: 0.25, win_rate: 0.20, liquidity_size: 0.20, domain_edge: 0.10, concentration: 0.08, volume: 0.07 };

  let rawScore =
    walletAgeScore * weights.wallet_age +
    timingScore * weights.timing +
    winRateScore * weights.win_rate +
    liquiditySizeScore * weights.liquidity_size +
    domainEdgeScore * weights.domain_edge +
    concentrationScore * weights.concentration +
    volumeScore * weights.volume;

  let expiryDiscount = 1.0;
  for (const m of markets) {
    if (!m.conditionId) continue;
    const endDate = m.endDate || m.closedTime;
    if (!endDate) continue;
    const hrsToExpiry = (new Date(endDate).getTime() - Date.now()) / 3600000;
    if (hrsToExpiry <= 0 || hrsToExpiry > 48) continue;
    let maxPrice = 0;
    try { const prices = JSON.parse(m.outcomePrices || '[]'); maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0)); } catch {}
    if (maxPrice >= 0.95 && hrsToExpiry <= 48) { expiryDiscount = Math.min(expiryDiscount, 0.3); }
  }
  rawScore *= expiryDiscount;

  if (archetype === 'fresh_insider' && expiryDiscount >= 1.0) rawScore = Math.max(rawScore, 75);
  else if (archetype === 'systematic_yield_farmer') rawScore = Math.min(rawScore, 20);
  else if (archetype === 'yield_farmer') rawScore = Math.min(rawScore, 30);
  else if (archetype === 'scalper') rawScore = Math.min(rawScore, 25);
  else if (archetype === 'retail') rawScore = Math.min(rawScore, 40);

  const score = Math.round(Math.max(0, Math.min(100, rawScore)));
  const confidence = totalBets >= 10 ? 'high' : totalBets >= 5 ? 'medium' : totalBets >= 2 ? 'low' : 'insufficient';

  return {
    score, confidence, tradeCount: trades.length, archetype,
    breakdown: {
      wallet_age: { score: Math.round(walletAgeScore), days: Math.round(walletAgeDays), weight: weights.wallet_age },
      timing: { score: Math.round(timingScore), samples: timingScores.length, weight: weights.timing },
      win_rate: { score: Math.round(winRateScore), rate: Math.round(winRate * 100) / 100, wins, losses, weight: weights.win_rate },
      liquidity_size: { score: Math.round(liquiditySizeScore), avg_pct_of_liquidity: Math.round(avgLiqRelSize * 10000) / 100, weight: weights.liquidity_size },
      domain_edge: { score: Math.round(domainEdgeScore), top_domain: topDomain, weight: weights.domain_edge },
      concentration: { score: Math.round(concentrationScore), unique_markets: uniqueMarkets, weight: weights.concentration },
      volume: { score: Math.round(volumeScore), total_usd: Math.round(totalVolume * 100) / 100, weight: weights.volume },
    },
    riskLevel: score >= 75 ? 'CRITICAL' : score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW',
  };
}

function computeWinLoss(trades, markets) {
  const tradesByMarket = {};
  for (const t of trades) {
    if (!tradesByMarket[t.conditionId]) tradesByMarket[t.conditionId] = [];
    tradesByMarket[t.conditionId].push(t);
  }
  let wins = 0, losses = 0, softWins = 0, softLosses = 0;
  for (const [cid, mTrades] of Object.entries(tradesByMarket)) {
    const market = markets.find(m => m.conditionId === cid);
    if (!market || !market.outcomePrices) continue;
    try {
      const prices = JSON.parse(market.outcomePrices);
      const outcomes = JSON.parse(market.outcomes || '[]');
      const winningIdx = prices.findIndex(p => parseFloat(p) === 1);
      if (winningIdx !== -1) {
        const winningOutcome = outcomes[winningIdx];
        for (const buy of mTrades.filter(t => t.side === 'BUY')) {
          if (buy.outcome === winningOutcome) wins++; else losses++;
        }
      } else {
        for (const buy of mTrades.filter(t => t.side === 'BUY')) {
          const outcomeIdx = outcomes.indexOf(buy.outcome);
          if (outcomeIdx === -1) continue;
          const currentPrice = parseFloat(prices[outcomeIdx]) || 0;
          const buyPrice = parseFloat(buy.price) || 0;
          if (buyPrice <= 0 || currentPrice <= 0) continue;
          const priceMove = currentPrice - buyPrice;
          if (priceMove > 0.05) softWins++;
          else if (priceMove < -0.05) softLosses++;
        }
      }
    } catch {}
  }
  return { wins, losses, softWins, softLosses };
}

function classifyArchetype(trades, markets = []) {
  const uniqueMarkets = new Set(trades.map(t => t.conditionId)).size;
  const betSizes = trades.map(t => (t.size || 0) * (t.price || 0));
  const totalVolume = betSizes.reduce((a, b) => a + b, 0);
  const avgBetSize = betSizes.length > 0 ? totalVolume / betSizes.length : 0;

  const { wins, losses, softWins, softLosses } = computeWinLoss(trades, markets);
  const totalBets = wins + losses;
  const softTotal = softWins + softLosses;
  const blendedWins = wins + softWins * 0.5;
  const blendedTotal = totalBets + softTotal * 0.5;
  const winRate = blendedTotal > 0 ? blendedWins / blendedTotal : 0.5;

  const marketDurations = {};
  for (const m of markets) {
    if (m.conditionId) {
      const created = m.createdAt ? new Date(m.createdAt).getTime() : null;
      const closed = m.closedTime ? new Date(m.closedTime).getTime() : null;
      if (created && closed && closed > created) marketDurations[m.conditionId] = (closed - created) / 3600000;
    }
  }
  const durations = trades.map(t => marketDurations[t.conditionId]).filter(Boolean);
  const shortMarketPref = durations.length > 0 ? durations.filter(d => d < 24).length / durations.length : 0;

  const marketLiqMap = {};
  for (const m of markets) { if (m.conditionId && m.liquidityNum) marketLiqMap[m.conditionId] = parseFloat(m.liquidityNum) || 0; }
  const liqRelSizes = trades.map(t => { const liq = marketLiqMap[t.conditionId]; if (!liq || liq === 0) return null; return ((t.size || 0) * (t.price || 0)) / liq; }).filter(Boolean);
  const avgLiqRelSize = liqRelSizes.length > 0 ? liqRelSizes.reduce((a, b) => a + b, 0) / liqRelSizes.length : 0;

  const timestamps = trades.map(t => t.timestamp).filter(Boolean).sort();
  const firstTradeTs = timestamps.length > 0 ? timestamps[0] : Date.now() / 1000;
  const walletAgeDays = (Date.now() / 1000 - firstTradeTs) / 86400;
  const isFreshWallet = walletAgeDays < 14;
  const isVeryFresh = walletAgeDays < 3;

  const hasOddsMovement = markets.some(m => {
    const walletTrades = trades.filter(t => t.conditionId === m.conditionId);
    if (walletTrades.length === 0) return false;
    const recentVolume = parseFloat(m.volume24hr || m.volume24h || 0);
    const totalLiq = parseFloat(m.liquidityNum || 0);
    return totalLiq > 0 && (recentVolume / totalLiq) > 0.02;
  });

  if (isFreshWallet && avgBetSize > 500 && hasOddsMovement) return 'fresh_insider';
  if (isVeryFresh && avgBetSize > 100 && hasOddsMovement) return 'fresh_insider';
  if (isFreshWallet && avgBetSize > 500) return 'yield_farmer';
  if (uniqueMarkets > 10 && avgBetSize < 200 && shortMarketPref > 0.5 && winRate < 0.65) return 'scalper';
  if (totalVolume >= 10000) return 'whale';
  if (uniqueMarkets <= 5 && avgLiqRelSize > 0.02 && winRate > 0.7 && totalBets >= 2) return 'insider';
  if (uniqueMarkets <= 8 && winRate > 0.65 && avgLiqRelSize > 0.01 && totalBets >= 2) return 'insider';
  if (isFreshWallet && totalVolume > 1000 && uniqueMarkets <= 3) return 'insider';
  if (totalVolume >= 5000) return 'whale';
  return 'retail';
}
