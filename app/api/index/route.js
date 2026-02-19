import { NextResponse } from 'next/server';
import { fetchJSON } from '../_lib/polymarket';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const TIER2_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
let tier2Cache = { data: null, timestamp: null };

export async function GET(request) {
  try {
    const now = Date.now();
    
    // Check cache
    if (tier2Cache.data && tier2Cache.timestamp && (now - tier2Cache.timestamp) < TIER2_CACHE_TTL) {
      return NextResponse.json({
        ...tier2Cache.data,
        meta: {
          ...tier2Cache.data.meta,
          cache_hit: true,
          cache_age_minutes: Math.round((now - tier2Cache.timestamp) / (60 * 1000))
        }
      });
    }

    // Fetch ALL active markets (not just top volume)
    console.log('Tier 2: Fetching all active markets...');
    const allMarkets = await fetchJSON(`${GAMMA_API}/markets?active=true&archived=false&limit=1000&offset=0`);
    
    if (!allMarkets || !Array.isArray(allMarkets)) {
      throw new Error('Failed to fetch markets from Polymarket API');
    }

    console.log(`Tier 2: Processing ${allMarkets.length} markets...`);
    
    const anomalies = [];
    const processedCount = allMarkets.length;
    let promotionCandidates = 0;

    for (const market of allMarkets) {
      try {
        // Lightweight analysis - no deep trade parsing
        const anomaly = await analyzeTier2Market(market);
        if (anomaly) {
          anomalies.push(anomaly);
          if (anomaly.promote_to_tier1) {
            promotionCandidates++;
          }
        }
      } catch (marketErr) {
        // Skip markets that fail individual analysis
        console.error(`Tier 2: Market ${market?.question?.slice(0, 40)} failed:`, marketErr?.message);
      }
    }

    // Sort by anomaly score (highest first)
    anomalies.sort((a, b) => b.anomaly_score - a.anomaly_score);

    const result = {
      index: anomalies,
      meta: {
        markets_processed: processedCount,
        anomalies_detected: anomalies.length,
        tier1_promotion_candidates: promotionCandidates,
        timestamp: new Date().toISOString(),
        engine: 'Prescience Index v1.0 (Tier 2 Broad Scan)',
        next_scan_in_hours: 2,
        cache_hit: false
      }
    };

    // Cache the result
    tier2Cache = {
      data: result,
      timestamp: now
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('Tier 2 Index scan failed:', err);
    return NextResponse.json({ 
      error: 'Tier 2 index scan failed', 
      detail: err.message 
    }, { status: 500 });
  }
}

async function analyzeTier2Market(market) {
  const now = Date.now() / 1000;
  
  // Skip markets without basic data
  if (!market.conditionId || !market.question) {
    return null;
  }

  // Basic market metrics
  const volume24h = parseFloat(market.volume24hr) || 0;
  const volumeTotal = parseFloat(market.volumeNum) || 0;
  const liquidity = parseFloat(market.liquidityNum) || 1;
  const endDate = market.endDate ? new Date(market.endDate).getTime() : null;
  const hoursToExpiry = endDate ? (endDate - Date.now()) / (1000 * 60 * 60) : Infinity;

  // Skip very low volume or expired markets
  if (volume24h < 10 || (endDate && Date.now() > endDate)) {
    return null;
  }

  let anomalyScore = 0;
  let anomalyFlags = [];
  let promoteToTier1 = false;

  // 1. Volume Spike Detection (lightweight)
  const volumeVsLiquidity = liquidity > 0 ? volume24h / liquidity : 0;
  if (volumeVsLiquidity > 3) {
    anomalyScore += 25;
    anomalyFlags.push('volume_spike');
    if (volumeVsLiquidity > 5) {
      promoteToTier1 = true;
    }
  }

  // 2. Fetch limited trades for lightweight wallet analysis (50 most recent)
  let freshWalletAnalysis = null;
  try {
    const trades = await fetchTrades(market.conditionId, 50);
    if (trades && trades.length >= 5) {
      freshWalletAnalysis = analyzeFreshWallets(trades, now);
      
      // Fresh wallet excess trigger
      if (freshWalletAnalysis.fresh_wallet_excess > 0.15) {
        anomalyScore += 40;
        anomalyFlags.push('fresh_wallet_surge');
        promoteToTier1 = true;
      }
      
      // Single wallet concentration trigger
      if (freshWalletAnalysis.max_wallet_dominance > 0.30) {
        anomalyScore += 35;
        anomalyFlags.push('whale_concentration');
        promoteToTier1 = true;
      }
      
      // Cross-position correlation pattern (Logan Paul case)
      if (freshWalletAnalysis.fresh_wallet_count > 0 && 
          freshWalletAnalysis.avg_fresh_wallet_age < 3) {
        anomalyScore += 20;
        anomalyFlags.push('coordinated_fresh_wallets');
      }
    }
  } catch (tradeErr) {
    // If we can't get trades, still report the market with volume anomalies
    console.log(`Tier 2: Could not fetch trades for ${market.question.slice(0, 30)}`);
  }

  // 3. Price extreme detection
  try {
    const prices = JSON.parse(market.outcomePrices || '[]');
    const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
    const minPrice = Math.min(...prices.map(p => parseFloat(p) || 0));
    
    // Very lopsided markets with activity might be interesting
    if ((maxPrice > 0.95 || minPrice < 0.05) && volume24h > 100) {
      anomalyScore += 15;
      anomalyFlags.push('extreme_pricing');
    }
  } catch {}

  // 4. Time-sensitive markets (expiring soon with activity)
  if (hoursToExpiry < 24 && volume24h > 500) {
    anomalyScore += 10;
    anomalyFlags.push('expiry_rush');
  }

  // Only return markets with anomalies
  if (anomalyScore < 10) {
    return null;
  }

  let currentPrices = {};
  try {
    const outcomes = JSON.parse(market.outcomes || '[]');
    const prices = JSON.parse(market.outcomePrices || '[]');
    outcomes.forEach((o, i) => { 
      currentPrices[o] = parseFloat(prices[i]) || 0; 
    });
  } catch {}

  return {
    exchange: 'polymarket',
    question: market.question,
    conditionId: market.conditionId,
    slug: market.slug,
    anomaly_score: Math.round(anomalyScore),
    anomaly_flags: anomalyFlags,
    promote_to_tier1: promoteToTier1,
    
    // Market basics
    volume24hr: market.volume24hr,
    volumeTotal: market.volumeNum,
    liquidity: market.liquidityNum,
    endDate: market.endDate,
    hours_to_expiry: hoursToExpiry > 1000 ? null : Math.round(hoursToExpiry),
    currentPrices,
    
    // Lightweight analysis results
    volume_vs_liquidity_ratio: Math.round(volumeVsLiquidity * 100) / 100,
    ...(freshWalletAnalysis && {
      fresh_wallet_count: freshWalletAnalysis.fresh_wallet_count,
      fresh_wallet_excess: freshWalletAnalysis.fresh_wallet_excess,
      max_wallet_dominance: freshWalletAnalysis.max_wallet_dominance,
      avg_fresh_wallet_age_days: freshWalletAnalysis.avg_fresh_wallet_age
    })
  };
}

function analyzeFreshWallets(trades, now) {
  const wallets = {};
  let totalVolume = 0;

  // Process trades to build wallet profiles
  for (const trade of trades) {
    const wallet = (trade.proxyWallet || '').toLowerCase();
    if (!wallet) continue;
    
    const volume = (trade.size || 0) * (trade.price || 0);
    totalVolume += volume;
    
    if (!wallets[wallet]) {
      wallets[wallet] = {
        firstSeen: trade.timestamp,
        volume: 0,
        trades: 0
      };
    }
    
    wallets[wallet].volume += volume;
    wallets[wallet].trades += 1;
    
    // Track earliest trade
    if (trade.timestamp < wallets[wallet].firstSeen) {
      wallets[wallet].firstSeen = trade.timestamp;
    }
  }

  // Analyze wallet patterns
  let freshWalletCount = 0;
  let freshWalletVolume = 0;
  let maxWalletVolume = 0;
  let totalFreshAge = 0;

  for (const [wallet, data] of Object.entries(wallets)) {
    const ageDays = (now - data.firstSeen) / 86400; // days
    
    // Track max wallet dominance
    if (data.volume > maxWalletVolume) {
      maxWalletVolume = data.volume;
    }
    
    // Fresh wallet analysis (< 7 days, meaningful volume)
    if (ageDays < 7 && data.volume > 25) {
      freshWalletCount++;
      freshWalletVolume += data.volume;
      totalFreshAge += ageDays;
    }
  }

  const totalWallets = Object.keys(wallets).length;
  const freshWalletRatio = totalWallets > 0 ? freshWalletCount / totalWallets : 0;
  const BASELINE_FRESH_RATIO = 0.25; // More conservative for Tier 2
  const freshWalletExcess = Math.max(0, freshWalletRatio - BASELINE_FRESH_RATIO);
  const maxWalletDominance = totalVolume > 0 ? maxWalletVolume / totalVolume : 0;
  const avgFreshAge = freshWalletCount > 0 ? totalFreshAge / freshWalletCount : 0;

  return {
    fresh_wallet_count: freshWalletCount,
    fresh_wallet_excess: Math.round(freshWalletExcess * 1000) / 1000,
    max_wallet_dominance: Math.round(maxWalletDominance * 1000) / 1000,
    avg_fresh_wallet_age: Math.round(avgFreshAge * 10) / 10,
    total_wallets: totalWallets,
    sample_volume: Math.round(totalVolume)
  };
}

async function fetchTrades(conditionId, limit = 50) {
  try {
    const url = `${GAMMA_API}/events?market=${conditionId}&limit=${limit}`;
    const trades = await fetchJSON(url);
    return trades || [];
  } catch (err) {
    console.error(`Failed to fetch trades for ${conditionId}:`, err.message);
    return [];
  }
}