'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const fadeUp = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };

const layers = [
  { icon: '🔍', title: 'THE SCANNER', desc: 'Real-time market surveillance. Every trade analyzed, every wallet tracked.' },
  { icon: '⚡', title: 'THE WIRE', desc: 'Live intelligence feed. Alerts, shifts, and breaking signals as they happen.' },
  { icon: '📰', title: 'THE NEWSROOM', desc: 'Deep investigations into market manipulation and trading patterns.' },
];

const endpoints = [
  { method: 'GET', path: '/api/pulse', desc: 'System-wide threat assessment', curl: 'curl https://prescience.markets/api/pulse' },
  { method: 'GET', path: '/api/scan', desc: 'Full market scan with threat scores', curl: 'curl https://prescience.markets/api/scan' },
  { method: 'GET', path: '/api/news', desc: 'Intelligence feed', curl: 'curl https://prescience.markets/api/news' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <main className="max-w-5xl mx-auto px-4 md:px-8 pb-20">
        {/* Hero */}
        <motion.div {...fadeUp} className="text-center py-20">
          <h1 className="text-5xl md:text-7xl font-black tracking-[0.2em] text-[#ff3366] mb-4" style={{ textShadow: '0 0 40px rgba(255,51,102,0.4)' }}>
            PRESCIENCE
          </h1>
          <div className="text-sm md:text-base text-white/40 font-mono tracking-[0.15em] mb-3">Prediction Market Intelligence</div>
          <div className="text-lg md:text-xl text-[#00f0ff]/60 font-mono italic" style={{ textShadow: '0 0 20px rgba(0,240,255,0.2)' }}>
            See who sees first.
          </div>
        </motion.div>

        {/* What is Prescience */}
        <motion.div {...fadeUp} transition={{ delay: 0.1 }} className="max-w-3xl mx-auto mb-20 space-y-5">
          <h2 className="text-[10px] text-white/30 tracking-[0.3em] font-mono mb-6">◈ WHAT IS PRESCIENCE</h2>
          <p className="text-sm text-white/50 leading-relaxed font-mono">
            Prescience is a real-time intelligence platform that monitors prediction markets for insider trading signals, unusual flow patterns, and coordinated wallet activity. We analyze every trade on Polymarket to surface the signals that matter.
          </p>
          <p className="text-sm text-white/50 leading-relaxed font-mono">
            Our threat scoring engine evaluates fresh wallet surges, large position concentrations, flow imbalances, and timing clusters to generate a composite threat score for every active market. When informed money moves, Prescience detects it.
          </p>
          <p className="text-sm text-white/50 leading-relaxed font-mono">
            Whether you're a trader looking for edge, a researcher studying market microstructure, or a developer building on prediction market data—Prescience gives you the intelligence layer that doesn't exist anywhere else.
          </p>
        </motion.div>

        {/* Three Layers */}
        <motion.div {...fadeUp} transition={{ delay: 0.2 }} className="mb-20">
          <h2 className="text-[10px] text-white/30 tracking-[0.3em] font-mono text-center mb-10">◈ THREE LAYERS</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {layers.map((l, i) => (
              <motion.div key={l.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="holo-card rounded-xl p-6 text-center">
                <div className="text-3xl mb-4">{l.icon}</div>
                <div className="text-xs font-black tracking-[0.2em] text-[#00f0ff] mb-3" style={{ textShadow: '0 0 10px rgba(0,240,255,0.3)' }}>{l.title}</div>
                <p className="text-[11px] text-white/40 font-mono leading-relaxed">{l.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* API Documentation */}
        <motion.div {...fadeUp} transition={{ delay: 0.3 }} className="mb-20">
          <h2 className="text-[10px] text-white/30 tracking-[0.3em] font-mono text-center mb-3">◈ API</h2>
          <div className="text-center mb-10">
            <div className="text-lg font-black text-white/80 mb-2">Built for Agents &amp; Developers</div>
            <div className="text-[11px] text-white/40 font-mono">REST API for programmatic access to all intelligence data</div>
          </div>
          <div className="space-y-4 max-w-3xl mx-auto">
            {endpoints.map(ep => (
              <div key={ep.path} className="bg-black/40 border border-white/[0.06] rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[9px] font-mono font-bold text-[#00ff88] bg-[#00ff88]/10 px-2 py-0.5 rounded">{ep.method}</span>
                  <span className="text-sm font-mono text-[#00f0ff]">{ep.path}</span>
                </div>
                <div className="text-[11px] text-white/40 font-mono mb-3">{ep.desc}</div>
                <div className="bg-black/60 rounded-lg p-3 overflow-x-auto">
                  <code className="text-[11px] text-[#00f0ff]/60 font-mono">{ep.curl}</code>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div {...fadeUp} transition={{ delay: 0.4 }} className="mb-16">
          <h2 className="text-[10px] text-white/30 tracking-[0.3em] font-mono text-center mb-10">◈ GET STARTED</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {[
              { label: 'Sign Up', href: '/api/register', desc: 'Create your account' },
              { label: 'API Access', href: '/about#api', desc: 'Start building' },
              { label: 'View Pricing', href: '/pro', desc: 'Unlock PRO features' },
            ].map(c => (
              <Link key={c.label} href={c.href}
                className="holo-card rounded-xl p-5 text-center hover:border-[#00f0ff]/30 transition-colors group">
                <div className="text-xs font-black tracking-[0.15em] text-[#00f0ff] group-hover:text-[#00f0ff] mb-1">{c.label}</div>
                <div className="text-[10px] text-white/30 font-mono">{c.desc}</div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Contact */}
        <motion.div {...fadeUp} transition={{ delay: 0.5 }} className="text-center border-t border-white/5 pt-10">
          <div className="text-[10px] text-white/20 tracking-[0.2em] font-mono mb-3">CONNECT</div>
          <a href="https://x.com/lavanism_" target="_blank" rel="noopener noreferrer"
            className="text-[#00f0ff] text-sm font-mono hover:underline">
            Follow @lavanism_ on X →
          </a>
        </motion.div>
      </main>
    </div>
  );
}
