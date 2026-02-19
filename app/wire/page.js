'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import ParticleBackground from '../components/ParticleBackground';
import {
  ThreatPulseIcon, GridScanIcon, WalletIcon, VolumeBarIcon,
  ShieldIcon, RadarIcon, TrendUpIcon
} from '../components/SvgIcons';

/* ═══════════════════════════════════════════════════════════════════
   STYLES — injected via <style jsx global>
   ═══════════════════════════════════════════════════════════════════ */
const globalStyles = `
  @keyframes radarSweep {
    0% { transform: scale(0.3); opacity: 1; }
    100% { transform: scale(1.8); opacity: 0; }
  }
  @keyframes radarDot {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 1; }
  }
  @keyframes pulseGlow {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes drawArc {
    from { stroke-dashoffset: var(--arc-length); }
    to { stroke-dashoffset: var(--arc-target); }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .wire-table-row:hover {
    background: rgba(0, 240, 255, 0.04) !important;
    box-shadow: inset 0 0 0 1px rgba(0, 240, 255, 0.1);
  }
  .wire-table-row { transition: all 0.2s ease; cursor: pointer; }
  .font-data { font-family: 'JetBrains Mono', monospace; }
  .font-text { font-family: 'Inter', sans-serif; }
`;

/* ═══════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════ */

