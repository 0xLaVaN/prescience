'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function scoreColor(score) {
  if (score >= 75) return '#ff3366';
  if (score >= 50) return '#FFD700';
  return '#00ff88';
}

export default function Ticker() {
  const [markets, setMarkets] = useState([]);

  useEffect(() => {
    fetch('/api/pulse')
      .then((r) => r.json())
      .then((d) => setMarkets(d.hot_markets || []))
      .catch(() => {});
  }, []);

  if (!markets.length) return null;

  const items = [...markets, ...markets]; // duplicate for infinite scroll

  return (
    <div className="fixed top-14 left-0 right-0 z-40 h-8 bg-[#12121a] border-b border-white/5 overflow-hidden">
      <div className="flex items-center h-full animate-scroll-x whitespace-nowrap">
        {items.map((m, i) => (
          <Link
            key={`${m.slug || m.id}-${i}`}
            href={`/market/${m.slug || m.id}`}
            className="inline-flex items-center gap-2 px-4 text-[10px] font-mono text-white/50 hover:text-white/70 transition-colors flex-shrink-0"
          >
            <span className="max-w-[180px] truncate">{m.question || m.title}</span>
            <span
              className="font-bold"
              style={{ color: scoreColor(m.threat_score) }}
            >
              {m.threat_score}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
