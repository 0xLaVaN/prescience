'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import ParticleBackground from './components/ParticleBackground';

// ─── ANIMATED COUNTER ──────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1200, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value == null) return;
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
  }, [value, duration]);
  return <>{display.toLocaleString()}{suffix}</>;
}

// ─── THREAT GAUGE (clean radial) ───────────────────────────────────
function ThreatGauge({ level, score, marketsScanned }) {
  const colors = {
    LOW: '#00ff88',
    MODERATE: '#00f0ff',
    ELEVATED: '#f0a000',
    HIGH: '#f0a000',
    SEVERE: '#ff3366',
    CRITICAL: '#ff3366',
  };
  const color = colors[level] || '#00f0ff';
  const pct = Math.min(score / 100, 1);
  const circumference = 2 * Math.PI * 44;
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {/* Track */}
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          {/* Progress */}
          <circle
            cx="50" cy="50" r="44"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset 1.2s ease-out' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-black" style={{ color, textShadow: `0 0 20px ${color}60` }}>
            {score ?? '—'}
          </span>
          <span className="text-[10px] tracking-[0.25em] mt-1 font-mono" style={{ color, opacity: 0.8 }}>
            {level || 'SCANNING'}
          </span>
        </div>
      </div>
      {marketsScanned != null && (
        <div className="mt-3 text-[10px] text-white/30 tracking-widest font-mono">
          {marketsScanned} MARKETS SCANNED
        </div>
      )}
    </div>
  );
}

