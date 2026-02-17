'use client';
import Link from 'next/link';

export default function HeroTicker({ markets = [] }) {
  const dotColor = (level) => level === 'critical' || level === 'high' ? '#ff2d55' : level === 'medium' ? '#ffcc00' : '#22c55e';
  const items = [...markets, ...markets];

  return (
    <div style={{ overflow: 'hidden', background: '#08081a', borderBottom: '1px solid #1a1a2e', padding: '10px 0' }}>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div style={{
        display: 'flex',
        gap: 32,
        whiteSpace: 'nowrap',
        animation: 'ticker-scroll 60s linear infinite',
        width: 'max-content',
      }}>
        {items.map((m, i) => (
          <Link key={i} href={`/market/${m.slug}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: dotColor(m.threat_level),
              display: 'inline-block',
              boxShadow: `0 0 6px ${dotColor(m.threat_level)}`,
            }} />
            <span style={{ color: '#e0e0e0', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
              {m.question?.slice(0, 60)}{m.question?.length > 60 ? '…' : ''}
            </span>
            <span style={{ color: dotColor(m.threat_level), fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}>
              {m.threat_score}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
