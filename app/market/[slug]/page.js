'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ThreatBadge from '../../components/ThreatBadge';
import ShareButton from '../../components/ShareButton';
import ProGate from '../../components/ProGate';

function getThreatColor(score) {
  if (score >= 75) return '#ff3366';
  if (score >= 50) return '#f0a000';
  if (score >= 25) return '#00f0ff';
  return '#00ff88';
}

function AnimatedNumber({ value, duration = 1000 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const target = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(target)) { setDisplay(value); return; }
    const start = performance.now();
    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => ref.current && cancelAnimationFrame(ref.current);
  }, [value, duration]);
  return <>{typeof display === 'number' ? display.toLocaleString() : display}</>;
}

function ScoreGauge({ score, size = 160 }) {
  const color = getThreatColor(score);
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <motion.circle cx="60" cy="60" r="52" fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black" style={{ color, textShadow: `0 0 20px ${color}40` }}>{score}</span>
        <span className="text-[8px] text-white/30 tracking-[0.2em] mt-1">THREAT</span>
      </div>
    </div>
  );
}

function BreakdownBar({ label, value, maxValue = 100, color = '#00f0ff', detail }) {
  const pct = maxValue > 0 ? Math.min((parseFloat(value) / maxValue) * 100, 100) : 0;
  return (
    <div className="mb-4">
      <div className="flex justify-between text-[10px] mb-1.5">
        <span className="text-white/40 uppercase tracking-wider font-mono">{label}</span>
        <span className="font-bold font-mono" style={{ color }}>{value}</span>
      </div>
      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div className="h-full rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }} />
      </div>
      {detail && <div className="text-[9px] text-white/20 mt-1 font-mono">{detail}</div>}
    </div>
  );
}

function generateAssessment(m) {
  const parts = [];
  const score = m.threat_score || 0;
  if (score >= 75) parts.push('This market exhibits critical threat signals requiring immediate attention.');
  else if (score >= 50) parts.push('This market shows elevated threat signals warranting close monitoring.');
  else if (score >= 25) parts.push('This market presents moderate anomalies within expected ranges.');
  else parts.push('This market shows normal trading patterns with minimal anomalies detected.');

  if ((m.fresh_wallet_excess || 0) > 0.3) parts.push(`Unusual fresh wallet activity detected—${((m.fresh_wallet_excess)*100).toFixed(0)}% above baseline—suggesting potential coordinated entry.`);
  if ((m.large_position_ratio || 0) > 0.2) parts.push(`Large position concentration at ${((m.large_position_ratio)*100).toFixed(0)}% indicates whale-level interest.`);
  if (m.flow_direction_v2 === 'MINORITY_HEAVY') parts.push('Flow analysis indicates MINORITY_HEAVY positioning, suggesting informed traders may be betting against consensus.');
  else if (m.flow_direction_v2 === 'MAJORITY_ALIGNED') parts.push('Flow is majority-aligned, consistent with public sentiment.');
  else if (m.flow_direction_v2 === 'MIXED') parts.push('Mixed flow signals indicate divergent positioning among trader cohorts.');

  return parts.join(' ');
}

