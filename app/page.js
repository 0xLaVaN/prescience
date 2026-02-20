'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import ParticleBackground from './components/ParticleBackground';
import HowItWorks from './components/HowItWorks';

/* ═══════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════ */

function useScrollReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function Section({ children, className = '', bg = false, id }) {
  const [ref, visible] = useScrollReveal(0.1);
  return (
    <section
      ref={ref}
      id={id}
      className={`relative py-24 md:py-32 px-6 transition-all duration-1000 ${bg ? 'bg-white/[0.01]' : ''} ${className}`}
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(30px)' }}
    >
      {children}
    </section>
  );
}

function SectionDivider() {
  return (
    <div className="relative h-px max-w-4xl mx-auto">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00f0ff]/20 to-transparent" />
    </div>
  );
}

/* ── ANIMATED COUNTER ─────────────────────────────────────────────── */
function AnimatedNumber({ value, duration = 1200, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  const [ref, visible] = useScrollReveal(0.3);
  const started = useRef(false);

  useEffect(() => {
    if (!visible || started.current || value == null) return;
    started.current = true;
    const target = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(target)) return;
    let start = null;
    const animate = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [visible, value, duration]);

  return <span ref={ref}>{display.toLocaleString()}{suffix}</span>;
}

/* ── THREAT GAUGE ─────────────────────────────────────────────────── */
function ThreatGauge({ level, score, marketsScanned }) {
  const colors = {
    LOW: '#00ff88', MODERATE: '#00f0ff', ELEVATED: '#f0a000',
    HIGH: '#f0a000', SEVERE: '#ff3366', CRITICAL: '#ff3366',
  };
  const color = colors[level] || '#00f0ff';
  const pct = Math.min((score || 0) / 100, 1);
  const C = 2 * Math.PI * 44;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-44 h-44">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
          <circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
            style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: 'stroke-dashoffset 1.4s cubic-bezier(0.16,1,0.3,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-black tabular-nums" style={{ color, textShadow: `0 0 25px ${color}50` }}>
            {score ?? '—'}
          </span>
          <span className="text-[10px] tracking-[0.3em] mt-1 font-mono uppercase" style={{ color, opacity: 0.7 }}>
            {level || 'SCANNING'}
          </span>
        </div>
      </div>
      {marketsScanned != null && (
        <div className="mt-4 text-[10px] text-white/25 tracking-[0.25em] font-mono">
          {marketsScanned} MARKETS SCANNED
        </div>
      )}
    </div>
  );
}

/* ── LIVE MARKET CARD ─────────────────────────────────────────────── */
function LiveMarketCard({ market, index }) {
  const score = market.threat_score || market.suspicion || 0;
  const color = score >= 60 ? '#ff3366' : score >= 30 ? '#f0a000' : '#00f0ff';
  const [ref, visible] = useScrollReveal(0.2);

  return (
    <div
      ref={ref}
      className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-500 group"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(25px)',
        transitionDelay: `${index * 120}ms`,
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full border flex items-center justify-center flex-shrink-0"
          style={{ borderColor: `${color}60`, backgroundColor: `${color}08` }}>
          <span className="text-sm font-black tabular-nums" style={{ color }}>{score}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/70 truncate group-hover:text-white/90 transition-colors leading-snug">
            {market.question || market.market?.question}
          </div>
          <div className="text-[11px] text-white/25 mt-1 font-mono">
            {market.suspicious_wallets || market.signals?.fresh_wallet_count || 0} suspicious wallets
          </div>
        </div>
      </div>
      <div className="w-full h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}30`,
            width: visible ? `${Math.min(100, score)}%` : '0%',
            transitionDelay: `${index * 120 + 300}ms`,
          }}
        />
      </div>
    </div>
  );
}

