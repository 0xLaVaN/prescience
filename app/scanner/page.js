'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

function getThreatColor(score) {
  if (score >= 70) return '#ff3366';
  if (score >= 25) return '#f0a000';
  return '#00ff88';
}

function getThreatLabel(score) {
  if (score >= 70) return 'CRITICAL';
  if (score >= 25) return 'ELEVATED';
  return 'NORMAL';
}

function formatVolume(v) {
  if (!v) return '$0';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function flowBadge(flow) {
  if (!flow || flow === 'NEUTRAL') return { label: 'NEUTRAL', color: '#ffffff30' };
  if (flow === 'YES' || flow === 'BULLISH') return { label: flow, color: '#00ff88' };
  if (flow === 'NO' || flow === 'BEARISH') return { label: flow, color: '#ff3366' };
  return { label: flow, color: '#f0a000' };
}

// ─── THREAT OVERVIEW BAR ───────────────────────────────────────────
function ThreatOverview({ critical, elevated, normal, total }) {
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className="holo-card rounded-xl p-5 mb-6">
      <div className="text-[9px] tracking-[0.2em] text-white/30 mb-4">THREAT OVERVIEW</div>
      <div className="flex rounded-lg overflow-hidden h-10 bg-white/[0.03]">
        {[
          { count: critical, label: 'CRITICAL', color: '#ff3366', bg: 'rgba(255,51,102,0.15)' },
          { count: elevated, label: 'ELEVATED', color: '#f0a000', bg: 'rgba(240,160,0,0.12)' },
          { count: normal, label: 'NORMAL', color: '#00ff88', bg: 'rgba(0,255,136,0.08)' },
        ].map(seg => {
          const pct = total > 0 ? (seg.count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <motion.div key={seg.label}
              initial={{ width: 0 }} animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="flex items-center justify-center gap-2 relative overflow-hidden"
              style={{ background: seg.bg }}>
              <span className="text-[10px] font-bold" style={{ color: seg.color }}>{seg.count}</span>
              <span className="text-[8px] tracking-widest hidden sm:inline" style={{ color: seg.color, opacity: 0.7 }}>{seg.label}</span>
            </motion.div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-[8px] text-white/20">
        <span>🔴 Critical ≥70</span>
        <span>🟡 Elevated ≥25</span>
        <span>🟢 Normal &lt;25</span>
      </div>
    </motion.div>
  );
}

// ─── SCORE GAUGE ───────────────────────────────────────────────────
function ScoreGauge({ score, size = 52 }) {
  const color = getThreatColor(score);
  const circ = 2 * Math.PI * 20;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 50 50" className="w-full h-full -rotate-90">
        <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
        <motion.circle cx="25" cy="25" r="20" fill="none" stroke={color} strokeWidth="3"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1 }}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-black" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

// ─── GRID CARD ─────────────────────────────────────────────────────
function MarketGridCard({ market, index }) {
  const score = market.threat_score || 0;
  const color = getThreatColor(score);
  const flow = flowBadge(market.flow_direction_v2);

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }} whileHover={{ y: -2 }}>
      <Link href={`/market/${encodeURIComponent(market.slug || '')}`}>
        <div className="holo-card rounded-xl p-5 h-full transition-all hover:bg-white/[0.04] cursor-pointer relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}50` }} />
          <div className="flex items-start gap-3 mb-3">
            <ScoreGauge score={score} />
            <div className="flex-1 min-w-0">
              <h3 className="text-[11px] text-white/70 leading-relaxed line-clamp-2">{market.question}</h3>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div className="bg-white/[0.03] rounded p-1.5">
              <div className="text-[10px] font-bold text-white/60">{market.total_wallets || 0}</div>
              <div className="text-[7px] text-white/20 tracking-widest">WALLETS</div>
            </div>
            <div className="bg-white/[0.03] rounded p-1.5">
              <div className="text-[10px] font-bold text-white/60">{market.total_trades || 0}</div>
              <div className="text-[7px] text-white/20 tracking-widest">TRADES</div>
            </div>
            <div className="bg-white/[0.03] rounded p-1.5">
              <div className="text-[10px] font-bold text-white/60">{formatVolume(market.total_volume_usd)}</div>
              <div className="text-[7px] text-white/20 tracking-widest">VOLUME</div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[8px] px-2 py-0.5 rounded border" style={{ color: flow.color, borderColor: `${flow.color}40` }}>
              {flow.label}
            </span>
            <span className="text-[8px] text-white/20">{market.fresh_wallets || 0} fresh</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── TABLE VIEW ────────────────────────────────────────────────────
function SortableHeader({ label, sortKey, currentSort, onSort }) {
  const active = currentSort.key === sortKey;
  return (
    <th className="text-left text-[9px] tracking-widest text-white/30 py-3 px-3 cursor-pointer hover:text-white/50 select-none whitespace-nowrap"
      onClick={() => onSort(sortKey)}>
      {label} {active && (currentSort.dir === 'desc' ? '▼' : '▲')}
    </th>
  );
}

function TableView({ markets, sort, onSort }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full">
        <thead className="border-b border-white/5">
          <tr>
            <th className="text-left text-[9px] tracking-widest text-white/30 py-3 px-3">MARKET</th>
            <SortableHeader label="THREAT" sortKey="threat_score" currentSort={sort} onSort={onSort} />
            <SortableHeader label="WALLETS" sortKey="total_wallets" currentSort={sort} onSort={onSort} />
            <SortableHeader label="VOLUME" sortKey="total_volume_usd" currentSort={sort} onSort={onSort} />
            <th className="text-left text-[9px] tracking-widest text-white/30 py-3 px-3">FLOW</th>
            <SortableHeader label="FRESH%" sortKey="fresh_pct" currentSort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {markets.map((m, i) => {
            const score = m.threat_score || 0;
            const color = getThreatColor(score);
            const flow = flowBadge(m.flow_direction_v2);
            const freshPct = m.total_wallets > 0 ? Math.round(((m.fresh_wallets || 0) / m.total_wallets) * 100) : 0;
            return (
              <motion.tr key={m.conditionId || i}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                className="border-b border-white/[0.03] hover:bg-white/[0.03] cursor-pointer transition-colors"
                onClick={() => window.location.href = `/market/${encodeURIComponent(m.slug || '')}`}>
                <td className="py-3 px-3 text-[11px] text-white/60 max-w-[300px]">
                  <span className="line-clamp-2">{m.question}</span>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-[10px] font-bold" style={{ color }}>{score}</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-[10px] text-white/50 font-mono">{m.total_wallets || 0}</td>
                <td className="py-3 px-3 text-[10px] text-white/50 font-mono">{formatVolume(m.total_volume_usd)}</td>
                <td className="py-3 px-3">
                  <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ color: flow.color, background: `${flow.color}10` }}>
                    {flow.label}
                  </span>
                </td>
                <td className="py-3 px-3 text-[10px] font-mono" style={{ color: freshPct > 50 ? '#ff3366' : '#ffffff50' }}>
                  {freshPct}%
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN SCANNER PAGE ─────────────────────────────────────────────
export default function ScannerPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [threatFilter, setThreatFilter] = useState('ALL');
  const [sort, setSort] = useState({ key: 'threat_score', dir: 'desc' });
  const [view, setView] = useState('grid');

  useEffect(() => {
    const saved = localStorage.getItem('scanner-view');
    if (saved) setView(saved);
    fetch('/api/scan').then(r => r.json())
      .then(res => { setData(res.scan || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { localStorage.setItem('scanner-view', view); }, [view]);

  const handleSort = (key) => {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' });
  };

  const processed = useMemo(() => {
    let items = [...data];

    // Add fresh_pct for sorting
    items = items.map(m => ({
      ...m,
      fresh_pct: m.total_wallets > 0 ? (m.fresh_wallets || 0) / m.total_wallets : 0,
    }));

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(m => (m.question || '').toLowerCase().includes(q));
    }

    if (threatFilter !== 'ALL') {
      items = items.filter(m => {
        const s = m.threat_score || 0;
        if (threatFilter === 'CRITICAL') return s >= 70;
        if (threatFilter === 'ELEVATED') return s >= 25 && s < 70;
        return s < 25;
      });
    }

    items.sort((a, b) => {
      const av = a[sort.key] || 0;
      const bv = b[sort.key] || 0;
      return sort.dir === 'desc' ? bv - av : av - bv;
    });

    return items;
  }, [data, search, threatFilter, sort]);

  const critical = data.filter(m => (m.threat_score || 0) >= 70).length;
  const elevated = data.filter(m => (m.threat_score || 0) >= 25 && (m.threat_score || 0) < 70).length;
  const normal = data.filter(m => (m.threat_score || 0) < 25).length;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
          className="text-[#00f0ff] text-sm tracking-widest font-mono"
          style={{ textShadow: '0 0 20px #00f0ff' }}>
          ◈ SCANNING THREAT MATRIX...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
        <h1 className="text-xl font-black tracking-[0.15em] text-white/80 mb-1">
          <span className="text-[#ff3366]" style={{ textShadow: '0 0 15px rgba(255,51,102,0.3)' }}>THE SCANNER</span>
        </h1>
        <p className="text-[10px] text-white/25 tracking-wider font-mono">Real-time threat detection across all monitored markets</p>
      </motion.div>

      <ThreatOverview critical={critical} elevated={elevated} normal={normal} total={data.length} />

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select value={threatFilter} onChange={e => setThreatFilter(e.target.value)}
          className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/60 tracking-wider font-mono focus:outline-none focus:border-[#00f0ff]/30">
          <option value="ALL">ALL LEVELS</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="ELEVATED">ELEVATED</option>
          <option value="NORMAL">NORMAL</option>
        </select>

        <div className="flex-1 min-w-[200px] relative">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search markets..."
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-[11px] text-white/60 font-mono placeholder:text-white/20 focus:outline-none focus:border-[#00f0ff]/30" />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 text-xs">✕</button>
          )}
        </div>

        <select value={sort.key} onChange={e => handleSort(e.target.value)}
          className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/60 tracking-wider font-mono focus:outline-none focus:border-[#00f0ff]/30">
          <option value="threat_score">SORT: SCORE</option>
          <option value="total_volume_usd">SORT: VOLUME</option>
          <option value="total_wallets">SORT: WALLETS</option>
        </select>

        <button onClick={() => setView(v => v === 'grid' ? 'table' : 'grid')}
          className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/50 tracking-wider hover:text-white/70 hover:border-white/20 transition-all font-mono">
          {view === 'grid' ? '☰ TABLE' : '▦ GRID'}
        </button>
      </div>

      <div className="text-[9px] text-white/20 mb-4 font-mono">{processed.length} markets</div>

      {/* Results */}
      {view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {processed.map((m, i) => (
            <MarketGridCard key={m.conditionId || i} market={m} index={i} />
          ))}
        </div>
      ) : (
        <div className="holo-card rounded-xl overflow-hidden mb-12">
          <TableView markets={processed} sort={sort} onSort={handleSort} />
        </div>
      )}

      {processed.length === 0 && (
        <div className="text-center py-20 text-white/20 text-[11px] tracking-widest font-mono">
          NO MARKETS MATCH CURRENT FILTERS
        </div>
      )}
    </div>
  );
}