// ─── LIVE MARKET CARD ──────────────────────────────────────────────
function LiveMarketCard({ market, index }) {
  const score = market.threat_score || market.suspicion || 0;
  const color = score >= 60 ? '#ff3366' : score >= 30 ? '#f0a000' : '#00f0ff';
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:bg-white/[0.06] transition-all group"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-full border-2 flex items-center justify-center flex-shrink-0"
          style={{ borderColor: color, backgroundColor: `${color}10` }}>
          <span className="text-base font-black" style={{ color }}>{score}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/80 truncate group-hover:text-white transition-colors">
            {market.question || market.market?.question}
          </div>
          <div className="text-xs text-white/30 mt-1">
            {market.suspicious_wallets || market.signals?.fresh_wallet_count || 0} suspicious wallets
          </div>
        </div>
      </div>
      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, score)}%` }}
          transition={{ duration: 0.8, delay: index * 0.1 }}
        />
      </div>
    </motion.div>
  );
}

// ─── HOW IT WORKS ──────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { icon: '🔍', title: 'SCAN', desc: 'Real-time analysis of 500+ prediction markets across Polymarket and Kalshi' },
    { icon: '🎯', title: 'DETECT', desc: 'AI algorithms identify suspicious wallet behavior, whale movements, and insider patterns' },
    { icon: '⚡', title: 'ALERT', desc: 'Instant notifications when anomalous activity suggests non-public information' },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {steps.map((s, i) => (
        <motion.div key={s.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }} viewport={{ once: true }} className="text-center">
          <div className="text-4xl mb-4">{s.icon}</div>
          <h3 className="text-base font-black tracking-[0.15em] text-[#00f0ff] mb-2">{s.title}</h3>
          <p className="text-sm text-white/50 leading-relaxed">{s.desc}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── PRICING ───────────────────────────────────────────────────────
function Pricing() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
      {/* Free */}
      <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
        className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 hover:bg-white/[0.05] transition-all">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-black text-white/80 mb-2">FREE</h3>
          <div className="text-4xl font-black text-[#00f0ff] mb-1">$0</div>
          <div className="text-sm text-white/40">forever</div>
        </div>
        <ul className="space-y-3 mb-8">
          {['10 API calls per day', '/pulse and /scan endpoints', 'Real-time threat scores', 'Community support'].map(t => (
            <li key={t} className="flex items-center gap-3 text-sm text-white/60">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]" />{t}
            </li>
          ))}
        </ul>
        <Link href="/about" className="block w-full py-3 text-center bg-white/5 border border-[#00f0ff]/30 text-[#00f0ff] rounded-xl font-bold tracking-wider hover:bg-[#00f0ff]/10 transition-all">
          GET STARTED
        </Link>
      </motion.div>
      {/* Pro */}
      <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
        className="bg-gradient-to-br from-[#00f0ff]/10 to-transparent border border-[#00f0ff]/30 rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute -top-2 -right-2 bg-[#00f0ff] text-[#0a0a0f] text-xs font-black px-3 py-1 rounded-full transform rotate-12">PRO</div>
        <div className="text-center mb-6">
          <h3 className="text-2xl font-black text-white/80 mb-2">PRO</h3>
          <div className="text-4xl font-black text-[#00f0ff] mb-1">0.005 ETH</div>
          <div className="text-sm text-white/40">per month</div>
        </div>
        <ul className="space-y-3 mb-8">
          {['Unlimited API calls', 'Full API access (signals, alerts, scanner)', 'Real-time webhook alerts', 'Priority support', 'Historical backtesting data'].map(t => (
            <li key={t} className="flex items-center gap-3 text-sm text-white/60">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]" />{t}
            </li>
          ))}
        </ul>
        <Link href="/pro" className="block w-full py-3 text-center bg-[#00f0ff] text-[#0a0a0f] rounded-xl font-black tracking-wider hover:bg-[#00f0ff]/80 transition-all">
          UPGRADE TO PRO
        </Link>
      </motion.div>
    </div>
  );
}

// ─── TRUST SIGNALS ─────────────────────────────────────────────────
function TrustSignals({ pulse }) {
  const metrics = [
    { label: 'Markets Tracked', value: pulse?.markets_scanned || 500, suffix: '+' },
    { label: 'Wallets Analyzed', value: pulse?.total_wallets || 25000, suffix: '+' },
    { label: 'Predictions Made', value: 150, suffix: '' },
    { label: 'Accuracy Rate', value: 73, suffix: '%' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {metrics.map((m, i) => (
        <motion.div key={m.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}
          className="text-center bg-white/[0.02] border border-white/5 rounded-xl p-6 hover:bg-white/[0.04] transition-all">
          <div className="text-3xl font-black text-[#00f0ff] mb-2" style={{ textShadow: '0 0 20px rgba(0,240,255,0.3)' }}>
            <AnimatedNumber value={m.value} suffix={m.suffix} />
          </div>
          <div className="text-[10px] text-white/40 tracking-wider uppercase">{m.label}</div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── EMAIL SIGNUP ──────────────────────────────────────────────────
function EmailSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || status === 'loading') return;
    setStatus('loading');
    try {
      const r = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), source: 'landing-v2' }) });
      setStatus(r.ok ? 'success' : 'error');
      if (r.ok) setEmail('');
    } catch { setStatus('error'); }
    setTimeout(() => setStatus('idle'), 3000);
  };
  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" required disabled={status === 'loading'}
        className="flex-1 px-4 py-3 bg-white/[0.05] border border-white/20 rounded-xl text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#00f0ff]/50 transition-all disabled:opacity-50" />
      <button type="submit" disabled={status === 'loading'}
        className="px-8 py-3 bg-[#00f0ff] text-[#0a0a0f] font-black tracking-wider rounded-xl hover:bg-[#00f0ff]/80 transition-all disabled:opacity-50 whitespace-nowrap">
        {status === 'loading' ? 'SENDING...' : status === 'success' ? '✓ SENT' : status === 'error' ? 'ERROR' : 'GET ACCESS'}
      </button>
    </form>
  );
}

// ─── MAIN LANDING PAGE ─────────────────────────────────────────────
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

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 60000); return () => clearInterval(t); }, [fetchData]);

  return (
    <div className="relative z-10">
      <ParticleBackground />

      {/* Hero */}
      <section className="relative py-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
            <h2 className="text-5xl md:text-7xl font-black tracking-tight text-white/90 mb-6 leading-tight">
              See Who{' '}
              <span className="text-[#00f0ff]" style={{ textShadow: '0 0 30px rgba(0,240,255,0.5)' }}>Sees First</span>
            </h2>
            <p className="text-xl text-white/50 max-w-3xl mx-auto leading-relaxed">
              Real-time detection of insider trading and whale movements in prediction markets.
              AI-powered surveillance across 500+ markets on Polymarket and Kalshi.
            </p>
          </motion.div>

          {/* Threat Gauge */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-12">
            {loading ? (
              <div className="w-40 h-40 mx-auto rounded-full border-2 border-white/10 animate-pulse" />
            ) : (
              <ThreatGauge
                level={pulse?.threat_level || 'LOW'}
                score={pulse?.highest_score || 0}
                marketsScanned={pulse?.markets_scanned}
              />
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/wire" className="px-8 py-4 bg-[#00f0ff] text-[#0a0a0f] font-black tracking-wider rounded-xl hover:bg-[#00f0ff]/80 transition-all">
              ENTER THE WIRE
            </Link>
            <Link href="/about" className="px-8 py-4 bg-white/5 border border-white/20 text-white/80 font-bold tracking-wider rounded-xl hover:bg-white/10 transition-all">
              VIEW API DOCS
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Live Demo */}
      <section className="py-20 px-6 bg-white/[0.01]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-black tracking-wide text-white/80 mb-4">Live Market Intelligence</h3>
            <p className="text-white/40 max-w-2xl mx-auto">Real-time threat scores from our AI surveillance system.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {loading ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-4 animate-pulse h-24" />
            )) : markets.length > 0 ? markets.map((m, i) => (
              <LiveMarketCard key={i} market={m} index={i} />
            )) : (
              <div className="col-span-3 text-center py-12 text-white/30">All markets clean. AI will alert when suspicious activity is detected.</div>
            )}
          </div>
          {!loading && markets.length > 0 && (
            <div className="text-center mt-8">
              <Link href="/wire" className="text-[#00f0ff] hover:text-[#00f0ff]/80 font-bold text-sm transition-colors">VIEW ALL MARKETS →</Link>
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-black tracking-wide text-white/80 mb-4">How Prescience Works</h3>
            <p className="text-white/40 max-w-2xl mx-auto">AI surveillance monitoring every trade, every wallet, every pattern.</p>
          </div>
          <HowItWorks />
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6 bg-white/[0.01]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-black tracking-wide text-white/80 mb-4">Simple Pricing</h3>
            <p className="text-white/40 max-w-2xl mx-auto">Start free, upgrade when you need unlimited access. Pay with ETH, no middlemen.</p>
          </div>
          <Pricing />
        </div>
      </section>

      {/* Trust */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-black tracking-wide text-white/80 mb-4">Trusted by Smart Money</h3>
          </div>
          <TrustSignals pulse={pulse} />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-gradient-to-br from-[#00f0ff]/5 to-transparent border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h3 className="text-4xl font-black tracking-wide text-white/90 mb-6">Ready to See Who Sees First?</h3>
            <p className="text-lg text-white/50 mb-8 max-w-2xl mx-auto">Get early access to Prescience. Detect insider trading and whale movements in real-time.</p>
            <EmailSignup />
            <div className="mt-8 flex items-center justify-center gap-6 text-xs text-white/20">
              <span>No spam</span><span>•</span><span>Cancel anytime</span><span>•</span><span>Free during beta</span>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
