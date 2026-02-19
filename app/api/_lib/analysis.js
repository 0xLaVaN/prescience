/**
 * PRESCIENCE — Whale Intelligence & Wallet Profiling
 * Deep analysis using Polymarket Data API (holders, positions, activity, filtered trades)
 */

const DATA_API = 'https://data-api.polymarket.com';

// Aggressive caching for rate-limited Data API
const analysisCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 min
const ACTIVITY_CACHE_TTL = 15 * 60 * 1000; // 15 min

function cached(key, ttl, fn) {
  const entry = analysisCache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return Promise.resolve(entry.data);
  return fn().then(data => {
    analysisCache.set(key, { data, ts: Date.now() });
    return data;
  }).catch(err => {
    // Return stale cache on error if available
    if (entry) return entry.data;
    throw err;
  });
}

async function safeFetchJSON(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch top holders for a market (max 20 per call)
 */
export async function getTopHolders(conditionId) {
  return cached(`holders_${conditionId}`, CACHE_TTL, async () => {
    const data = await safeFetchJSON(
      `${DATA_API}/holders?market=${conditionId}&limit=20`
    );
    return Array.isArray(data) ? data : [];
  });
}

/**
 * Fetch top open positions sorted by token size
 */
export async function getMarketPositions(conditionId) {
  return cached(`positions_${conditionId}`, CACHE_TTL, async () => {
    const data = await safeFetchJSON(
      `${DATA_API}/v1/market-positions?market=${conditionId}&status=OPEN&sortBy=TOKENS&limit=20`
    );
    // API may return { positions: [...] } or array directly
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.positions)) return data.positions;
    return [];
  });
}

/**
 * Fetch only whale trades (above $500 cash value)
 */
export async function getWhaleTrades(conditionId, minAmount = 500) {
  return cached(`whale_trades_${conditionId}_${minAmount}`, CACHE_TTL, async () => {
    const data = await safeFetchJSON(
      `${DATA_API}/trades?market=${conditionId}&filterType=CASH&filterAmount=${minAmount}&limit=100`
    );
    return Array.isArray(data) ? data : [];
  });
}

/**
 * Fetch full activity history for a wallet
 */
export async function getWalletActivity(wallet) {
  return cached(`activity_${wallet}`, ACTIVITY_CACHE_TTL, async () => {
    const data = await safeFetchJSON(
      `${DATA_API}/activity?user=${encodeURIComponent(wallet)}&limit=100`
    );
    return Array.isArray(data) ? data : [];
  });
}

/**
 * Profile a wallet based on activity history
 * Returns: { totalTrades, totalMarkets, estimatedVolume, classification, winRate }
 */
export function profileWallet(activities) {
  if (!activities || activities.length === 0) {
    return { totalTrades: 0, totalMarkets: 0, estimatedVolume: 0, classification: 'unknown', winRate: null };
  }

  const markets = new Set();
  let trades = 0, volume = 0, wins = 0, resolved = 0;

  for (const a of activities) {
    if (a.conditionId || a.market) markets.add(a.conditionId || a.market);
    if (a.type === 'TRADE' || a.side) {
      trades++;
      const size = parseFloat(a.cashAmount || a.size || 0);
      volume += Math.abs(size);
    }
    if (a.type === 'REDEEM' || a.type === 'PAYOUT') {
      resolved++;
      const payout = parseFloat(a.cashAmount || a.amount || 0);
      if (payout > 0) wins++;
    }
  }

  const winRate = resolved > 0 ? wins / resolved : null;

  let classification;
  if (trades <= 5 && volume > 10000) classification = 'fresh_insider';
  else if (trades <= 5) classification = 'fresh';
  else if (volume > 100000 && winRate !== null && winRate > 0.65) classification = 'veteran_whale';
  else if (volume > 50000) classification = 'whale';
  else if (trades > 50 && markets.size > 20) classification = 'market_maker';
  else classification = 'retail';

  return {
    totalTrades: trades,
    totalMarkets: markets.size,
    estimatedVolume: Math.round(volume * 100) / 100,
    classification,
    winRate: winRate !== null ? Math.round(winRate * 100) / 100 : null,
  };
}

/**
 * Compute whale intelligence signals for a market
 * Returns: { whale_concentration, fresh_whale, whale_pnl_divergence, counter_flow, top_holders_summary, whale_trades_24h }
 */
