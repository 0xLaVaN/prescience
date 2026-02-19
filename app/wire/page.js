'use client';
import { useState, useEffect } from 'react';
import HeroTicker from '../components/HeroTicker';
import MarketCard from '../components/MarketCard';
import ScanTable from '../components/ScanTable';
import MetricCard from '../components/MetricCard';

export default function NewsroomHome() {
  const [markets, setMarkets] = useState([]);
  const [pulse, setPulse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/scan').then(r => r.json()).catch(() => ({ scan: [] })),
      fetch('/api/pulse').then(r => r.json()).catch(() => null),
    ]).then(([scanData, pulseData]) => {
      setMarkets(scanData.scan || []);
      setPulse(pulseData);
      setLoading(false);
    });
  }, []);

  const top3 = [...markets].sort((a, b) => (b.threat_score || 0) - (a.threat_score || 0)).slice(0, 3);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ color: '#00f0ff', fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}>
          ◉ Scanning markets...
        </div>
      </div>
    );
  }

  return (
    <div>
      <HeroTicker markets={markets} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e0e0e0', margin: 0 }}>
            <span style={{ color: '#00f0ff' }}>◉</span> Prescience Newsroom
          </h1>
          <p style={{ color: '#666', fontSize: 13, marginTop: 8 }}>
            Real-time prediction market intelligence — threat detection, flow analysis, trader behavior
          </p>
        </div>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 16, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 2 }}>
            🔥 Top Threats
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {top3.map((m, i) => (
              <MarketCard key={i} market={m} />
            ))}
          </div>
        </section>

        {pulse && (
          <section style={{ marginBottom: 48 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <MetricCard label="Markets Scanned" value={pulse.pulse?.markets_scanned ?? markets.length} icon="🔍" />
              <MetricCard label="Total Wallets" value={(pulse.pulse?.total_wallets ?? 0).toLocaleString()} icon="👛" />
              <MetricCard label="Total Volume" value={`$${((pulse.pulse?.total_volume_usd ?? 0) / 1e6).toFixed(1)}M`} icon="💰" />
              <MetricCard label="Threat Level" value={pulse.pulse?.threat_level ?? '—'} icon="⚙️" />
            </div>
          </section>
        )}

        <section>
          <h2 style={{ fontSize: 16, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 2 }}>
            📡 All Markets
          </h2>
          <ScanTable markets={markets} />
        </section>
      </div>
    </div>
  );
}
