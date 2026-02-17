'use client';
import { useState } from 'react';
import Link from 'next/link';

const columns = [
  { key: 'question', label: 'Market', sort: true },
  { key: 'threat_score', label: 'Threat', sort: true },
  { key: 'fresh_wallet_ratio', label: 'Fresh%', sort: true },
  { key: 'large_position_ratio', label: 'Large%', sort: true },
  { key: 'volume24hr', label: 'Vol 24h', sort: true },
  { key: 'flow_direction', label: 'Flow', sort: false },
];

const rowBg = (level) => {
  if (level === 'critical') return 'rgba(255,45,85,0.08)';
  if (level === 'high') return 'rgba(255,45,85,0.05)';
  if (level === 'medium') return 'rgba(255,204,0,0.05)';
  return 'transparent';
};

const threatBadge = (level) => {
  const c = level === 'critical' || level === 'high' ? '#ff2d55' : level === 'medium' ? '#ffcc00' : '#22c55e';
  return <span style={{ color: c, fontWeight: 'bold' }}>{level}</span>;
};

export default function ScanTable({ markets = [] }) {
  const [sortKey, setSortKey] = useState('threat_score');
  const [sortDir, setSortDir] = useState(-1);

  const sorted = [...markets].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === 'number') return (av - bv) * sortDir;
    return String(av || '').localeCompare(String(bv || '')) * sortDir;
  });

  const toggle = (key) => {
    if (sortKey === key) setSortDir(-sortDir);
    else { setSortKey(key); setSortDir(-1); }
  };

  const mono = { fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, ...mono }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1a1a2e' }}>
            {columns.map(c => (
              <th key={c.key} onClick={() => c.sort && toggle(c.key)}
                style={{ textAlign: 'left', padding: '10px 12px', color: '#888', cursor: c.sort ? 'pointer' : 'default', userSelect: 'none', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                {c.label} {sortKey === c.key ? (sortDir > 0 ? '▲' : '▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => (
            <tr key={i} style={{ background: rowBg(m.threat_level), borderBottom: '1px solid #0d0d1a' }}>
              <td style={{ padding: '10px 12px', maxWidth: 300 }}>
                <Link href={`/market/${m.slug}`} style={{ color: '#e0e0e0', textDecoration: 'none' }}>
                  {m.question?.slice(0, 80)}
                </Link>
              </td>
              <td style={{ padding: '10px 12px' }}>{threatBadge(m.threat_level)} <span style={{ color: '#e0e0e0' }}>{m.threat_score}</span></td>
              <td style={{ padding: '10px 12px', color: '#00f0ff' }}>{((m.fresh_wallet_ratio || 0) * 100).toFixed(1)}%</td>
              <td style={{ padding: '10px 12px', color: '#ff2d55' }}>{((m.large_position_ratio || 0) * 100).toFixed(1)}%</td>
              <td style={{ padding: '10px 12px', color: '#e0e0e0' }}>${(m.volume24hr || 0).toLocaleString()}</td>
              <td style={{ padding: '10px 12px', color: '#ffcc00' }}>{m.flow_direction || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
