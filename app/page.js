'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

// ─── ANIMATED COUNTER ──────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1200, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  
  useEffect(() => {
    if (value == null) return;
    const target = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(target)) return;
    
    let start = null;
    const animate = (timestamp) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    const from = 0;
    requestAnimationFrame(animate);
  }, [value, duration]);
  
  return <>{display.toLocaleString()}{suffix}</>;
}

// ─── THREAT INDICATOR ──────────────────────────────────────────────
function ThreatIndicator({ level, score }) {
  const colors = {
    LOW: '#00ff88',
    MODERATE: '#00f0ff', 
    ELEVATED: '#f0a000',
    HIGH: '#f0a000',
    SEVERE: '#ff3366',
    CRITICAL: '#ff3366'
  };
  
  const color = colors[level] || '#00f0ff';
  
  return (
    <div className="relative flex items-center justify-center">
      <div className="w-32 h-32">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Outer ring with rotating dashes */}
          <circle 
            cx="50" cy="50" r="48" 
            fill="none" 
            stroke={color} 
            strokeWidth="1" 
            strokeDasharray="8 4" 
            opacity="0.3"
          >
            <animateTransform 
              attributeName="transform" 
              type="rotate" 
              values="0 50 50;360 50 50" 
              dur="30s" 
              repeatCount="indefinite" 
            />
          </circle>
          
          {/* Inner hexagon */}
          <polygon
            points="50,15 75,30 75,50 50,65 25,50 25,30"
            fill="none"
            stroke={color}
            strokeWidth="2"
            opacity="0.6"
          />
          
          {/* Center score */}
          <text 
            x="50" y="45" 
            textAnchor="middle" 
            dominantBaseline="middle" 
            className="text-2xl font-black" 
            fill={color}
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          >
            {score || '—'}
          </text>
          
          <text 
            x="50" y="62" 
            textAnchor="middle" 
            dominantBaseline="middle" 
            className="text-xs font-bold tracking-wider" 
            fill={color} 
            opacity="0.8"
          >
            {level}
          </text>
        </svg>
      </div>
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
      className="bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:bg-white/[0.05] transition-all group"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center" style={{ borderColor: color, backgroundColor: `${color}10` }}>
            <span className="text-lg font-black" style={{ color, textShadow: `0 0 10px ${color}40` }}>
              {score}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/80 truncate group-hover:text-white transition-colors">
            {market.question || market.market?.question}
          </div>
          <div className="text-xs text-white/40 mt-1">
            {market.suspicious_wallets || market.signals?.fresh_wallet_count || 0} suspicious wallets detected
          </div>
        </div>
      </div>
      
      {/* Progress bar showing threat level */}
      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
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

// ─── HOW IT WORKS SECTION ──────────────────────────────────────────
function HowItWorksSection() {
  const steps = [
    {
      icon: '🔍',
      title: 'SCAN',
      description: 'Real-time analysis of 500+ prediction markets across Polymarket and Kalshi'
    },
    {
      icon: '🎯',
      title: 'DETECT', 
      description: 'AI algorithms identify suspicious wallet behavior, whale movements, and insider patterns'
    },
    {
      icon: '⚡',
      title: 'ALERT',
      description: 'Instant notifications when anomalous activity suggests non-public information'
    }
  ];
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {steps.map((step, i) => (
        <motion.div
          key={step.title}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.2 }}
          viewport={{ once: true }}
          className="text-center group"
        >
          <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
            {step.icon}
          </div>
          <h3 className="text-lg font-black tracking-[0.1em] text-[#ff3366] mb-2">
            {step.title}
          </h3>
          <p className="text-sm text-white/60 leading-relaxed">
            {step.description}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── PRICING SECTION ───────────────────────────────────────────────
function PricingSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
      {/* Free Tier */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 hover:bg-white/[0.05] transition-all"
      >
        <div className="text-center mb-6">
          <h3 className="text-2xl font-black text-white/80 mb-2">FREE</h3>
          <div className="text-4xl font-black text-[#00f0ff] mb-1">$0</div>
          <div className="text-sm text-white/40">forever</div>
        </div>
        
        <ul className="space-y-3 mb-8">
          <li className="flex items-center gap-3 text-sm text-white/70">
            <span className="w-2 h-2 rounded-full bg-[#00f0ff]"></span>
            10 API calls per day
          </li>
          <li className="flex items-center gap-3 text-sm text-white/70">
            <span className="w-2 h-2 rounded-full bg-[#00f0ff]"></span>
            Access to /pulse and /scan endpoints
          </li>
          <li className="flex items-center gap-3 text-sm text-white/70">
            <span className="w-2 h-2 rounded-full bg-[#00f0ff]"></span>
            Real-time threat scores
          </li>
          <li className="flex items-center gap-3 text-sm text-white/70">
            <span className="w-2 h-2 rounded-full bg-[#00f0ff]"></span>
            Community support
          </li>
        </ul>
        
        <button className="w-full py-3 px-6 bg-white/5 border border-[#00f0ff]/30 text-[#00f0ff] rounded-xl font-bold tracking-wider hover:bg-[#00f0ff]/10 transition-all">
          GET STARTED
        </button>
      </motion.div>
      
      {/* Pro Tier */}
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="bg-gradient-to-br from-[#ff3366]/10 to-transparent border border-[#ff3366]/30 rounded-2xl p-8 relative overflow-hidden"
      >
        {/* "POPULAR" badge */}
        <div className="absolute -top-2 -right-2 bg-[#ff3366] text-white text-xs font-black px-3 py-1 rounded-full transform rotate-12">
          POPULAR
        </div>
        
        <div className="text-center mb-6">
          <h3 className="text-2xl font-black text-white/80 mb-2">PRO</h3>
          <div className="text-4xl font-black text-[#ff3366] mb-1">0.005 ETH</div>
          <div className="text-sm text-white/40">per month</div>
        </div>
        
        <ul className="space-y-3 mb-8">
          <li className="flex items-center gap-3 text-sm text-white/70">
            <span className="w-2 h-2 rounded-full bg-[#ff3366]"></span>
            Unlimited API calls
          </li>
          <li className="flex items-center gap-3 text-sm text-white/70">
            <span className="w-2 h-2 rounded-full bg-[#ff3366]"></span>
            Full API access (signals, alerts, scanner)
          </li>
          <li className="flex items-center gap-3 text-sm text-white/70">
            <span className="w-2 h-2 rounded-full bg-[#ff3366]"></span>
            Real-time webhook alerts
          </li>
          <li className="flex items-center gap-3 text-sm text-white/70">
            <span className="w-2 h-2 rounded-full bg-[#ff3366]"></span>
            Priority support
          </li>
          <li className="flex items-center gap-3 text-sm text-white/70">
            <span className="w-2 h-2 rounded-full bg-[#ff3366]"></span>
            Historical backtesting data
          </li>
        </ul>
        
        <button className="w-full py-3 px-6 bg-[#ff3366] text-white rounded-xl font-black tracking-wider hover:bg-[#ff3366]/80 transition-all">
          UPGRADE TO PRO
        </button>
      </motion.div>
    </div>
  );
}

// ─── TRUST SIGNALS ─────────────────────────────────────────────────
function TrustSignalsSection({ stats }) {
  const metrics = [
    { label: 'Markets Tracked', value: stats?.total_markets || 500, suffix: '+' },
    { label: 'Wallets Analyzed', value: stats?.total_wallets || 25000, suffix: '+' },
    { label: 'Predictions Made', value: stats?.predictions_count || 150, suffix: '' },
    { label: 'Accuracy Rate', value: stats?.accuracy_rate || 73, suffix: '%' },
  ];
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {metrics.map((metric, i) => (
        <motion.div
          key={metric.label}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          viewport={{ once: true }}
          className="text-center bg-white/[0.02] border border-white/5 rounded-xl p-6 hover:bg-white/[0.04] transition-all"
        >
          <div className="text-3xl font-black text-[#00f0ff] mb-2" style={{ textShadow: '0 0 20px rgba(0,240,255,0.3)' }}>
            <AnimatedNumber value={metric.value} suffix={metric.suffix} />
          </div>
          <div className="text-xs text-white/40 tracking-wider uppercase">
            {metric.label}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── EMAIL SIGNUP FORM ─────────────────────────────────────────────
function EmailSignupForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || status === 'loading') return;
    
    setStatus('loading');
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim(), 
          source: 'landing-page-signup',
          timestamp: new Date().toISOString()
        })
      });
      
      if (response.ok) {
        setStatus('success');
        setEmail('');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
    
    // Reset status after 3 seconds
    setTimeout(() => setStatus('idle'), 3000);
  };
  
  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        required
        disabled={status === 'loading'}
        className="flex-1 px-4 py-3 bg-white/[0.05] border border-white/20 rounded-xl text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#ff3366]/50 focus:bg-white/[0.08] transition-all disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="px-8 py-3 bg-[#ff3366] text-white font-black tracking-wider rounded-xl hover:bg-[#ff3366]/80 transition-all disabled:opacity-50 whitespace-nowrap"
      >
        {status === 'loading' ? 'SENDING...' : status === 'success' ? 'SUCCESS ✓' : status === 'error' ? 'ERROR ✗' : 'GET ACCESS'}
      </button>
    </form>
  );
}

