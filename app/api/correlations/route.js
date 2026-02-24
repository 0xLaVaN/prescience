/**
 * PRESCIENCE — /api/correlations
 * Cross-market wallet correlation detector.
 *
 * Detects wallets appearing in 2+ markets within a time window —
 * the signature of coordinated thesis positioning.
 * (e.g. same wallets buying YES on Iran Strike + YES on Oil Spike + YES on Defense ETF)
 *
 * GET /api/correlations
 *   ?window_hours=24     (look-back window, default: 24, max: 72)
 *   ?min_wallets=5       (minimum shared wallets for a cluster, default: 5)
 *   ?limit=80            (max markets to analyze, default: 80, max: 150)
 *   ?min_strength=WEAK   (filter by signal strength: WEAK|MODERATE|STRONG)
 */

import { NextResponse } from 'next/server';
import { getActiveMarkets, getAllActiveMarkets } from '../_lib/polymarket';
import { requirePayment } from '../_lib/auth.js';
import { runCorrelationAnalysis } from '../_lib/correlation.js';

export const runtime = 'nodejs';
export const maxDuration = 55;

async function handleCorrelations(request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowHours = Math.min(72, Math.max(1, parseInt(searchParams.get('window_hours')) || 24));
    const minWallets  = Math.min(20, Math.max(2, parseInt(searchParams.get('min_wallets'))   || 5));
    const limit       = Math.min(150, Math.max(10, parseInt(searchParams.get('limit'))        || 80));
    const minStrength = (searchParams.get('min_strength') || '').toUpperCase();

    // Fetch top markets by volume (cached, no extra cost)
    let markets = [];
    try {
      const [top, broad] = await Promise.allSettled([
        getActiveMarkets(limit),
        getAllActiveMarkets(Math.min(limit * 2, 300)),
      ]);

      const topMarkets   = top.status   === 'fulfilled' ? top.value   : [];
      const broadMarkets = broad.status === 'fulfilled' ? broad.value : [];

      // Merge + dedup by conditionId
      const seen = new Set();
      for (const m of [...topMarkets, ...broadMarkets]) {
        const key = m.conditionId;
        if (key && !seen.has(key)) {
          seen.add(key);
          markets.push({ ...m, exchange: m.exchange || 'polymarket' });
        }
      }

      // Sort by 24h volume desc so correlation focuses on liquid markets
      markets.sort((a, b) => (parseFloat(b.volume24hr) || 0) - (parseFloat(a.volume24hr) || 0));
      markets = markets.slice(0, limit);
    } catch (err) {
      console.error('Markets fetch failed:', err);
      return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 503 });
    }

    if (markets.length === 0) {
      return NextResponse.json({ clusters: [], meta: { error: 'No markets available' } });
    }

    // Run correlation analysis (handles caching internally)
    const { clusters, meta } = await runCorrelationAnalysis(markets, {
      windowHours,
      minSharedWallets: minWallets,
      maxMarkets: limit,
    });

    // Apply strength filter
    const filteredClusters = minStrength && ['WEAK', 'MODERATE', 'STRONG'].includes(minStrength)
      ? clusters.filter(c => {
          const rank = { WEAK: 1, MODERATE: 2, STRONG: 3 };
          return (rank[c.signal_strength] || 0) >= (rank[minStrength] || 0);
        })
      : clusters;

    return NextResponse.json({
      clusters: filteredClusters,
      meta: {
        ...meta,
        markets_in_clusters: new Set(
          filteredClusters.flatMap(c => c.markets.map(m => m.conditionId))
        ).size,
        params: { window_hours: windowHours, min_wallets: minWallets, limit, min_strength: minStrength || null },
      },
    });
  } catch (err) {
    console.error('Correlation analysis error:', err);
    return NextResponse.json({ error: 'Correlation analysis failed', detail: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  const authResult = await requirePayment(request, { price: '$0.001', endpoint: '/api/correlations' });
  if (authResult) return authResult; // Payment required or unauthorized
  return handleCorrelations(request);
}
