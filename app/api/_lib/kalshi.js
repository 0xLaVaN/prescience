/**
 * PRESCIENCE — Kalshi data fetching & integration utilities via pmxtjs
 */
import { Kalshi } from 'pmxtjs';

// Cache
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

function getKalshiClient() {
  if (!kalshiClient) {
    // Initialize Kalshi client without auth for read-only operations
    kalshiClient = new Kalshi();
  }
  return kalshiClient;
}

export async function getKalshiActiveMarkets(limit = 30) {
  return cached(`kalshi_active_markets_${limit}`, MARKET_CACHE_TTL, async () => {
    try {
      const client = getKalshiClient();
      
      // Search for active events
      const events = await client.searchMarkets({
        status: 'open',
        limit: limit * 2, // Get more to filter out the best ones
      });

      if (!events || !events.markets) return [];

      // Transform Kalshi markets to match our expected format
      const markets = events.markets.slice(0, limit).map(market => ({
        conditionId: market.ticker, // Use ticker as condition ID
        question: market.title,
        slug: market.ticker.toLowerCase(),
        exchange: 'kalshi',
        endDate: market.close_time,
        liquidityNum: market.liquidity || 0,
        volume24hr: market.volume_24h || 0,
        volumeNum: market.volume || 0,
        outcomes: market.can_close_early ? ['Yes', 'No'] : ['Yes', 'No'], // Standard binary
        outcomePrices: [
          market.yes_ask ? (market.yes_ask / 100).toString() : '0.50',
          market.no_ask ? (market.no_ask / 100).toString() : '0.50'
        ],
        tags: market.category || [],
        createdAt: market.open_time,
        closedTime: market.close_time,
        status: market.status
      }));

      return markets;
    } catch (error) {
      console.error('Error fetching Kalshi markets:', error);
      return [];
    }
  });
}

export async function getKalshiMarketTrades(ticker, limit = 300) {
  return cached(`kalshi_trades_${ticker}_${limit}`, CACHE_TTL, async () => {
    try {
      const client = getKalshiClient();
      
      // Fetch trade history for the market
      const trades = await client.fetchMarketTrades(ticker, { limit });
      
      if (!trades || !trades.trades) return [];

      // Transform Kalshi trades to match Polymarket format
      return trades.trades.map(trade => ({
        timestamp: Math.floor(new Date(trade.ts).getTime() / 1000),
        conditionId: ticker,
        outcome: trade.side === 'yes' ? 'Yes' : 'No',
        side: trade.type === 'buy' ? 'BUY' : 'SELL',
        size: trade.count || 1,
        price: (trade.yes_price || trade.no_price || 50) / 100, // Convert from cents
        proxyWallet: trade.user_id || `kalshi_${Math.random().toString(36).substr(2, 9)}`, // Anonymized
        exchange: 'kalshi'
      }));
    } catch (error) {
      console.error(`Error fetching Kalshi trades for ${ticker}:`, error);
      return [];
    }
  });
}

export async function getKalshiResolvedMarkets(limit = 50) {
  return cached(`kalshi_resolved_markets_${limit}`, MARKET_CACHE_TTL, async () => {
    try {
      const client = getKalshiClient();
      
      const events = await client.searchMarkets({
        status: 'closed',
        limit,
      });

      if (!events || !events.markets) return [];

      // Filter for resolved markets and transform format
      const markets = events.markets
        .filter(market => market.result !== null && market.result !== undefined)
        .map(market => ({
          conditionId: market.ticker,
          question: market.title,
          slug: market.ticker.toLowerCase(),
          exchange: 'kalshi',
          endDate: market.close_time,
          closedTime: market.close_time,
          liquidityNum: market.liquidity || 0,
          volume24hr: 0, // Historical, so no 24hr volume
          volumeNum: market.volume || 0,
          outcomes: ['Yes', 'No'],
          outcomePrices: market.result === 'yes' ? ['1', '0'] : ['0', '1'],
          tags: market.category || [],
          result: market.result
        }));

      return markets;
    } catch (error) {
      console.error('Error fetching Kalshi resolved markets:', error);
      return [];
    }
  });
}

// Helper function to find matching markets across exchanges
export function findCrossExchangeMatches(polymarkets, kalshiMarkets) {
  const matches = [];
  
  for (const poly of polymarkets) {
    for (const kalshi of kalshiMarkets) {
      // Simple matching based on similar questions or keywords
      const polyWords = extractKeywords(poly.question);
      const kalshiWords = extractKeywords(kalshi.question);
      
      const similarity = calculateSimilarity(polyWords, kalshiWords);
      
      if (similarity > 0.6) { // 60% similarity threshold
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
  
  // Sort by price divergence (highest first) as these are most interesting
  return matches.sort((a, b) => b.priceDivergence - a.priceDivergence);
}

function extractKeywords(question) {
  if (!question) return [];
  
  // Remove common words and extract meaningful terms
  const stopWords = ['will', 'the', 'be', 'in', 'on', 'at', 'to', 'for', 'of', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were'];
  
  return question
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word))
    .slice(0, 10); // Take top 10 keywords
}

function calculateSimilarity(words1, words2) {
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const intersection = words1.filter(word => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];
  
  return intersection.length / union.length; // Jaccard similarity
}