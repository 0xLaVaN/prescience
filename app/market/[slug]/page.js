'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ThreatGauge from '../../components/ThreatGauge';
import TraderDonut from '../../components/TraderDonut';
import FlowBar from '../../components/FlowBar';
import MetricCard from '../../components/MetricCard';

export default function MarketStory() {
  const { slug } = useParams();
  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    fetch(`/api/scan?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(data => {
        const found = (data.scan || [])[0] || null;
        setMarket(found);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ color: '#00f0ff', fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}>
          ◉ Loading signal...
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <p style={{ color: '#888', fontSize: 16 }}>Market not found.</p>
        <Link href="/" style={{ color: '#00f0ff', fontSize: 13 }}>← Back to Newsroom</Link>
      </div>
    );
  }

  const m = market;
  const veterans = Math.max(0, (m.total_wallets || 0) - (m.fresh_wallets || 0) - (m.large_positions || 0));
  const levelColors = { low: '#22c55e', medium: '#ffcc00', high: '#ff2d55', critical: '#ff2d55' };
  const mono = { fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      <Link href="/" style={{ color: '#00f0ff', fontSize: 12, textDecoration: 'none', ...mono }}>
        ← Newsroom
      </Link>

      <section style={{ marginTop: 20, marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e0e0e0', lineHeight: 1.4, marginBottom: 12 }}>
          {m.question}
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 12, color: '#888', ...mono }}>
          <span>Yes: <strong style={{ color: '#22c55e' }}>{((m.currentPrices?.Yes || 0) * 100).toFixed(0)}¢</strong></span>
          <span>No: <strong style={{ color: '#ff2d55' }}>{((m.currentPrices?.No || 0) * 100).toFixed(0)}¢</strong></span>
          <span>Ends: {m.endDate ? new Date(m.endDate).toLocaleDateString() : '—'}</span>
          <span style={{ color: '#00f0ff' }}>{m.exchange}</span>
        </div>
      </section>

      <section style={{ background: '#111122', borderRadius: 12, padding: 24, marginBottom: 24, border: '1px solid #1a1a2e' }}>
        <h2 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 2 }}>Threat Assessment</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <ThreatGauge score={m.threat_score} level={m.threat_level} size={160} />
          <div>
            <span style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: 20,
              background: `${levelColors[m.threat_level]}22`,
              color: levelColors[m.threat_level],
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', ...mono,
            }}>
              {m.threat_level}
            </span>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <section style={{ background: '#111122', borderRadius: 12, padding: 24, border: '1px solid #1a1a2e' }}>
          <h2 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 2 }}>Who's Trading</h2>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <TraderDonut fresh={m.fresh_wallets} veterans={veterans} large={m.large_positions} total={m.total_wallets} size={140} />
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: '#888', textAlign: 'center', ...mono }}>
            {m.total_wallets} wallets · {m.total_trades} trades
          </div>
        </section>

        <section style={{ background: '#111122', borderRadius: 12, padding: 24, border: '1px solid #1a1a2e' }}>
          <h2 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 2 }}>Flow Analysis</h2>
          <FlowBar
            minorityFlow={m.minority_side_flow_usd || 0}
            majorityFlow={m.majority_side_flow_usd || 0}
            minorityOutcome={m.minority_outcome || 'Minority'}
            majorityOutcome={m.majority_outcome || 'Majority'}
            flowDirection={m.flow_direction_v2 || m.flow_direction || ''}
          />
          <div style={{ marginTop: 12, fontSize: 12, color: '#e0e0e0', textAlign: 'center', ...mono }}>
            Imbalance: <span style={{ color: '#ffcc00' }}>{((m.flow_imbalance || 0) * 100).toFixed(1)}%</span>
          </div>
        </section>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 2 }}>Key Metrics</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <MetricCard label="Total Wallets" value={m.total_wallets || 0} icon="👛" />
          <MetricCard label="Total Trades" value={m.total_trades || 0} icon="📈" />
          <MetricCard label="Volume USD" value={`$${((m.total_volume_usd || 0) / 1000).toFixed(1)}k`} icon="💰" />
          <MetricCard label="Vol/Liquidity" value={`${((m.volume_vs_liquidity || 0) * 100).toFixed(1)}%`} icon="🌊" />
          <MetricCard label="Fresh Excess" value={`${((m.fresh_wallet_excess || 0) * 100).toFixed(1)}%`} icon="🆕" />
          <MetricCard label="Large Ratio" value={`${((m.large_position_ratio || 0) * 100).toFixed(1)}%`} icon="🐋" />
        </div>
      </section>

      <section style={{ marginBottom: 40 }}>
        <button
          onClick={() => setShowRaw(!showRaw)}
          style={{
            background: 'none', border: '1px solid #1a1a2e', borderRadius: 8,
            color: '#888', padding: '8px 16px', cursor: 'pointer', fontSize: 12, ...mono,
          }}
        >
          {showRaw ? '▼' : '▶'} Raw Signal Data
        </button>
        {showRaw && (
          <pre style={{
            marginTop: 12, background: '#08081a', border: '1px solid #1a1a2e',
            borderRadius: 8, padding: 16, overflow: 'auto', fontSize: 11,
            color: '#00f0ff', maxHeight: 400, ...mono,
          }}>
            {JSON.stringify(m, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
