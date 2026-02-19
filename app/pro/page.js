'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const fadeUp = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } };

const valueProps = [
  { icon: '◈', title: 'Flow Analysis', desc: 'See exactly where the money is flowing. Minority vs majority positioning, real-time.' },
  { icon: '◉', title: 'Wallet Forensics', desc: 'Deep wallet history, connection graphs, and behavioral patterns.' },
  { icon: '◆', title: 'Priority Alerts', desc: 'Get notified first when threat levels spike. Email + API webhooks.' },
];

const features = [
  { name: 'Market Scanner', free: '✓', pro: '✓' },
  { name: 'Threat Scores', free: '✓', pro: '✓' },
  { name: 'The Wire Feed', free: '✓', pro: '✓' },
  { name: 'Flow Analysis', free: 'Basic', pro: 'Full' },
  { name: 'Wallet Forensics', free: '—', pro: '✓' },
  { name: 'Priority Alerts', free: '—', pro: '✓' },
  { name: 'API Rate Limit', free: '100/day', pro: '10,000/day' },
  { name: 'Historical Data', free: '24h', pro: '90 days' },
];

const faqs = [
  { q: 'What happens after my trial ends?', a: 'You\'ll revert to the free tier with full access to the scanner, threat scores, and Wire feed. No data is lost.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel instantly from your dashboard. No lock-in, no questions asked.' },
  { q: 'Do you offer team/enterprise plans?', a: 'Yes—reach out to us on X (@lavanism_) for custom API limits, dedicated feeds, and SLA support.' },
  { q: 'What payment methods do you accept?', a: 'Credit card and crypto. We\'ll send you a payment link after registration.' },
];

export default function ProPage() {
  return (
    <div className="min-h-screen">
      <main className="max-w-5xl mx-auto px-4 md:px-8 pb-20">
        {/* Hero */}
        <motion.div {...fadeUp} className="text-center py-20">
          <h1 className="text-4xl md:text-6xl font-black tracking-[0.15em] mb-4">
            <span className="text-white/90">PRESCIENCE </span>
            <span className="text-[#00f0ff]" style={{ textShadow: '0 0 30px rgba(0,240,255,0.4), 0 0 60px rgba(0,240,255,0.2)' }}>PRO</span>
          </h1>
          <div className="text-sm text-white/40 font-mono tracking-[0.1em]">Unlock the full intelligence stack</div>
        </motion.div>

        {/* Value Props */}
        <motion.div {...fadeUp} transition={{ delay: 0.1 }} className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {valueProps.map((v, i) => (
            <motion.div key={v.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="holo-card rounded-xl p-6">
              <div className="text-2xl text-[#00f0ff] mb-3" style={{ textShadow: '0 0 10px rgba(0,240,255,0.4)' }}>{v.icon}</div>
              <div className="text-xs font-black tracking-[0.15em] text-white/80 mb-2">{v.title}</div>
              <p className="text-[11px] text-white/40 font-mono leading-relaxed">{v.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Comparison Table */}
        <motion.div {...fadeUp} transition={{ delay: 0.2 }} className="mb-20 max-w-3xl mx-auto">
          <h2 className="text-[10px] text-white/30 tracking-[0.3em] font-mono text-center mb-8">◈ COMPARE PLANS</h2>
          <div className="overflow-hidden rounded-xl border border-white/[0.06]">
            <table className="w-full">
              <thead>
                <tr className="bg-[#00f0ff]/5 border-b border-[#00f0ff]/10">
                  <th className="text-left text-[10px] font-mono tracking-wider text-white/40 p-4">FEATURE</th>
                  <th className="text-center text-[10px] font-mono tracking-wider text-white/40 p-4">FREE</th>
                  <th className="text-center text-[10px] font-mono tracking-wider text-[#00f0ff] p-4" style={{ textShadow: '0 0 10px rgba(0,240,255,0.3)' }}>PRO · $29/mo</th>
                </tr>
              </thead>
              <tbody>
                {features.map((f, i) => (
                  <tr key={f.name} className={`border-b border-white/[0.04] ${i % 2 === 0 ? 'bg-white/[0.01]' : ''}`}>
                    <td className="text-[11px] font-mono text-white/50 p-4">{f.name}</td>
                    <td className="text-center text-[11px] font-mono p-4">
                      <span className={f.free === '✓' ? 'text-[#00ff88]' : f.free === '—' ? 'text-white/15' : 'text-white/40'}>{f.free}</span>
                    </td>
                    <td className="text-center text-[11px] font-mono p-4">
                      <span className={f.pro === '✓' ? 'text-[#00ff88]' : f.pro === 'Full' ? 'text-[#00f0ff]' : 'text-white/60'}>{f.pro}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div {...fadeUp} transition={{ delay: 0.3 }} className="text-center mb-20">
          <a href="mailto:lavan@openclaw.ai?subject=Prescience%20PRO"
            className="inline-block px-10 py-4 text-sm font-black tracking-[0.2em] text-[#00f0ff] border-2 border-[#00f0ff]/40 rounded-xl hover:bg-[#00f0ff]/10 transition-all pulse-glow"
            style={{ boxShadow: '0 0 30px rgba(0,240,255,0.15), 0 0 60px rgba(0,240,255,0.05)' }}>
            START YOUR FREE TRIAL
          </a>
          <div className="text-[10px] text-white/20 font-mono mt-3">7-day free trial • Cancel anytime</div>
        </motion.div>

        {/* FAQ */}
        <motion.div {...fadeUp} transition={{ delay: 0.4 }} className="max-w-2xl mx-auto">
          <h2 className="text-[10px] text-white/30 tracking-[0.3em] font-mono text-center mb-8">◈ FAQ</h2>
          <div className="space-y-4">
            {faqs.map(f => (
              <div key={f.q} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5">
                <div className="text-xs font-bold text-white/60 mb-2">{f.q}</div>
                <div className="text-[11px] text-white/35 font-mono leading-relaxed">{f.a}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
