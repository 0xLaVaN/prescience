'use client';
import Link from 'next/link';
import ThreatGauge from './ThreatGauge';
import TraderDonut from './TraderDonut';

export default function MarketCard({ market }) {
  const m = market;
  const borderColor = m.threat_level === 'critical' ? '#ff2d55' : m.threat_level === 'high' ? '#ff2d55' : m.threat_level === 'medium' ? '#ffcc00' : '#1a1a2e';

  return (
    <Link href={`/market/${m.slug}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: '#111122',
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        padding: 20,
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}>
        <h3 style={{ color: '#e0e0e0', fontSize: 14, fontWeight: 600, marginBottom: 12, lineHeight: 1.4, minHeight: 40 }}>
          {m.question}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <ThreatGauge score={m.threat_score} level={m.threat_level} size={80} />
          <TraderDonut
            fresh={m.fresh_wallets}
            veterans={Math.max(0, (m.total_wallets || 0) - (m.fresh_wallets || 0) - (m.large_positions || 0))}
            large={m.large_positions}
            total={m.total_wallets}
            size={70}
          />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 12,
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#888'
        }}>
          <span>Vol: ${(m.volume24hr || 0).toLocaleString()}</span>
          <span style={{ color: '#00f0ff' }}>{m.exchange}</span>
        </div>
      </div>
    </Link>
  );
}
