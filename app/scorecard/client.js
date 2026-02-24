'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ParticleBackground from '../components/ParticleBackground';

/* ═══════════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════════ */
const globalStyles = `
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulseGlow {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .animate-fade-in { animation: fadeSlideUp 0.6s ease-out forwards; }
  .stat-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 1.5rem;
    text-align: center;
    transition: border-color 0.3s;
  }
  .stat-card:hover { border-color: rgba(0,240,255,0.2); }
  .call-row {
    display: grid;
    grid-template-columns: 1fr 100px 100px 80px 100px;
    gap: 12px;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    transition: background 0.2s;
    font-size: 14px;
  }
  .call-row:hover { background: rgba(0,240,255,0.03); }
  @media (max-width: 768px) {
    .call-row {
      grid-template-columns: 1fr 70px 70px;
      font-size: 13px;
    }
    .call-row .hide-mobile { display: none; }
  }
  .shimmer-bar {
    height: 16px;
    border-radius: 4px;
    background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }
`;

/* ── ANIMATED NUMBER ───────────────────────────────────────────────── */
function AnimNum({ value, suffix = '', prefix = '' }) {
  const [display, setDisplay] = useState(0);
  const numVal = parseFloat(value) || 0;

  useEffect(() => {
    if (!numVal) { setDisplay(0); return; }
    const duration = 800;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(numVal * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [numVal]);

  return <span>{prefix}{numVal % 1 === 0 ? Math.round(display) : display.toFixed(1)}{suffix}</span>;
}

/* ── STATUS BADGE ──────────────────────────────────────────────────── */
function StatusBadge({ status, outcome, correct }) {
  if (status === 'open') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono"
        style={{ background: 'rgba(0,240,255,0.1)', color: '#00f0ff', border: '1px solid rgba(0,240,255,0.2)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00f0ff', animation: 'pulseGlow 2s infinite' }} />
        OPEN
      </span>
    );
  }
  if (correct === true) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono"
        style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.2)' }}>
        ✓ {outcome}
      </span>
    );
  }
  if (correct === false) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono"
        style={{ background: 'rgba(255,51,102,0.1)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.2)' }}>
        ✗ {outcome}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono"
      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
      {outcome || 'PENDING'}
    </span>
  );
}

