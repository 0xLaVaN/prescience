import { NextResponse } from 'next/server';
import { getActiveMarkets } from '../_lib/polymarket';
import { getKalshiActiveMarkets, findCrossExchangeMatches } from '../_lib/kalshi';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit')) || 10, 20);
    const minDivergence = parseFloat(searchParams.get('minDivergence')) || 0.05; // 5% minimum price difference

    // Fetch markets from both exchanges in parallel
    const [polymarkets, kalshiMarkets] = await Promise.allSettled([
      getActiveMarkets(50), // Get more markets to increase match chances
      getKalshiActiveMarkets(50)
    ]);

    const polyData = polymarkets.status === 'fulfilled' ? polymarkets.value : [];
    const kalshiData = kalshiMarkets.status === 'fulfilled' ? kalshiMarkets.value : [];

    if (polyData.length === 0 && kalshiData.length === 0) {
      return NextResponse.json({
        matches: [],
        meta: {
          timestamp: new Date().toISOString(),
          polymarket_markets: 0,
          kalshi_markets: 0,
          matches_found: 0,
          min_divergence: minDivergence
        }
      });
    }

    // Find cross-exchange matches
    const matches = findCrossExchangeMatches(polyData, kalshiData);

    // Filter by minimum divergence and limit results
    const significantMatches = matches
      .filter(match => match.priceDivergence >= minDivergence)
      .slice(0, limit)
      .map(match => ({
        similarity_score: Math.round(match.similarity * 100) / 100,
        price_divergence: Math.round(match.priceDivergence * 100) / 100,
        arbitrage_opportunity: match.priceDivergence > 0.10, // 10%+ divergence
        polymarket: {
          question: match.polymarket.question,
          slug: match.polymarket.slug,
          condition_id: match.polymarket.conditionId,
          price: match.polyPrice,
          volume_24hr: match.polymarket.volume24hr,
          liquidity: match.polymarket.liquidityNum,
          end_date: match.polymarket.endDate
        },
        kalshi: {
          question: match.kalshi.question,
          ticker: match.kalshi.conditionId,
          price: match.kalshiPrice,
          volume_24hr: match.kalshi.volume24hr,
          liquidity: match.kalshi.liquidityNum,
          end_date: match.kalshi.endDate
        },
        signal_strength: calculateSignalStrength(match),
        recommended_action: getRecommendedAction(match)
      }));

    return NextResponse.json({
      matches: significantMatches,
      meta: {
        timestamp: new Date().toISOString(),
        polymarket_markets: polyData.length,
        kalshi_markets: kalshiData.length,
        matches_found: significantMatches.length,
        min_divergence: minDivergence,
        engine: 'Prescience Cross-Platform v1.0'
      }
    });

  } catch (error) {
    console.error('Cross-platform scan error:', error);
    return NextResponse.json({
      error: 'Cross-platform scan failed',
      detail: error.message
    }, { status: 500 });
  }
}

function calculateSignalStrength(match) {
  let strength = 0;
  
  // Higher divergence = stronger signal
  strength += Math.min(match.priceDivergence * 10, 5); // Max 5 points
  
  // Higher similarity = more confidence this is the same market
  strength += match.similarity * 3; // Max 3 points
  
  // Volume consideration - higher volume on both sides = stronger signal
  const avgVolume = (parseFloat(match.polymarket.volume24hr || 0) + parseFloat(match.kalshi.volume24hr || 0)) / 2;
  strength += Math.min(Math.log10(avgVolume || 1) / 2, 2); // Max 2 points
  
  return Math.round(Math.min(strength, 10) * 10) / 10; // Scale to 0-10
}

function getRecommendedAction(match) {
  const divergence = match.priceDivergence;
  const similarity = match.similarity;
  
  if (divergence > 0.15 && similarity > 0.8) {
    return match.polyPrice > match.kalshiPrice ? 
      'BUY_KALSHI_SELL_POLYMARKET' : 'BUY_POLYMARKET_SELL_KALSHI';
  } else if (divergence > 0.10 && similarity > 0.7) {
    return 'MONITOR_CLOSELY';
  } else if (divergence > 0.05) {
    return 'WATCH_LIST';
  } else {
    return 'NO_ACTION';
  }
}