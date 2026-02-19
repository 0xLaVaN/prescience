/**
 * PRESCIENCE — Kalshi data fetching via direct REST API
 * No auth required. Fast (<2s). Cursor pagination.
 * Background caching model: never blocks scan responses.
 */

const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';
const CACHE_TTL = 5 * 60 * 1000;
const MARKET_CACHE_TTL = 15 * 60 * 1000;
const cache = new Map();
let lastRefreshAttempt = 0;

function cached(key, ttl, fn) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return Promise.resolve(entry.data);
  return fn().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  }).catch(err => {
    console.error(`Kalshi cache error for ${key}:`, err);
    if (entry) return entry.data;
    throw err;
  });
}

/**
 * Fetch all active Kalshi markets via cursor pagination.
 * Filters out sports parlays (KXMVESPORTS).
 */
export async function getKalshiActiveMarkets(maxMarkets = 500) {
  return cached(`kalshi_active_${maxMarkets}`, MARKET_CACHE_TTL, async () => {
    const allMarkets = [];
    let cursor = null;
    let failCount = 0;

    while (allMarkets.length < maxMarkets && failCount < 3) {
      try {
        let url = `${KALSHI_API}/markets?status=open&limit=100`;
        if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Kalshi API ${res.status}`);
        const data = await res.json();

        const markets = data.markets || [];
        if (markets.length === 0) break;

        // Filter out sports parlays
        const filtered = markets.filter(m =>
          !m.event_ticker?.startsWith('KXMVESPORTS')
        );

        for (const m of filtered) {
          allMarkets.push(mapKalshiMarket(m));
        }

        cursor = data.cursor;
        if (!cursor) break;
      } catch (err) {
        console.error(`Kalshi batch fetch failed:`, err.message);
        failCount++;
      }
    }

    // Sort by volume descending
    allMarkets.sort((a, b) => (parseFloat(b.volume24hr) || 0) - (parseFloat(a.volume24hr) || 0));
    return allMarkets.slice(0, maxMarkets);
  });
}

function mapKalshiMarket(m) {
  const yesPrice = (m.yes_ask || m.yes_bid || 50) / 100;
  const noPrice = 1 - yesPrice;
  return {
    conditionId: m.ticker,
    question: m.title,
    slug: (m.ticker || '').toLowerCase(),
    exchange: 'kalshi',
    endDate: m.expiration_time || m.close_time,
    liquidityNum: m.liquidity || 0,
    volume24hr: m.volume_24h || 0,
    volumeNum: m.volume || 0,
    outcomes: ['Yes', 'No'],
    outcomePrices: [String(yesPrice), String(noPrice)],
    tags: m.category ? [m.category] : [],
    createdAt: m.created_time || null,
    closedTime: m.expiration_time || m.close_time,
    status: 'active',
    openInterest: m.open_interest || 0,
    category: m.category || '',
    event_ticker: m.event_ticker || ''
  };
}

/**
 * Get cached Kalshi data without blocking. Triggers background refresh if stale.
 */
export function getKalshiCached() {
  const entry = cache.get('kalshi_active_500');
  const data = entry ? entry.data : [];
  const age = entry ? Date.now() - entry.ts : Infinity;

  if (age > MARKET_CACHE_TTL) {
    triggerBackgroundRefresh();
  }

  return { data, age, isFresh: age < MARKET_CACHE_TTL };
}

function triggerBackgroundRefresh() {
  const now = Date.now();
  if (now - lastRefreshAttempt < 30000) return;
  lastRefreshAttempt = now;
  getKalshiActiveMarkets(500).catch(err => {
    console.error('Kalshi background refresh failed:', err.message);
  });
}

/**
 * Fetch trades for a Kalshi market (for deeper analysis).
 * Uses direct REST API with timeout.
 */
export async function getKalshiMarketTrades(ticker, limit = 300) {
  return cached(`kalshi_trades_${ticker}_${limit}`, CACHE_TTL, async () => {
    try {
      const res = await Promise.race([
        fetch(`${KALSHI_API}/markets/${encodeURIComponent(ticker)}/trades?limit=${limit}`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Kalshi trades timeout')), 5000))
      ]);
      if (!res.ok) return [];
      const data = await res.json();
      const trades = data.trades || [];

      return trades.map(trade => ({
        timestamp: Math.floor(new Date(trade.created_time || trade.ts).getTime() / 1000),
        conditionId: ticker,
        outcome: trade.taker_side === 'yes' ? 'Yes' : 'No',
        side: 'BUY',
        size: trade.count || trade.contracts || 1,
        price: (trade.yes_price || trade.price || 50) / 100,
        proxyWallet: `kalshi_${trade.trade_id || trade.id || Date.now()}`,
        exchange: 'kalshi'
      }));
    } catch (error) {
      console.error(`Error fetching Kalshi trades for ${ticker}:`, error.message);
      return [];
    }
  });
}

export function findCrossExchangeMatches(polymarkets, kalshiMarkets) {
  const matches = [];

  for (const poly of polymarkets) {
    for (const kalshi of kalshiMarkets) {
      const similarity = jaccardSimilarity(
        extractKeywords(poly.question),
        extractKeywords(kalshi.question)
      );

      if (similarity > 0.6) {
        const polyPrice = Math.max(...(JSON.parse(poly.outcomePrices || '[]').map(p => parseFloat(p) || 0)));
        const kalshiPrice = Math.max(...(kalshi.outcomePrices.map(p => parseFloat(p) || 0)));

        matches.push({
          polymarket: poly,
          kalshi: kalshi,
          similarity,
          priceDivergence: Math.abs(polyPrice - kalshiPrice),
          polyPrice,
          kalshiPrice
        });
      }
    }
  }

  return matches.sort((a, b) => b.priceDivergence - a.priceDivergence);
}

function extractKeywords(question) {
  if (!question) return [];
  const stopWords = ['will', 'the', 'be', 'in', 'on', 'at', 'to', 'for', 'of', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were'];
  return question.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.includes(w)).slice(0, 10);
}

function jaccardSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  const intersection = a.filter(w => b.includes(w));
  const union = [...new Set([...a, ...b])];
  return intersection.length / union.length;
}
