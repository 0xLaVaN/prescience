import { NextResponse } from 'next/server';
import { getActiveMarkets, getMarketTrades } from '../_lib/polymarket';

const CACHE_TTL = 5 * 60 * 1000;
let newsCache = null;
let newsCacheTs = 0;

export async function GET() {
  try {
    if (newsCache && Date.now() - newsCacheTs < CACHE_TTL) {
      return NextResponse.json(newsCache);
    }

    const activeMarkets = await getActiveMarkets(20);
    const newsItems = [];

    for (const market of activeMarkets) {
      try {
        const trades = await getMarketTrades(market.conditionId, 300);
        if (!trades || trades.length < 5) continue;

        const now = Date.now() / 1000;
        const oneDayAgo = now - 86400;
        let currentOdds = {};
        try {
          const outcomes = JSON.parse(market.outcomes || '[]');
          const prices = JSON.parse(market.outcomePrices || '[]');
          outcomes.forEach((o, i) => { currentOdds[o] = parseFloat(prices[i]); });
        } catch {}

        let recentVolume = 0, buyVol = 0, sellVol = 0;
        const wallets = {};
        let freshWalletCount = 0, largePositionCount = 0;

        for (const t of trades) {
          const size = (t.size || 0) * (t.price || 0);
          const w = (t.proxyWallet || '').toLowerCase();
          if (!w) continue;
          if (!wallets[w]) wallets[w] = { firstSeen: t.timestamp, totalVol: 0, trades: 0 };
          wallets[w].totalVol += size;
          wallets[w].trades++;
          if (t.timestamp < wallets[w].firstSeen) wallets[w].firstSeen = t.timestamp;
          if (t.timestamp >= oneDayAgo) {
            recentVolume += size;
            if (t.side === 'BUY') buyVol += size; else sellVol += size;
          }
        }

        for (const [, data] of Object.entries(wallets)) {
          const ageDays = (now - data.firstSeen) / 86400;
          if (ageDays < 7 && data.totalVol > 50) freshWalletCount++;
          if (data.totalVol > 1000) largePositionCount++;
        }

        const totalFlow = buyVol + sellVol;
        const flowImbalance = totalFlow > 0 ? (buyVol - sellVol) / totalFlow : 0;
        const vol24h = parseFloat(market.volume24hr) || recentVolume;

        let severity = 'low', signal = '';
        if (freshWalletCount >= 3 && largePositionCount >= 2) {
          severity = 'critical';
          signal = `${freshWalletCount} fresh wallets + ${largePositionCount} large positions detected`;
        } else if (freshWalletCount >= 2 || (largePositionCount >= 3 && Math.abs(flowImbalance) > 0.4)) {
          severity = 'high';
          signal = freshWalletCount >= 2 ? `${freshWalletCount} fresh wallets entered positions` : `${largePositionCount} large positions, ${Math.round(Math.abs(flowImbalance) * 100)}% flow imbalance`;
        } else if (vol24h > 500000 || Math.abs(flowImbalance) > 0.3) {
          severity = 'medium';
          signal = vol24h > 500000 ? `$${(vol24h / 1e6).toFixed(1)}M 24h volume` : `${Math.round(Math.abs(flowImbalance) * 100)}% ${flowImbalance > 0 ? 'buy' : 'sell'} flow imbalance`;
        } else {
          signal = `${Object.keys(wallets).length} active wallets`;
        }

        const dominantOutcome = Object.entries(currentOdds).sort((a, b) => b[1] - a[1])[0];
        const pctStr = dominantOutcome ? `${Math.round(dominantOutcome[1] * 100)}%` : '';
        const volStr = vol24h >= 1e6 ? `$${(vol24h / 1e6).toFixed(1)}M` : `$${Math.round(vol24h / 1000)}K`;
        const dirStr = flowImbalance > 0.2 ? 'surges' : flowImbalance < -0.2 ? 'drops' : 'holds';
        const headline = dominantOutcome ? `"${dominantOutcome[0]}" ${dirStr} to ${pctStr} — ${volStr} new volume` : `${volStr} volume surge on active market`;

        newsItems.push({ headline, market: market.question, slug: market.slug || '', volume24h: Math.round(vol24h), currentOdds, signal, severity, timestamp: new Date().toISOString(), flowDirection: flowImbalance > 0.1 ? 'BUY' : flowImbalance < -0.1 ? 'SELL' : 'NEUTRAL', freshWallets: freshWalletCount, largePositions: largePositionCount });
      } catch {}
    }

    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    newsItems.sort((a, b) => (sevOrder[a.severity] - sevOrder[b.severity]) || (b.volume24h - a.volume24h));
    const result = { news: newsItems, generated: new Date().toISOString(), engine: 'Prescience News v1.0' };
    newsCache = result;
    newsCacheTs = Date.now();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to generate news feed', detail: err.message }, { status: 500 });
  }
}
