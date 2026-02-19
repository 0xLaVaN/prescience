/**
 * PRESCIENCE — Kalshi data fetching via pmxtjs
 */
import { Kalshi } from 'pmxtjs';

const CACHE_TTL = 5 * 60 * 1000;
const MARKET_CACHE_TTL = 15 * 60 * 1000;
const cache = new Map();
let kalshiClient = null;

function cached(key, ttl, fn) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return Promise.resolve(entry.data);
  return fn().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  }).catch(err => {
    console.error(`Kalshi cache error for ${key}:`, err);
    throw err;
  });
}

function getClient() {
  if (!kalshiClient) kalshiClient = new Kalshi();
  return kalshiClient;
}

export async function getKalshiActiveMarkets(limit = 30) {
  return cached(`kalshi_active_${limit}`, MARKET_CACHE_TTL, async () => {
    try {
      const client = getClient();
      const markets = await client.fetchMarkets({ limit: limit * 2 });
      
      if (!markets || !Array.isArray(markets)) return [];

      return markets.slice(0, limit).map(m => ({
        conditionId: m.marketId,
        question: m.title,
        slug: m.marketId.toLowerCase(),
        exchange: 'kalshi',
        endDate: m.resolutionDate,
        liquidityNum: m.liquidity || 0,
        volume24hr: m.volume24h || 0,
        volumeNum: m.volume || 0,
        outcomes: m.outcomes ? m.outcomes.map(o => o.label) : ['Yes', 'No'],
        outcomePrices: m.outcomes 
          ? m.outcomes.map(o => String(o.price || 0.5))
          : [String(m.yes || 0.5), String(m.no || 0.5)],
        tags: m.tags || (m.category ? [m.category] : []),
        createdAt: null,
        closedTime: m.resolutionDate,
        status: 'active',
        openInterest: m.openInterest || 0,
        category: m.category || ''
      }));
    } catch (error) {
      console.error('Error fetching Kalshi markets:', error);
      return [];
    }
  });
}

export async function getKalshiMarketTrades(marketId, limit = 300) {
  return cached(`kalshi_trades_${marketId}_${limit}`, CACHE_TTL, async () => {
    try {
      const client = getClient();
      const trades = await client.fetchTrades(marketId, { limit });
      
      if (!trades || !Array.isArray(trades)) return [];

      return trades.map(trade => ({
        timestamp: Math.floor(new Date(trade.ts || trade.created_time).getTime() / 1000),
        conditionId: marketId,
        outcome: trade.side === 'yes' ? 'Yes' : 'No',
        side: trade.type === 'buy' ? 'BUY' : 'SELL',
        size: trade.count || trade.contracts || 1,
        price: (trade.yes_price || trade.price || 50) / 100,
        proxyWallet: trade.taker_side || `kalshi_${marketId}_${Date.now()}`,
        exchange: 'kalshi'
      }));
    } catch (error) {
      console.error(`Error fetching Kalshi trades for ${marketId}:`, error);
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