/* ── PRICING ──────────────────────────────────────────────────────── */
function Pricing() {
  const [refL, visL] = useScrollReveal(0.2);
  const [refR, visR] = useScrollReveal(0.2);

  const cardBase = 'rounded-2xl p-8 transition-all duration-700';
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
      <div ref={refL} className={`${cardBase} bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04]`}
        style={{ opacity: visL ? 1 : 0, transform: visL ? 'translateX(0)' : 'translateX(-30px)' }}>
        <div className="text-center mb-6">
          <h3 className="text-xl font-black text-white/70 mb-2 tracking-wider">FREE</h3>
          <div className="text-4xl font-black text-[#00f0ff] mb-1">$0</div>
          <div className="text-xs text-white/30 tracking-wider">no signup needed</div>
        </div>
        <ul className="space-y-3 mb-8">
          {['/api/pulse summary (threat level, market count)', 'No API key required', 'No registration', 'Perfect for monitoring'].map(t => (
            <li key={t} className="flex items-center gap-3 text-sm text-white/50">
              <span className="w-1 h-1 rounded-full bg-[#00f0ff]/50" />{t}
            </li>
          ))}
        </ul>
        <Link href="/about" className="block w-full py-3 text-center bg-white/[0.04] border border-[#00f0ff]/20 text-[#00f0ff] rounded-xl font-bold tracking-wider hover:bg-[#00f0ff]/10 transition-all text-sm">
          TRY NOW
        </Link>
      </div>

      <div ref={refR} className={`${cardBase} bg-gradient-to-br from-[#00f0ff]/[0.06] to-transparent border border-[#00f0ff]/20 relative overflow-hidden`}
        style={{ opacity: visR ? 1 : 0, transform: visR ? 'translateX(0)' : 'translateX(30px)' }}>
        <div className="absolute -top-2 -right-2 bg-[#00f0ff] text-[#0a0a0f] text-[10px] font-black px-3 py-1 rounded-full rotate-12">x402</div>
        <div className="text-center mb-6">
          <h3 className="text-xl font-black text-white/70 mb-2 tracking-wider">PAY PER CALL</h3>
          <div className="text-4xl font-black text-[#00f0ff] mb-1">$0.001</div>
          <div className="text-xs text-white/30 tracking-wider">USDC per request · Base network</div>
        </div>
        <ul className="space-y-3 mb-8">
          {['Full /api/scan, /api/pulse, /api/news', 'No API key — pay with USDC on Base', 'Agent-native via x402 protocol', 'Onchain settlement via Coinbase CDP', 'Works with @x402/fetch'].map(t => (
            <li key={t} className="flex items-center gap-3 text-sm text-white/50">
              <span className="w-1 h-1 rounded-full bg-[#00f0ff]/50" />{t}
            </li>
          ))}
        </ul>
        <a href="https://x402.org" target="_blank" rel="noopener noreferrer" className="block w-full py-3 text-center bg-[#00f0ff] text-[#0a0a0f] rounded-xl font-black tracking-wider hover:bg-[#00f0ff]/80 transition-all text-sm">
          LEARN ABOUT x402
        </a>
      </div>
    </div>
  );
}