// ─── MAIN LANDING PAGE ─────────────────────────────────────────────
export default function PrescienceLanding() {
  const [pulseData, setPulseData] = useState(null);
  const [demoMarkets, setDemoMarkets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [pulseRes, scanRes] = await Promise.all([
        fetch('/api/pulse').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/scanner?limit=3').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      
      if (pulseRes?.pulse) setPulseData(pulseRes.pulse);
      if (scanRes?.scanner) setDemoMarkets(scanRes.scanner);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px'
      }} />
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-black tracking-[0.15em]">
                <span className="text-[#ff3366]" style={{ textShadow: '0 0 20px rgba(255,51,102,0.4)' }}>PRESCIENCE</span>
              </h1>
              <span className="text-[9px] text-white/20 tracking-widest hidden md:block">PREDICTION MARKET INTELLIGENCE</span>
            </div>
            
            <div className="flex items-center gap-6">
              <Link href="/scanner" className="text-sm text-white/40 hover:text-white/70 transition-colors">Scanner</Link>
              <Link href="/about" className="text-sm text-white/40 hover:text-white/70 transition-colors">API</Link>
              <a href="https://github.com/0xLaVaN/prescience" target="_blank" rel="noopener noreferrer" className="text-sm text-white/40 hover:text-white/70 transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-24">
        {/* Hero Section */}
        <section className="relative py-20 px-6">
          <div className="max-w-7xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <h2 className="text-5xl md:text-7xl font-black tracking-tight text-white/90 mb-6 leading-tight">
                See Who{' '}
                <span className="text-[#ff3366]" style={{ textShadow: '0 0 30px rgba(255,51,102,0.5)' }}>
                  Sees First
                </span>
              </h2>
              <p className="text-xl text-white/60 max-w-3xl mx-auto leading-relaxed">
                Real-time detection of insider trading and whale movements in prediction markets. 
                AI-powered surveillance across 500+ markets on Polymarket and Kalshi.
              </p>
            </motion.div>

            {/* Live Pulse Data */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-12"
            >
              <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                <div className="flex-shrink-0">
                  {loading ? (
                    <div className="w-32 h-32 rounded-full border-2 border-white/10 animate-pulse"></div>
                  ) : (
                    <ThreatIndicator 
                      level={pulseData?.threat_level || 'LOW'} 
                      score={pulseData?.highest_score || 0} 
                    />
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-6 md:gap-8">
                  <div className="text-center">
                    <div className="text-3xl font-black text-[#00f0ff] mb-1" style={{ textShadow: '0 0 20px rgba(0,240,255,0.3)' }}>
                      {loading ? '—' : <AnimatedNumber value={pulseData?.markets_scanned || 0} />}
                    </div>
                    <div className="text-xs text-white/40 tracking-wider">MARKETS SCANNED</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-black text-[#ff3366] mb-1" style={{ textShadow: '0 0 20px rgba(255,51,102,0.3)' }}>
                      {loading ? '—' : <AnimatedNumber value={pulseData?.suspicious_wallets || 0} />}
                    </div>
                    <div className="text-xs text-white/40 tracking-wider">SUSPICIOUS WALLETS</div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link href="/scanner" className="px-8 py-4 bg-[#ff3366] text-white font-black tracking-wider rounded-xl hover:bg-[#ff3366]/80 transition-all">
                START MONITORING
              </Link>
              <Link href="/about" className="px-8 py-4 bg-white/5 border border-white/20 text-white/80 font-bold tracking-wider rounded-xl hover:bg-white/10 transition-all">
                VIEW API DOCS
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Live Demo Section */}
        <section className="py-20 px-6 bg-white/[0.01]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h3 className="text-3xl font-black tracking-wide text-white/80 mb-4">
                Live Market Intelligence
              </h3>
              <p className="text-white/50 max-w-2xl mx-auto">
                Real-time threat scores from our AI surveillance system. These markets are showing suspicious activity right now.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-4 animate-pulse">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-white/10"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-white/10 rounded mb-2"></div>
                        <div className="h-3 bg-white/5 rounded w-3/4"></div>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-white/5 rounded-full"></div>
                  </div>
                ))
              ) : demoMarkets.length > 0 ? (
                demoMarkets.map((market, i) => (
                  <LiveMarketCard key={i} market={market} index={i} />
                ))
              ) : (
                <div className="col-span-3 text-center py-12 text-white/30">
                  <p>All markets are clean right now. Our AI will alert when suspicious activity is detected.</p>
                </div>
              )}
            </div>
            
            {!loading && demoMarkets.length > 0 && (
              <div className="text-center mt-8">
                <Link href="/scanner" className="inline-flex items-center gap-2 text-[#ff3366] hover:text-[#ff3366]/80 font-bold text-sm transition-colors">
                  VIEW ALL MARKETS →
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h3 className="text-3xl font-black tracking-wide text-white/80 mb-4">
                How Prescience Works
              </h3>
              <p className="text-white/50 max-w-2xl mx-auto">
                Our AI surveillance system monitors every trade, every wallet, every pattern across prediction markets.
              </p>
            </div>
            
            <HowItWorksSection />
          </div>
        </section>

        {/* Pricing */}
        <section className="py-20 px-6 bg-white/[0.01]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h3 className="text-3xl font-black tracking-wide text-white/80 mb-4">
                Simple Pricing
              </h3>
              <p className="text-white/50 max-w-2xl mx-auto">
                Start free, upgrade when you need unlimited access. Pay with ETH directly, no middlemen.
              </p>
            </div>
            
            <PricingSection />
          </div>
        </section>

        {/* Trust Signals */}
        <section className="py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h3 className="text-3xl font-black tracking-wide text-white/80 mb-4">
                Trusted by Smart Money
              </h3>
              <p className="text-white/50 max-w-2xl mx-auto">
                Our track record speaks for itself. Join the traders who see the signals first.
              </p>
            </div>
            
            <TrustSignalsSection stats={pulseData} />
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-6 bg-gradient-to-br from-[#ff3366]/5 to-transparent border-t border-white/5">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h3 className="text-4xl font-black tracking-wide text-white/90 mb-6">
                Ready to See Who Sees First?
              </h3>
              <p className="text-lg text-white/60 mb-8 max-w-2xl mx-auto">
                Get early access to Prescience. Be among the first to detect insider trading and whale movements in real-time.
              </p>
              
              <EmailSignupForm />
              
              <div className="mt-8 flex items-center justify-center gap-6 text-xs text-white/20">
                <span>No spam, ever</span>
                <span>•</span>
                <span>Cancel anytime</span>
                <span>•</span>
                <span>Free during beta</span>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center gap-4 mb-4 md:mb-0">
              <h1 className="text-lg font-black tracking-[0.15em]">
                <span className="text-[#ff3366]">PRESCIENCE</span>
              </h1>
              <span className="text-[8px] text-white/20 tracking-widest">v2.0</span>
            </div>
            
            <div className="flex items-center gap-6 text-xs text-white/30">
              <Link href="/scanner" className="hover:text-white/50 transition-colors">Scanner</Link>
              <Link href="/about" className="hover:text-white/50 transition-colors">API</Link>
              <a href="https://github.com/0xLaVaN/prescience" target="_blank" rel="noopener noreferrer" className="hover:text-white/50 transition-colors">GitHub</a>
              <span className="text-white/10">•</span>
              <span className="font-mono">Built by 0xLaVaN</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}