/* ── THREAT SCORE DOT ─────────────────────────────────────────────── */
function ScoreDot({ score }) {
  const s = parseInt(score) || 0;
  const color = s >= 30 ? '#ff3366' : s >= 15 ? '#f0a000' : '#00ff88';
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-sm">
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
      {s}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function ScorecardClient({ initialData }) {
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/scorecard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const stats = data?.stats;
  const calls = data?.calls || [];

  return (
    <>
      <style jsx global>{globalStyles}</style>
      <div className="min-h-screen bg-[#0a0a0f] text-white relative">
        <ParticleBackground />

        {/* Nav spacer */}
        <div className="h-14" />

        {/* Header */}
        <header className="relative z-10 pt-16 pb-12 px-6 text-center">
          <div className="max-w-4xl mx-auto">
            <p className="text-[#00f0ff] font-mono text-sm tracking-[0.3em] mb-3 uppercase"
              style={{ textShadow: '0 0 20px rgba(0,240,255,0.4)' }}>
              Track Record
            </p>
            <h1 className="text-4xl md:text-5xl font-bold mb-4"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              Prescience Scorecard
            </h1>
            <p className="text-white/40 text-lg max-w-2xl mx-auto"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              Every signal we've sent. Every outcome tracked. No cherry-picking.
              Misses shown prominently — because trust is the product.
            </p>
          </div>
        </header>

        {/* Stats Grid */}
        <section className="relative z-10 px-6 pb-12">
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="stat-card">
                  <div className="shimmer-bar w-12 mx-auto mb-3" />
                  <div className="shimmer-bar w-20 mx-auto" />
                </div>
              ))
            ) : (
              <>
                <div className="stat-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
                  <div className="text-3xl font-bold font-mono text-white mb-1">
                    <AnimNum value={stats?.total_calls || 0} />
                  </div>
                  <div className="text-white/40 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Total Signals
                  </div>
                </div>
                <div className="stat-card animate-fade-in" style={{ animationDelay: '0.2s' }}>
                  <div className="text-3xl font-bold font-mono mb-1" style={{ color: stats?.win_rate >= 60 ? '#00ff88' : stats?.win_rate >= 40 ? '#f0a000' : '#ff3366' }}>
                    {stats?.win_rate != null ? <AnimNum value={stats.win_rate} suffix="%" /> : '—'}
                  </div>
                  <div className="text-white/40 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Win Rate
                  </div>
                </div>
                <div className="stat-card animate-fade-in" style={{ animationDelay: '0.3s' }}>
                  <div className="text-3xl font-bold font-mono text-[#00f0ff] mb-1">
                    <AnimNum value={stats?.resolved || 0} />
                  </div>
                  <div className="text-white/40 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Resolved
                  </div>
                </div>
                <div className="stat-card animate-fade-in" style={{ animationDelay: '0.4s' }}>
                  <div className="text-3xl font-bold font-mono mb-1" style={{ color: '#00f0ff' }}>
                    <AnimNum value={stats?.open || 0} />
                  </div>
                  <div className="text-white/40 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Open Calls
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Divider */}
        <div className="relative h-px max-w-5xl mx-auto">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00f0ff]/20 to-transparent" />
        </div>

        {/* Calls Table */}
        <section className="relative z-10 px-6 py-12">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xl font-bold mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
              All Signals
            </h2>

            {/* Header row */}
            <div className="call-row text-white/30 text-xs font-mono uppercase tracking-wider" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div>Market</div>
              <div className="text-center">Score</div>
              <div className="text-center">Entry</div>
              <div className="text-center hide-mobile">Flow</div>
              <div className="text-center">Status</div>
            </div>

            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="call-row">
                  <div className="shimmer-bar w-full" />
                  <div className="shimmer-bar w-12 mx-auto" />
                  <div className="shimmer-bar w-12 mx-auto" />
                  <div className="shimmer-bar w-16 mx-auto hide-mobile" />
                  <div className="shimmer-bar w-16 mx-auto" />
                </div>
              ))
            ) : calls.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-4xl mb-4" style={{ color: '#00f0ff', opacity: 0.3 }}>◎</div>
                <p className="text-white/30 text-lg mb-2">No signals yet</p>
                <p className="text-white/20 text-sm max-w-md mx-auto">
                  Prescience only signals when conviction is high (score ≥ 6/12).
                  Quality over quantity. Check back soon.
                </p>
              </div>
            ) : (
              calls.map((call, i) => (
                <div key={call.slug + i} className="call-row animate-fade-in" style={{ animationDelay: `${0.05 * i}s` }}>
                  <div>
                    <div className="text-white/90 text-sm leading-snug" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {call.question}
                    </div>
                    <div className="text-white/20 text-xs font-mono mt-1">
                      {new Date(call.called_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="text-center">
                    <ScoreDot score={call.signal_score} />
                  </div>
                  <div className="text-center font-mono text-sm text-white/60">
                    {call.entry_price != null ? `${(call.entry_price * 100).toFixed(0)}¢` : '—'}
                  </div>
                  <div className="text-center hide-mobile">
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{
                      background: call.flow_direction === 'MINORITY_HEAVY' ? 'rgba(255,51,102,0.1)' : 'rgba(255,255,255,0.03)',
                      color: call.flow_direction === 'MINORITY_HEAVY' ? '#ff3366' : 'rgba(255,255,255,0.3)',
                    }}>
                      {call.flow_direction === 'MINORITY_HEAVY' ? 'CONTRA' : call.flow_direction === 'MAJORITY_ALIGNED' ? 'ALIGN' : 'MIX'}
                    </span>
                  </div>
                  <div className="text-center">
                    <StatusBadge status={call.status} outcome={call.outcome} correct={call.correct} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Methodology */}
        <section className="relative z-10 px-6 py-16">
          <div className="max-w-3xl mx-auto">
            <div className="relative h-px mb-16">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00f0ff]/20 to-transparent" />
            </div>
            <h2 className="text-xl font-bold mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
              Methodology
            </h2>
            <div className="space-y-4 text-white/40 text-sm leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>
                <strong className="text-white/60">Signal generation:</strong> Prescience scans 500+ prediction markets every 30 minutes.
                Our quality gate scores each signal across 4 dimensions: consensus divergence, data edge,
                time sensitivity, and narrative value. Only signals scoring ≥ 6/12 are published.
              </p>
              <p>
                <strong className="text-white/60">Entry price:</strong> The YES price at the time our signal was sent.
                This is the price you would have entered at if you followed the signal immediately.
              </p>
              <p>
                <strong className="text-white/60">Outcome tracking:</strong> Markets are checked against Polymarket's resolution API.
                When a market resolves, we log the outcome and calculate whether our signal direction was correct.
              </p>
              <p>
                <strong className="text-white/60">No cherry-picking:</strong> Every signal we send is logged automatically.
                Misses are shown as prominently as wins. This page is generated from raw signal logs — no manual editing.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 px-6 pb-24 text-center">
          <Link href="/pro"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg font-mono text-sm tracking-wider transition-all duration-300"
            style={{
              background: 'rgba(0,240,255,0.1)',
              border: '1px solid rgba(0,240,255,0.3)',
              color: '#00f0ff',
            }}
            onMouseEnter={e => { e.target.style.background = 'rgba(0,240,255,0.2)'; e.target.style.boxShadow = '0 0 30px rgba(0,240,255,0.2)'; }}
            onMouseLeave={e => { e.target.style.background = 'rgba(0,240,255,0.1)'; e.target.style.boxShadow = 'none'; }}
          >
            GET PRO ACCESS — $20/mo →
          </Link>
        </section>
      </div>
    </>
  );
}
