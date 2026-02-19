import { NextResponse } from 'next/server';
import { getResolvedMarkets, getActiveMarkets, getMarketTrades, computePrescienceScore } from '../_lib/polymarket';

export async function GET() {
  try {
    const resolvedMarkets = await getResolvedMarkets(20);
    const activeMarkets = await getActiveMarkets(10);

    let totalSuspicious = 0, totalWallets = 0, totalVolume = 0, highestScore = 0;
    let hotMarkets = [];

    for (const market of resolvedMarkets) {
      try {
        const trades = await getMarketTrades(market.conditionId, 200);
        const mVolume = trades.reduce((s, t) => s + t.size * t.price, 0);
        totalVolume += mVolume;

        const wallets = {};
        for (const t of trades) {
          const w = t.proxyWallet?.toLowerCase();
          if (!w) continue;
          if (!wallets[w]) wallets[w] = [];
          wallets[w].push(t);
        }

        let marketSuspicious = 0, marketHighestScore = 0;
        for (const [, wTrades] of Object.entries(wallets)) {
          if (wTrades.length < 2) continue;
          const r = computePrescienceScore(wTrades, [market]);
          if (r.score >= 50) marketSuspicious++;
          if (r.score > marketHighestScore) marketHighestScore = r.score;
        }

        totalWallets += Object.keys(wallets).length;
        totalSuspicious += marketSuspicious;
        if (!market.closedTime && marketHighestScore > highestScore) highestScore = marketHighestScore;

        if (marketSuspicious > 0) {
          hotMarkets.push({
            question: market.question, conditionId: market.conditionId, slug: market.slug,
            volume: market.volumeNum, suspicious_wallets: marketSuspicious, closedTime: market.closedTime,
          });
        }
      } catch {}
    }

    hotMarkets.sort((a, b) => b.suspicious_wallets - a.suspicious_wallets);

    let activeHighestScore = 0;
    let activeHotMarkets = [];
    for (const market of activeMarkets) {
      try {
        const trades = await getMarketTrades(market.conditionId, 200);
        if (trades.length < 5) continue;
        const wallets = {};
        let buyVol = 0, sellVol = 0;
        const pOutcomeBuyVol = {};
        for (const t of trades) {
          const w = t.proxyWallet?.toLowerCase();
          if (!w) continue;
          if (!wallets[w]) wallets[w] = { volume: 0, trades: 0, firstSeen: t.timestamp };
          wallets[w].volume += t.size * t.price;
          wallets[w].trades++;
          if (t.side === 'BUY') {
            buyVol += t.size * t.price;
            const outcome = t.outcome || 'unknown';
            pOutcomeBuyVol[outcome] = (pOutcomeBuyVol[outcome] || 0) + t.size * t.price;
          } else { sellVol += t.size * t.price; }
        }
        const totalW = Object.keys(wallets).length;
        if (totalW < 3) continue;

        const now_p = Date.now() / 1000;
        const freshCount = Object.values(wallets).filter(w => ((now_p - w.firstSeen) / 86400) < 7 && w.volume > 50).length;
        const freshRatio = freshCount / totalW;
        const isCapped = trades.length >= 195;
        const BASELINE = isCapped ? 0.60 : 0.30;
        const excessFresh = Math.max(0, freshRatio - BASELINE);
        const absImb = Math.abs(buyVol - sellVol) / ((buyVol + sellVol) || 1);
        const largePos = Object.values(wallets).filter(w => w.volume >= 1000).length;
        const largePosRatio = Math.min(largePos / totalW, 1);
        const normFreshExcess = Math.min(excessFresh / 0.4, 1);
        const liq = parseFloat(market.liquidityNum) || 1;
        const vol24 = parseFloat(market.volume24hr) || 0;
        const volLiq = Math.min(vol24 / liq, 5) / 5;

        let pFlowV2 = 'NEUTRAL', pMinFlow = 0, pMajFlow = 0;
        try {
          const prices = JSON.parse(market.outcomePrices || '[]');
          const outcomes = JSON.parse(market.outcomes || '[]');
          if (outcomes.length === 2 && prices.length === 2) {
            const p0 = parseFloat(prices[0]) || 0, p1 = parseFloat(prices[1]) || 0;
            const majIdx = p0 >= p1 ? 0 : 1, minIdx = 1 - majIdx;
            pMajFlow = pOutcomeBuyVol[outcomes[majIdx]] || 0;
            pMinFlow = pOutcomeBuyVol[outcomes[minIdx]] || 0;
            const totalOF = pMajFlow + pMinFlow;
            if (totalOF > 0) {
              const minRatio = pMinFlow / totalOF;
              pFlowV2 = minRatio > 0.3 ? 'MINORITY_HEAVY' : minRatio > 0.1 ? 'MIXED' : 'MAJORITY_ALIGNED';
            }
          }
        } catch {}

        let flowV2Sc;
        if (pFlowV2 === 'MINORITY_HEAVY') { const minR = (pMinFlow + pMajFlow) > 0 ? pMinFlow / (pMinFlow + pMajFlow) : 0; flowV2Sc = 4 + Math.min(1, minR); }
        else if (pFlowV2 === 'MIXED') { const minR = (pMinFlow + pMajFlow) > 0 ? pMinFlow / (pMinFlow + pMajFlow) : 0; flowV2Sc = 2 + Math.min(1, minR * 3); }
        else { flowV2Sc = absImb * 0.3; }
        const normFlowV2p = flowV2Sc / 5;
        const volLiqW = pFlowV2 === 'MAJORITY_ALIGNED' ? 0.3 : 1.0;

        const raw = normFlowV2p * 5 + largePosRatio * 3 + normFreshExcess * 2 + volLiq * volLiqW;
        let score = Math.round((raw / 11) * 100);
        if (pFlowV2 === 'MAJORITY_ALIGNED') score = Math.min(score, 8);

        if (excessFresh <= 0) score = Math.min(score, 6);
        if (largePos === 0) score = Math.min(score, 50);
        const totalVol = buyVol + sellVol;
        if (totalVol < 5000 || totalW < 10) score = Math.min(score, 15);
        try {
          const prices = JSON.parse(market.outcomePrices || '[]');
          const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
          if (maxPrice >= 0.98 && excessFresh <= 0.20) score = Math.round(score * 0.4);
        } catch {}
        try {
          const prices = JSON.parse(market.outcomePrices || '[]');
          const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
          const hrsToExp = market.endDate ? (new Date(market.endDate).getTime() - Date.now()) / 3600000 : Infinity;
          if (hrsToExp < 48 && maxPrice >= 0.95) score = Math.round(score * 0.3);
        } catch {}

        if (score > activeHighestScore) activeHighestScore = score;
        if (score >= 25) activeHotMarkets.push({ question: market.question, conditionId: market.conditionId, slug: market.slug, threat_score: score, flow_direction_v2: pFlowV2 });
      } catch {}
    }

    const combinedHighestScore = Math.max(highestScore, activeHighestScore);

    return NextResponse.json({
      pulse: {
        timestamp: new Date().toISOString(),
        markets_scanned: resolvedMarkets.length + activeMarkets.length,
        total_wallets: totalWallets,
        suspicious_wallets: totalSuspicious,
        suspicious_ratio: totalWallets > 0 ? Math.round((totalSuspicious / totalWallets) * 10000) / 100 : 0,
        highest_score: combinedHighestScore,
        total_volume_usd: Math.round(totalVolume * 100) / 100,
        threat_level: combinedHighestScore >= 75 ? 'SEVERE' : combinedHighestScore >= 50 ? 'ELEVATED' : combinedHighestScore >= 25 ? 'GUARDED' : 'LOW',
      },
      hot_markets: [...hotMarkets.filter(m => !m.closedTime), ...activeHotMarkets].sort((a, b) => (b.threat_score || b.suspicious_wallets || 0) - (a.threat_score || a.suspicious_wallets || 0)).slice(0, 10),
      engine: 'Prescience v2.1',
      tagline: 'See who sees first.',
    });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to generate pulse', detail: err.message }, { status: 500 });
  }
}