function formatVolume(val) {
  if (val == null || isNaN(val)) return '$0';
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${Math.round(val)}`;
}

function threatColor(score) {
  if (score >= 40) return '#ff3366';
  if (score >= 15) return '#f0a000';
  return '#00ff88';
}

function threatLevelColor(level) {
  const l = (level || '').toUpperCase();
  if (l === 'CRITICAL' || l === 'SEVERE' || l === 'HIGH') return '#ff3366';
  if (l === 'ELEVATED' || l === 'MODERATE') return '#f0a000';
  return '#00ff88'; // LOW
}

/* ═══════════════════════════════════════════════════════════════════
   RADAR LOADING SPINNER
   ═══════════════════════════════════════════════════════════════════ */
function RadarLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 24 }}>
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        {/* Concentric rings */}
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            border: '1px solid rgba(0,240,255,0.15)',
            borderRadius: '50%',
            animation: `radarSweep 2s ease-out ${i * 0.5}s infinite`,
          }} />
        ))}
        {/* Center dot */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 8, height: 8, marginTop: -4, marginLeft: -4,
          background: '#00f0ff', borderRadius: '50%',
          boxShadow: '0 0 20px #00f0ff, 0 0 40px rgba(0,240,255,0.3)',
          animation: 'pulseGlow 1.5s ease-in-out infinite',
        }} />
        {/* Orbiting dots */}
        {[0, 1, 2, 3, 4].map(i => (
          <div key={`dot-${i}`} style={{
            position: 'absolute',
            top: `${50 + 35 * Math.sin((i / 5) * Math.PI * 2)}%`,
            left: `${50 + 35 * Math.cos((i / 5) * Math.PI * 2)}%`,
            width: 4, height: 4, marginTop: -2, marginLeft: -2,
            background: '#00f0ff', borderRadius: '50%',
            animation: `radarDot 1.2s ease-in-out ${i * 0.25}s infinite`,
          }} />
        ))}
      </div>
      <div className="font-data" style={{
        color: '#00f0ff', fontSize: 13, letterSpacing: 2,
        animation: 'pulseGlow 1.5s ease-in-out infinite',
      }}>
        SCANNING MARKETS
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ANIMATED COUNTER
   ═══════════════════════════════════════════════════════════════════ */
function AnimatedCount({ value, format, duration = 800 }) {
  const [display, setDisplay] = useState(0);
  const started = useRef(false);
  const numVal = typeof value === 'number' ? value : parseFloat(value) || 0;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let start = null;
    const animate = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(numVal * eased);
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [numVal, duration]);

  if (format) return format(display);
  return Math.round(display).toLocaleString();
}

/* ═══════════════════════════════════════════════════════════════════
   ANIMATED DONUT CHART
   ═══════════════════════════════════════════════════════════════════ */
function AnimatedDonut({ value, max = 100, label, color, size = 130, sublabel }) {
  const r = 44;
  const C = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const target = C * (1 - pct);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {label && (
        <div className="font-text" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 500 }}>
          {label}
        </div>
      )}
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={C}
            style={{
              '--arc-length': C,
              '--arc-target': target,
              strokeDashoffset: target,
              animation: 'drawArc 0.8s cubic-bezier(0.16,1,0.3,1) forwards',
              filter: `drop-shadow(0 0 6px ${color}50)`,
            }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="font-data" style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>
            <AnimatedCount value={value} />
          </span>
          {sublabel && (
            <span className="font-text" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
              {sublabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   KPI CARD
   ═══════════════════════════════════════════════════════════════════ */
function KpiCard({ icon, label, value, valueColor = '#00f0ff', delay = 0 }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 10,
      animation: `fadeSlideUp 0.6s ease-out ${delay}ms both`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon}
        <span className="font-text" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 500 }}>
          {label}
        </span>
      </div>
      <div className="font-data" style={{ fontSize: 24, fontWeight: 700, color: valueColor, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   THREAT DOT (for table)
   ═══════════════════════════════════════════════════════════════════ */
function ThreatDot({ score }) {
  const c = threatColor(score);
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8,
      borderRadius: '50%', background: c,
      boxShadow: `0 0 6px ${c}60`,
      marginRight: 8, verticalAlign: 'middle',
    }} />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MARKET TABLE (enhanced)
   ═══════════════════════════════════════════════════════════════════ */
const columns = [
  { key: 'question', label: 'Market', sort: true },
  { key: 'threat_score', label: 'Threat', sort: true },
  { key: 'fresh_wallet_ratio', label: 'Fresh %', sort: true },
  { key: 'large_position_ratio', label: 'Large %', sort: true },
  { key: 'volume24hr', label: 'Vol 24h', sort: true },
  { key: 'flow_direction', label: 'Flow', sort: false },
];

function WireTable({ markets = [] }) {
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

  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {columns.map(c => (
              <th key={c.key} onClick={() => c.sort && toggle(c.key)}
                className="font-text"
                style={{
                  textAlign: 'left', padding: '12px 14px',
                  color: sortKey === c.key ? '#00f0ff' : 'rgba(255,255,255,0.35)',
                  cursor: c.sort ? 'pointer' : 'default', userSelect: 'none',
                  fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600,
                  background: 'rgba(255,255,255,0.01)',
                }}>
                {c.label} {sortKey === c.key ? (sortDir > 0 ? '▲' : '▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => (
            <tr key={i} className="wire-table-row"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <td className="font-text" style={{ padding: '12px 14px', maxWidth: 320, fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 400 }}>
                <Link href={`/market/${m.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {(m.question || '').slice(0, 80)}
                </Link>
              </td>
              <td className="font-data" style={{ padding: '12px 14px', fontSize: 13 }}>
                <ThreatDot score={m.threat_score || 0} />
                <span style={{ color: threatColor(m.threat_score || 0) }}>{m.threat_score || 0}</span>
              </td>
              <td className="font-data" style={{ padding: '12px 14px', fontSize: 12, color: '#00f0ff' }}>
                {((m.fresh_wallet_ratio || 0) * 100).toFixed(1)}%
              </td>
              <td className="font-data" style={{ padding: '12px 14px', fontSize: 12, color: '#ff3366' }}>
                {((m.large_position_ratio || 0) * 100).toFixed(1)}%
              </td>
              <td className="font-data" style={{ padding: '12px 14px', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                {formatVolume(m.volume24hr || 0)}
              </td>
              <td className="font-data" style={{ padding: '12px 14px', fontSize: 11, color: '#f0a000' }}>
                {m.flow_direction || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TOP THREAT CARD
   ═══════════════════════════════════════════════════════════════════ */
function TopThreatCard({ market, index }) {
  const score = market.threat_score || 0;
  const color = threatColor(score);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14, padding: 20,
      animation: `fadeSlideUp 0.5s ease-out ${index * 100}ms both`,
      transition: 'all 0.3s ease',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(0,240,255,0.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: `1.5px solid ${color}50`,
          background: `${color}08`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span className="font-data" style={{ fontSize: 16, fontWeight: 700, color }}>{score}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="font-text" style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 400, lineHeight: 1.4 }}>
            {(market.question || market.market?.question || '').slice(0, 80)}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div className="font-text" style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1 }}>Fresh</div>
          <div className="font-data" style={{ fontSize: 12, color: '#00f0ff' }}>{((market.fresh_wallet_ratio || 0) * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div className="font-text" style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1 }}>Volume</div>
          <div className="font-data" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{formatVolume(market.volume24hr || 0)}</div>
        </div>
        <div>
          <div className="font-text" style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 1 }}>Flow</div>
          <div className="font-data" style={{ fontSize: 11, color: '#f0a000' }}>{market.flow_direction || '—'}</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN WIRE PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function WirePage() {
  const [markets, setMarkets] = useState([]);
  const [pulse, setPulse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/scan').then(r => r.json()).catch(() => ({ scan: [] })),
      fetch('/api/pulse').then(r => r.json()).catch(() => null),
    ]).then(([scanData, pulseData]) => {
      setMarkets(scanData.scan || []);
      setPulse(pulseData?.pulse || pulseData);
      setLoading(false);
    });
  }, []);

  const top3 = [...markets].sort((a, b) => (b.threat_score || 0) - (a.threat_score || 0)).slice(0, 3);
  const totalWallets = pulse?.total_wallets ?? 0;
  const totalVolume = pulse?.total_volume_usd ?? 0;
  const threatLevel = pulse?.threat_level ?? 'LOW';
  const marketsScanned = pulse?.markets_scanned ?? markets.length;
  const highestScore = pulse?.highest_score ?? (top3[0]?.threat_score || 0);

  // Compute wallet distribution for donut
  const freshWallets = markets.reduce((s, m) => s + (m.suspicious_wallets || m.signals?.fresh_wallet_count || 0), 0);
  const cleanWallets = Math.max(0, totalWallets - freshWallets);

  return (
    <div style={{ position: 'relative', zIndex: 10, minHeight: '100vh' }}>
      <style jsx global>{globalStyles}</style>
      <ParticleBackground />

      {loading ? (
        <RadarLoader />
      ) : (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px 64px' }}>
          {/* HEADER */}
          <div style={{ marginBottom: 40, animation: 'fadeSlideUp 0.5s ease-out both' }}>
            <h1 className="font-text" style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.9)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <RadarIcon size={24} color="#00f0ff" />
              Prescience Wire
            </h1>
            <p className="font-text" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 8, fontWeight: 400 }}>
              Live threat detection and market intelligence
            </p>
          </div>

          {/* TOP THREATS */}
          <section style={{ marginBottom: 48 }}>
            <h2 className="font-text" style={{
              fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 16,
              textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <ThreatPulseIcon size={18} color="#ff3366" />
              Top Threats
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              {top3.map((m, i) => (
                <TopThreatCard key={i} market={m} index={i} />
              ))}
            </div>
          </section>

          {/* KPI ROW */}
          <section style={{ marginBottom: 48 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <KpiCard
                icon={<GridScanIcon size={20} />}
                label="Markets Scanned"
                value={<AnimatedCount value={marketsScanned} />}
                delay={0}
              />
              <KpiCard
                icon={<WalletIcon size={20} />}
                label="Total Wallets"
                value={<AnimatedCount value={totalWallets} />}
                delay={80}
              />
              <KpiCard
                icon={<VolumeBarIcon size={20} />}
                label="Total Volume"
                value={<AnimatedCount value={totalVolume} format={v => formatVolume(v)} />}
                delay={160}
              />
              <KpiCard
                icon={<ShieldIcon size={20} color={threatLevelColor(threatLevel)} fillOpacity={0.2} />}
                label="Threat Level"
                value={threatLevel}
                valueColor={threatLevelColor(threatLevel)}
                delay={240}
              />
            </div>
          </section>

          {/* DONUT CHARTS */}
          <section style={{ marginBottom: 48, display: 'flex', justifyContent: 'center', gap: 60, flexWrap: 'wrap' }}>
            <AnimatedDonut
              value={highestScore}
              max={100}
              label="Threat Score"
              sublabel="highest"
              color={threatColor(highestScore)}
              size={140}
            />
            <AnimatedDonut
              value={freshWallets}
              max={Math.max(totalWallets, 1)}
              label="Wallet Distribution"
              sublabel="suspicious"
              color="#00f0ff"
              size={140}
            />
          </section>

          {/* ALL MARKETS TABLE */}
          <section>
            <h2 className="font-text" style={{
              fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 16,
              textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <RadarIcon size={18} color="#00f0ff" />
              All Markets
            </h2>
            <WireTable markets={markets} />
          </section>
        </div>
      )}
    </div>
  );
}