export async function computeWhaleIntelligence(conditionId, market = {}) {
  const [holders, positions, whaleTrades] = await Promise.all([
    getTopHolders(conditionId).catch(() => []),
    getMarketPositions(conditionId).catch(() => []),
    getWhaleTrades(conditionId, 500).catch(() => []),
  ]);

  const result = {
    whale_concentration: false,
    whale_concentration_pct: 0,
    fresh_whale: null,
    fresh_whale_count: 0,
    whale_pnl_divergence: null,
    counter_flow: false,
    counter_flow_detail: null,
    top_holders_count: holders.length,
    whale_trades_count: whaleTrades.length,
    positions_count: positions.length,
  };

  // === WHALE CONCENTRATION ===
  // Check if top 5 wallets hold >50% of total positions
  if (holders.length >= 5) {
    const totalTokens = holders.reduce((s, h) => s + (parseFloat(h.amount || h.tokens || h.tokenAmount || 0)), 0);
    const top5Tokens = holders.slice(0, 5).reduce((s, h) => s + (parseFloat(h.amount || h.tokens || h.tokenAmount || 0)), 0);
    if (totalTokens > 0) {
      const pct = top5Tokens / totalTokens;
      result.whale_concentration_pct = Math.round(pct * 100);
      result.whale_concentration = pct > 0.50;
    }
  }

  // === FRESH WHALE DETECTION ===
  // For large holders, check if they're new (few total trades)
  const largeHolders = holders.filter(h => {
    const amount = parseFloat(h.amount || h.tokens || h.tokenAmount || 0);
    // Estimate USD value: amount * price (use market price if available)
    let price = 0.5; // default estimate
    try {
      const prices = JSON.parse(market.outcomePrices || '[]');
      price = Math.max(...prices.map(p => parseFloat(p) || 0), 0.5);
    } catch {}
    return amount * price > 10000; // >$10K position
  });

  // Profile large holders (up to 5 to avoid rate limits)
  const profilesToCheck = largeHolders.slice(0, 5);
  const freshWhales = [];

  for (const holder of profilesToCheck) {
    const wallet = holder.wallet || holder.address || holder.proxyWallet;
    if (!wallet) continue;
    try {
      const activity = await getWalletActivity(wallet);
      const profile = profileWallet(activity);
      if (profile.totalTrades < 5 && profile.totalTrades > 0) {
        freshWhales.push({
          wallet: wallet.slice(0, 8) + '...',
          totalTrades: profile.totalTrades,
          totalMarkets: profile.totalMarkets,
          classification: profile.classification,
          pseudonym: holder.pseudonym || holder.name || null,
        });
      }
    } catch {}
  }

  result.fresh_whale_count = freshWhales.length;
  if (freshWhales.length > 0) {
    result.fresh_whale = freshWhales[0]; // Most notable
  }

  // === WHALE PNL DIVERGENCE ===
  // Are top position holders in profit or loss?
  if (positions.length > 0) {
    let profitCount = 0, lossCount = 0;
    for (const pos of positions.slice(0, 10)) {
      const pnl = parseFloat(pos.pnl || pos.unrealizedPnl || pos.realizedPnl || 0);
      if (pnl > 0) profitCount++;
      else if (pnl < 0) lossCount++;
    }
    const total = profitCount + lossCount;
    if (total >= 3) {
      const profitRatio = profitCount / total;
      result.whale_pnl_divergence = profitRatio > 0.7 ? 'WHALES_WINNING' :
        profitRatio < 0.3 ? 'WHALES_LOSING' : 'MIXED';
    }
  }

  // === COUNTER FLOW ===
  // Are whales buying while overall flow is selling (or vice versa)?
  if (whaleTrades.length >= 3) {
    const now = Date.now() / 1000;
    const recentWhale = whaleTrades.filter(t => {
      const ts = t.timestamp || 0;
      // Timestamps are Unix SECONDS
      return (now - ts) < 86400; // last 24h
    });

    if (recentWhale.length >= 2) {
      let whaleBuyVol = 0, whaleSellVol = 0;
      for (const t of recentWhale) {
        const vol = parseFloat(t.cashAmount || t.amount || ((t.size || 0) * (t.price || 0)));
        if (t.side === 'BUY') whaleBuyVol += vol;
        else whaleSellVol += vol;
      }
      const whaleTotal = whaleBuyVol + whaleSellVol;
      if (whaleTotal > 0) {
        const whaleBuyRatio = whaleBuyVol / whaleTotal;
        // Compare with overall market flow from prices
        try {
          const prices = JSON.parse(market.outcomePrices || '[]');
          const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
          // If market consensus is strong (>75%) but whales are buying the minority side
          if (maxPrice > 0.75 && whaleBuyRatio < 0.3) {
            result.counter_flow = true;
            result.counter_flow_detail = 'WHALES_SELLING_CONSENSUS';
          } else if (maxPrice < 0.25 && whaleBuyRatio > 0.7) {
            result.counter_flow = true;
            result.counter_flow_detail = 'WHALES_BUYING_UNDERDOG';
          }
        } catch {}
      }
    }
  }

  return result;
}

/**
 * Get aggregate whale stats across multiple markets (for pulse)
 */
export async function getWhaleAggregateStats(conditionIds) {
  let totalWhaleTrades24h = 0;
  let concentrationAlerts = 0;
  const topPositions = [];

  // Process in batches of 10 to respect rate limits
  const BATCH = 10;
  for (let i = 0; i < conditionIds.length; i += BATCH) {
    const batch = conditionIds.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(cid => getWhaleTrades(cid, 1000).catch(() => []))
    );
    const holderResults = await Promise.all(
      batch.map(cid => getTopHolders(cid).catch(() => []))
    );

    for (let j = 0; j < batch.length; j++) {
      const trades = results[j];
      const holders = holderResults[j];
      const now = Date.now() / 1000;

      // Count 24h whale trades
      const recent = trades.filter(t => (now - (t.timestamp || 0)) < 86400);
      totalWhaleTrades24h += recent.length;

      // Check concentration
      if (holders.length >= 5) {
        const total = holders.reduce((s, h) => s + parseFloat(h.amount || h.tokens || h.tokenAmount || 0), 0);
        const top5 = holders.slice(0, 5).reduce((s, h) => s + parseFloat(h.amount || h.tokens || h.tokenAmount || 0), 0);
        if (total > 0 && top5 / total > 0.5) concentrationAlerts++;
      }

      // Track largest positions
      for (const h of holders.slice(0, 3)) {
        const amount = parseFloat(h.amount || h.tokens || h.tokenAmount || 0);
        if (amount > 0) {
          topPositions.push({
            conditionId: batch[j],
            wallet: (h.wallet || h.address || '').slice(0, 8) + '...',
            pseudonym: h.pseudonym || h.name || null,
            tokenAmount: Math.round(amount),
          });
        }
      }
    }
  }

  topPositions.sort((a, b) => b.tokenAmount - a.tokenAmount);

  return {
    whale_trades_24h: totalWhaleTrades24h,
    concentration_alerts: concentrationAlerts,
    top_positions: topPositions.slice(0, 10),
  };
}