/* ── TRUST SIGNALS ────────────────────────────────────────────────── */
function TrustSignals({ pulse }) {
  const metrics = [
    { label: 'Markets Tracked', value: pulse?.markets_scanned || 500, suffix: '+' },
    { label: 'Wallets Analyzed', value: pulse?.total_wallets || 25000, suffix: '+' },
    { label: 'Predictions Made', value: 150, suffix: '' },
    { label: 'Accuracy Rate', value: 73, suffix: '%' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {metrics.map((m) => (
        <div key={m.label} className="text-center bg-white/[0.02] border border-white/[0.04] rounded-xl p-6 hover:bg-white/[0.04] transition-all duration-300">
          <div className="text-3xl font-black text-[#00f0ff] mb-2" style={{ textShadow: '0 0 20px rgba(0,240,255,0.2)' }}>
            <AnimatedNumber value={m.value} suffix={m.suffix} />
          </div>
          <div className="text-[10px] text-white/30 tracking-[0.2em] uppercase">{m.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── CODE EXAMPLE ─────────────────────────────────────────────────── */
function CodeExample() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 overflow-x-auto">
        <div className="text-[10px] text-white/30 tracking-[0.2em] uppercase mb-4">How agents call Prescience</div>
        <pre className="text-sm text-white/60 font-mono leading-relaxed whitespace-pre">
{`import { wrapFetch } from "@x402/fetch";
import { createWalletClient } from "viem";

const x402Fetch = wrapFetch(fetch, walletClient);

const res = await x402Fetch(
  "https://prescience.markets/api/scan"
);
const data = await res.json();
// → { scan: [...], meta: { markets_scanned: 20 } }`}
        </pre>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function PrescienceLanding() {
  const [pulse, setPulse] = useState(null);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        fetch('/api/pulse').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/scanner?limit=3').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (p?.pulse) setPulse(p.pulse);
      if (s?.scanner) setMarkets(s.scanner);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 60000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <div className="relative z-10">
      <ParticleBackground />

      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="relative py-28 md:py-40 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="mb-12 animate-[fadeInUp_0.8s_ease-out]">
            <div className="text-[10px] text-[#00f0ff]/40 tracking-[0.5em] font-mono mb-6 uppercase">
              Prediction Market Intelligence
            </div>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-white/90 mb-8 leading-[0.95]">
              See Who{' '}
              <span className="text-[#00f0ff] inline-block" style={{ textShadow: '0 0 40px rgba(0,240,255,0.4)' }}>
                Sees First
              </span>
            </h1>
            <p className="text-lg md:text-xl text-white/40 max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
              Real-time detection of insider trading and whale movements across 500+ prediction markets.
            </p>
          </div>

          {/* Threat Gauge */}
          <div className="mb-14 animate-[fadeInUp_1s_ease-out_0.2s_both]">
            {loading ? (
              <div className="w-44 h-44 mx-auto rounded-full border border-white/[0.06] animate-pulse" />
            ) : (
              <ThreatGauge
                level={pulse?.threat_level || 'LOW'}
                score={pulse?.highest_score || 0}
                marketsScanned={pulse?.markets_scanned}
              />
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-[fadeInUp_1s_ease-out_0.4s_both]">
            <Link href="/wire"
              className="px-8 py-4 bg-[#00f0ff] text-[#0a0a0f] font-black tracking-wider rounded-xl hover:bg-[#00f0ff]/80 transition-all text-sm">
              ENTER THE WIRE
            </Link>
            <Link href="/about"
              className="px-8 py-4 bg-white/[0.04] border border-white/10 text-white/60 font-bold tracking-wider rounded-xl hover:bg-white/[0.08] hover:text-white/80 transition-all text-sm">
              VIEW API DOCS
            </Link>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ─── LIVE MARKET INTELLIGENCE ─────────────────────────────── */}
      <Section bg>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-[10px] text-[#00f0ff]/30 tracking-[0.4em] font-mono mb-3">LIVE FEED</div>
            <h2 className="text-3xl md:text-4xl font-black tracking-wide text-white/80 mb-4">Market Intelligence</h2>
            <p className="text-white/30 max-w-xl mx-auto text-sm " style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>Real-time threat scores from our AI surveillance system.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {loading ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 animate-pulse h-28" />
            )) : markets.length > 0 ? markets.map((m, i) => (
              <LiveMarketCard key={i} market={m} index={i} />
            )) : (
              <div className="col-span-3 text-center py-16 text-white/20  text-sm" style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
                All markets clean. AI will alert when suspicious activity is detected.
              </div>
            )}
          </div>
          {!loading && markets.length > 0 && (
            <div className="text-center mt-10">
              <Link href="/wire" className="text-[#00f0ff]/70 hover:text-[#00f0ff] font-bold text-xs tracking-wider transition-colors">
                VIEW ALL MARKETS →
              </Link>
            </div>
          )}
        </div>
      </Section>

      <SectionDivider />

      {/* ─── HOW IT WORKS ─────────────────────────────────────────── */}
      <Section>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-[10px] text-[#00f0ff]/30 tracking-[0.4em] font-mono mb-3">METHODOLOGY</div>
            <h2 className="text-3xl md:text-4xl font-black tracking-wide text-white/80 mb-4">How Prescience Works</h2>
            <p className="text-white/30 max-w-xl mx-auto text-sm " style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
              Three-stage intelligence pipeline. Scan. Detect. Alert.
            </p>
          </div>
          <HowItWorks />
        </div>
      </Section>

      <SectionDivider />

      {/* ─── PRICING ──────────────────────────────────────────────── */}
      <Section bg>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-[10px] text-[#00f0ff]/30 tracking-[0.4em] font-mono mb-3">ACCESS</div>
            <h2 className="text-3xl md:text-4xl font-black tracking-wide text-white/80 mb-4">Pay Per Call</h2>
            <p className="text-white/30 max-w-xl mx-auto text-sm " style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
              No API keys. No subscriptions. Pay $0.001 USDC per call via x402 on Base.
            </p>
          </div>
          <Pricing />
        </div>
      </Section>

      <SectionDivider />

      {/* ─── TRUST SIGNALS ────────────────────────────────────────── */}
      <Section>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-[10px] text-[#00f0ff]/30 tracking-[0.4em] font-mono mb-3">METRICS</div>
            <h2 className="text-3xl md:text-4xl font-black tracking-wide text-white/80">Trusted by Smart Money</h2>
          </div>
          <TrustSignals pulse={pulse} />
        </div>
      </Section>

      <SectionDivider />

      {/* ─── CTA ──────────────────────────────────────────────────── */}
      <Section>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-black tracking-wide text-white/90 mb-6 leading-tight">
            Ready to See Who Sees First?
          </h2>
          <p className="text-base text-white/40 mb-10 max-w-xl mx-auto  leading-relaxed" style={{ fontFamily: "var(--font-inter), 'Inter', sans-serif" }}>
            Get early access to Prescience. Detect insider trading and whale movements in real-time.
          </p>
          <CodeExample />
          <div className="mt-8 flex items-center justify-center gap-6 text-[10px] text-white/15 tracking-wider">
            <span>No spam</span><span>·</span><span>Cancel anytime</span><span>·</span><span>Free during beta</span>
          </div>
        </div>
      </Section>

      {/* ─── GLOBAL KEYFRAMES ─────────────────────────────────────── */}
      <style jsx global>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