function MockPriceChart({ currentYes }) {
  const points = useMemo(() => {
    const pts = [];
    let price = 0.5;
    const target = currentYes || 0.5;
    for (let i = 0; i < 20; i++) {
      const drift = (target - price) * 0.15;
      const noise = (Math.random() - 0.5) * 0.08;
      price = Math.max(0.02, Math.min(0.98, price + drift + noise));
      pts.push(price);
    }
    pts[pts.length - 1] = target;
    return pts;
  }, [currentYes]);

  const w = 500, h = 150, pad = 10;
  const min = Math.min(...points) - 0.05;
  const max = Math.max(...points) + 0.05;
  const range = max - min || 1;
  const toX = (i) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const toY = (v) => h - pad - ((v - min) / range) * (h - 2 * pad);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ');
  const areaD = pathD + ` L${toX(points.length - 1).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#areaGrad)" />
      <motion.path d={pathD} fill="none" stroke="#00f0ff" strokeWidth="2"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        style={{ filter: 'drop-shadow(0 0 4px #00f0ff)' }} />
      <circle cx={toX(points.length - 1)} cy={toY(points[points.length - 1])} r="4" fill="#00f0ff" style={{ filter: 'drop-shadow(0 0 6px #00f0ff)' }} />
    </svg>
  );
}

const TABS = ['INTELLIGENCE', 'PRICE ACTION', 'FLOW ANALYSIS', 'NEWS'];

export default function MarketDossier() {
  const { slug } = useParams();
  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('INTELLIGENCE');

  useEffect(() => {
    fetch(`/api/scan?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(data => { setMarket((data.scan || [])[0] || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
        className="text-[#00f0ff] text-sm tracking-widest font-mono" style={{ textShadow: '0 0 20px #00f0ff' }}>
        ◈ DECRYPTING DOSSIER...
      </motion.div>
    </div>
  );

  if (!market) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="text-white/30 text-sm font-mono">SIGNAL NOT FOUND</div>
      <Link href="/scanner" className="text-[#00f0ff] text-xs hover:underline font-mono">← Back to Scanner</Link>
    </div>
  );

  const m = market;
  const score = m.threat_score || 0;
  const yesPrice = m.currentPrices?.Yes;
  const noPrice = m.currentPrices?.No;
  const weights = m.conviction_weights || {};

  return (
    <div className="min-h-screen">
      <main className="max-w-5xl mx-auto px-4 md:px-8 pb-16">
        {/* DOSSIER HEADER */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <ThreatBadge level={m.threat_level || 'LOW'} size="md" />
            <span className="text-[9px] text-white/20 font-mono tracking-wider">MARKET DOSSIER</span>
          </div>

          <h1 className="text-xl md:text-3xl font-black text-white/90 leading-snug mb-5">{m.question}</h1>

          {/* Price Display */}
          <div className="flex items-end gap-6 mb-5">
            {yesPrice != null && (
              <div>
                <div className="text-[9px] text-white/30 font-mono tracking-wider mb-1">YES</div>
                <div className="text-4xl font-black text-[#00ff88]" style={{ textShadow: '0 0 20px rgba(0,255,136,0.3)' }}>
                  {(yesPrice * 100).toFixed(0)}<span className="text-lg text-[#00ff88]/60">¢</span>
                </div>
              </div>
            )}
            {noPrice != null && (
              <div>
                <div className="text-[9px] text-white/30 font-mono tracking-wider mb-1">NO</div>
                <div className="text-2xl font-bold text-[#ff3366]/70">
                  {(noPrice * 100).toFixed(0)}<span className="text-sm text-[#ff3366]/40">¢</span>
                </div>
              </div>
            )}
          </div>

          {/* Stats Row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] text-white/40 font-mono mb-4">
            <span>VOL: <strong className="text-white/60">${((m.volumeTotal || m.total_volume_usd || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
            <span>WALLETS: <strong className="text-white/60">{(m.total_wallets || 0).toLocaleString()}</strong></span>
            <span>TRADES: <strong className="text-white/60">{(m.total_trades || 0).toLocaleString()}</strong></span>
            {m.endDate && <span>ENDS: <strong className="text-white/60">{new Date(m.endDate).toLocaleDateString()}</strong></span>}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <a href={`https://polymarket.com/event/${slug}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[9px] tracking-widest text-white/30 hover:text-white/50 font-mono transition-colors border border-white/10 rounded px-3 py-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
              POLYMARKET
            </a>
            <ShareButton title={m.question} />
          </div>
        </motion.div>

        {/* TAB NAVIGATION */}
        <div className="flex gap-0 border-b border-white/5 mb-8 overflow-x-auto scrollbar-thin">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-3 text-[10px] tracking-[0.15em] font-mono transition-colors whitespace-nowrap ${activeTab === tab ? 'text-[#00f0ff]' : 'text-white/30 hover:text-white/50'}`}>
              {tab}
              {activeTab === tab && (
                <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00f0ff]"
                  style={{ boxShadow: '0 0 10px #00f0ff, 0 0 20px #00f0ff40' }} />
              )}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>

            {activeTab === 'INTELLIGENCE' && (
              <div className="space-y-8">
                {/* Threat Assessment */}
                <div className="holo-card rounded-2xl p-8">
                  <h3 className="text-[9px] text-white/30 tracking-[0.2em] font-mono mb-6">◈ THREAT ASSESSMENT</h3>
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <ScoreGauge score={score} size={180} />
                    <div className="flex-1">
                      <div className="text-lg font-black mb-3" style={{ color: getThreatColor(score) }}>
                        {m.threat_level || 'UNKNOWN'} THREAT
                      </div>
                      <p className="text-sm text-white/50 leading-relaxed font-mono">{generateAssessment(m)}</p>
                    </div>
                  </div>
                </div>

                {/* Signal Breakdown */}
                <div className="holo-card rounded-xl p-6">
                  <h3 className="text-[9px] text-white/30 tracking-[0.2em] font-mono mb-6">◈ SIGNAL BREAKDOWN</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <BreakdownBar label="Fresh Wallet Excess" value={((m.fresh_wallet_excess || 0) * 100).toFixed(1)} color="#ff3366" detail="Ratio of new wallets above market baseline" />
                    <BreakdownBar label="Large Position Ratio" value={((m.large_position_ratio || 0) * 100).toFixed(1)} color="#f0a000" detail="Concentration of outsized positions" />
                    <BreakdownBar label="Flow Imbalance" value={((m.flow_imbalance || 0) * 100).toFixed(1)} color="#ff00f0" detail="Asymmetry between minority and majority flow" />
                    <BreakdownBar label="Volume vs Liquidity" value={((m.volume_vs_liquidity || 0) * 100).toFixed(1)} color="#00f0ff" detail="Trading volume relative to available liquidity" />
                    <BreakdownBar label="Timing Cluster Score" value={((m.timing_cluster_score || 0) * 100).toFixed(1)} color="#f0a000" detail="Temporal clustering of coordinated trades" />
                  </div>
                </div>

                {/* Conviction Weights */}
                {Object.keys(weights).length > 0 && (
                  <div className="holo-card rounded-xl p-6">
                    <h3 className="text-[9px] text-white/30 tracking-[0.2em] font-mono mb-6">◈ CONVICTION WEIGHTS</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(weights).map(([key, val]) => (
                        <div key={key} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 text-center">
                          <div className="text-2xl font-black text-[#00f0ff] mb-1" style={{ textShadow: '0 0 10px rgba(0,240,255,0.3)' }}>
                            {typeof val === 'number' ? val.toFixed(2) : val}
                          </div>
                          <div className="text-[8px] text-white/30 tracking-wider font-mono uppercase">{key.replace(/_/g, ' ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'PRICE ACTION' && (
              <div className="space-y-8">
                <div className="holo-card rounded-2xl p-8">
                  <h3 className="text-[9px] text-white/30 tracking-[0.2em] font-mono mb-6">◈ CONSENSUS TRACKER</h3>
                  <div className="mb-6">
                    <MockPriceChart currentYes={yesPrice || 0.5} />
                  </div>
                  <div className="text-[8px] text-white/20 font-mono text-center">Simulated price trajectory • Live historical data coming soon</div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'YES PRICE', value: yesPrice != null ? `${(yesPrice * 100).toFixed(0)}¢` : '—', color: '#00ff88' },
                    { label: 'NO PRICE', value: noPrice != null ? `${(noPrice * 100).toFixed(0)}¢` : '—', color: '#ff3366' },
                    { label: 'VOLUME', value: `$${((m.volumeTotal || m.total_volume_usd || 0) / 1000).toFixed(1)}k`, color: '#00f0ff' },
                    { label: 'LIQUIDITY', value: `$${((m.liquidity || 0) / 1000).toFixed(1)}k`, color: '#f0a000' },
                  ].map(s => (
                    <div key={s.label} className="holo-card rounded-xl p-4 text-center">
                      <div className="text-[8px] text-white/30 tracking-wider font-mono mb-2">{s.label}</div>
                      <div className="text-2xl font-black" style={{ color: s.color, textShadow: `0 0 15px ${s.color}30` }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'FLOW ANALYSIS' && (
              <ProGate feature="Flow Analysis">
                <div className="space-y-8">
                  <div className="holo-card rounded-2xl p-8">
                    <h3 className="text-[9px] text-white/30 tracking-[0.2em] font-mono mb-6">◈ FLOW DIRECTION</h3>
                    <div className="mb-6">
                      <div className="flex justify-between text-[10px] text-white/40 font-mono mb-2">
                        <span>{m.minority_outcome || 'Minority'}</span>
                        <span>{m.majority_outcome || 'Majority'}</span>
                      </div>
                      {(() => {
                        const min = m.minority_side_flow_usd || 0;
                        const maj = m.majority_side_flow_usd || 0;
                        const total = min + maj || 1;
                        return (
                          <>
                            <div className="flex h-6 rounded-full overflow-hidden bg-white/5">
                              <div className="h-full bg-[#ff3366]" style={{ width: `${(min / total) * 100}%`, boxShadow: '0 0 10px rgba(255,51,102,0.3)' }} />
                              <div className="h-full bg-[#00ff88]" style={{ width: `${(maj / total) * 100}%`, boxShadow: '0 0 10px rgba(0,255,136,0.3)' }} />
                            </div>
                            <div className="flex justify-between text-[10px] font-mono mt-2">
                              <span className="text-[#ff3366]">${(min / 1000).toFixed(1)}k</span>
                              <span className="text-white/30">Direction: {m.flow_direction_v2 || 'N/A'}</span>
                              <span className="text-[#00ff88]">${(maj / 1000).toFixed(1)}k</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="holo-card rounded-xl p-6">
                    <h3 className="text-[9px] text-white/30 tracking-[0.2em] font-mono mb-6">◈ TRADER COMPOSITION</h3>
                    {(() => {
                      const fresh = m.fresh_wallets || 0;
                      const large = m.large_positions || 0;
                      const total = m.total_wallets || 1;
                      const veterans = Math.max(0, total - fresh - large);
                      return [
                        { label: 'Fresh Wallets', value: fresh, color: '#ff3366' },
                        { label: 'Large Positions', value: large, color: '#f0a000' },
                        { label: 'Veterans', value: veterans, color: '#00ff88' },
                      ].map(s => (
                        <div key={s.label} className="mb-4">
                          <div className="flex justify-between text-[10px] font-mono mb-1">
                            <span className="text-white/40">{s.label}</span>
                            <span style={{ color: s.color }}>{s.value} ({((s.value / total) * 100).toFixed(0)}%)</span>
                          </div>
                          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ backgroundColor: s.color, width: `${(s.value / total) * 100}%`, boxShadow: `0 0 6px ${s.color}40` }} />
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  <div className="holo-card rounded-xl p-6">
                    <h3 className="text-[9px] text-white/30 tracking-[0.2em] font-mono mb-4">◈ FLOW IMBALANCE</h3>
                    <div className="text-center">
                      <div className="text-5xl font-black text-[#ff00f0]" style={{ textShadow: '0 0 20px rgba(255,0,240,0.3)' }}>
                        {((m.flow_imbalance || 0) * 100).toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-white/30 font-mono mt-2">FLOW ASYMMETRY INDEX</div>
                    </div>
                  </div>
                </div>
              </ProGate>
            )}

            {activeTab === 'NEWS' && (
              <div className="holo-card rounded-2xl p-12 text-center">
                <div className="text-3xl mb-4 opacity-30">📡</div>
                <div className="text-sm text-white/40 font-mono mb-2">Related intelligence coming soon</div>
                <div className="text-[10px] text-white/20 font-mono">Our newsroom is tracking this market. Check back for deep-dive analysis.</div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Related Markets */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="mt-16 pt-8 border-t border-white/5 text-center">
          <div className="text-[9px] text-white/20 tracking-[0.2em] font-mono mb-3">MORE FROM THE SCANNER</div>
          <Link href="/scanner" className="inline-flex items-center gap-2 text-[#00f0ff] text-sm font-mono hover:underline transition-colors">
            ← View All Markets
          </Link>
        </motion.div>
      </main>
    </div>
  );
}
