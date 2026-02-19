'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

const FEATURED = {
  title: 'The Ghost Wallets of Polymarket',
  subtitle: 'How coordinated fresh wallet clusters signal insider knowledge before major market moves',
  category: 'INVESTIGATION',
  date: 'Feb 2025',
  readTime: '12 min read',
};

const TRENDING = [
  'Fresh Wallet Patterns in Political Markets',
  'Volume Anomalies: When Liquidity Lies',
  'The Minority Flow Indicator',
  'Timing Clusters and Coordinated Trading',
  'AI Market Manipulation: Early Signals',
];

const ARCHIVE_CATEGORIES = ['ALL', 'FLOW ANALYSIS', 'WALLET FORENSICS', 'MARKET STRUCTURE', 'AI & TECH'];

const MOCK_ARTICLES = [
  { title: 'Cluster Analysis: 47 Fresh Wallets Move in Sync on Election Markets', category: 'WALLET FORENSICS', date: 'Jan 2025', readTime: '8 min', severity: 'high' },
  { title: 'The Liquidity Mirage: How Volume Spikes Mask Insider Positioning', category: 'FLOW ANALYSIS', date: 'Jan 2025', readTime: '10 min', severity: 'critical' },
  { title: 'Structural Breaks in Crypto Prediction Markets', category: 'MARKET STRUCTURE', date: 'Dec 2024', readTime: '6 min', severity: 'medium' },
  { title: 'GPT-Based Trading Bots: Detecting Algorithmic Manipulation', category: 'AI & TECH', date: 'Dec 2024', readTime: '15 min', severity: 'high' },
  { title: 'The 3AM Signal: Why Late-Night Trades Matter', category: 'FLOW ANALYSIS', date: 'Nov 2024', readTime: '7 min', severity: 'medium' },
  { title: 'Fresh Wallet Velocity as a Leading Indicator', category: 'WALLET FORENSICS', date: 'Nov 2024', readTime: '9 min', severity: 'high' },
];

function getSeverityColor(sev) {
  if (sev === 'critical') return '#ff3366';
  if (sev === 'high') return '#f0a000';
  if (sev === 'medium') return '#00f0ff';
  return '#00ff88';
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - (ts < 1e12 ? ts * 1000 : ts);
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NewsroomPage() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [archiveFilter, setArchiveFilter] = useState('ALL');

  useEffect(() => {
    fetch('/api/news').then(r => r.json())
      .then(res => { setNews(res.news || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filteredArchive = archiveFilter === 'ALL'
    ? MOCK_ARTICLES
    : MOCK_ARTICLES.filter(a => a.category === archiveFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
        <h1 className="text-xl font-black tracking-[0.15em] text-white/80 mb-1">
          <span className="text-[#00f0ff]" style={{ textShadow: '0 0 15px rgba(0,240,255,0.3)' }}>THE NEWSROOM</span>
        </h1>
        <p className="text-[10px] text-white/25 tracking-wider font-mono">Investigations, intelligence, and market forensics</p>
      </motion.div>

      {/* Featured Investigation */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="relative rounded-2xl overflow-hidden mb-10 cursor-pointer group"
          style={{ border: '1px solid rgba(0,240,255,0.2)', boxShadow: '0 0 30px rgba(0,240,255,0.05)' }}>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a1a] via-[#0d1117] to-[#0a0a1a]" />
          <div className="absolute inset-0 opacity-20"
            style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(0,240,255,0.08), transparent 60%)' }} />
          <div className="relative p-8 md:p-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[8px] tracking-[0.3em] text-[#00f0ff] px-2 py-1 rounded border border-[#00f0ff]/30 bg-[#00f0ff]/5">
                {FEATURED.category}
              </span>
              <span className="text-[9px] text-white/20 font-mono">{FEATURED.date}</span>
              <span className="text-[9px] text-white/20 font-mono">· {FEATURED.readTime}</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white/90 tracking-wider mb-3 group-hover:text-white transition-colors"
              style={{ textShadow: '0 0 40px rgba(0,240,255,0.1)' }}>
              {FEATURED.title}
            </h2>
            <p className="text-[13px] text-white/40 leading-relaxed max-w-2xl">{FEATURED.subtitle}</p>
            <div className="mt-6 flex items-center gap-2 text-[10px] text-[#00f0ff]/60 tracking-wider group-hover:text-[#00f0ff] transition-colors">
              READ FULL INVESTIGATION →
            </div>
          </div>
        </div>
      </motion.div>

      {/* Two Column: Intelligence + Trending */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Latest Intelligence */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff3366] animate-pulse" />
            <h2 className="text-xs font-black tracking-[0.2em] text-white/50">LATEST INTELLIGENCE</h2>
          </div>

          {loading ? (
            <div className="text-center py-12 text-white/20 text-[10px] font-mono tracking-widest">
              LOADING INTELLIGENCE FEED...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(news.length > 0 ? news : []).slice(0, 8).map((item, i) => {
                const sevColor = getSeverityColor(item.severity);
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}>
                    <Link href={`/market/${encodeURIComponent(item.slug || '')}`}>
                      <div className="holo-card rounded-xl p-5 h-full hover:bg-white/[0.04] transition-all cursor-pointer group">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[7px] tracking-[0.2em] px-1.5 py-0.5 rounded font-bold"
                            style={{ color: sevColor, background: `${sevColor}15`, border: `1px solid ${sevColor}25` }}>
                            {(item.severity || 'INFO').toUpperCase()}
                          </span>
                          <span className="text-[8px] text-white/20 font-mono">{timeAgo(item.timestamp)}</span>
                        </div>
                        <h3 className="text-[12px] text-white/70 group-hover:text-white/90 transition-colors leading-relaxed line-clamp-2 mb-3">
                          {item.headline}
                        </h3>
                        <div className="flex items-center gap-3 text-[8px] text-white/25 font-mono">
                          {item.volume24h && <span>Vol: ${(item.volume24h / 1000).toFixed(1)}K</span>}
                          {item.freshWallets && <span>{item.freshWallets} fresh</span>}
                          {item.flowDirection && <span className={item.flowDirection === 'YES' ? 'text-[#00ff88]' : item.flowDirection === 'NO' ? 'text-[#ff3366]' : ''}>
                            {item.flowDirection}
                          </span>}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
          {news.length === 0 && !loading && (
            <div className="text-center py-12 text-white/20 text-[10px] font-mono tracking-widest">
              NO INTELLIGENCE SIGNALS DETECTED
            </div>
          )}
        </div>

        {/* Trending Threads */}
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f0a000] animate-pulse" />
            <h2 className="text-xs font-black tracking-[0.2em] text-white/50">TRENDING THREADS</h2>
          </div>
          <div className="space-y-3">
            {TRENDING.map((title, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.08 }}>
                <div className="holo-card rounded-lg p-4 hover:bg-white/[0.04] transition-all cursor-pointer group">
                  <div className="flex items-start gap-3">
                    <span className="text-[#f0a000]/40 text-[10px] font-mono mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h4 className="text-[11px] text-white/60 group-hover:text-white/80 transition-colors leading-relaxed">
                        {title}
                      </h4>
                      <span className="text-[8px] text-white/20 font-mono mt-1 inline-block">Coming soon</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Investigation Archive */}
      <motion.section initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mb-12">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]" />
          <h2 className="text-xs font-black tracking-[0.2em] text-white/50">INVESTIGATION ARCHIVE</h2>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-3 mb-6">
          {ARCHIVE_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setArchiveFilter(cat)}
              className={`text-[9px] tracking-widest px-3 py-1.5 rounded-full border whitespace-nowrap transition-all font-mono ${
                archiveFilter === cat
                  ? 'border-[#00f0ff]/50 text-[#00f0ff] bg-[#00f0ff]/10'
                  : 'border-white/10 text-white/30 hover:text-white/50 hover:border-white/20'
              }`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredArchive.map((article, i) => {
            const sevColor = getSeverityColor(article.severity);
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}>
                <div className="holo-card rounded-xl p-5 hover:bg-white/[0.04] transition-all cursor-pointer group h-full">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[7px] tracking-[0.2em] px-1.5 py-0.5 rounded"
                      style={{ color: sevColor, background: `${sevColor}10`, border: `1px solid ${sevColor}20` }}>
                      {article.category}
                    </span>
                  </div>
                  <h3 className="text-[12px] text-white/70 group-hover:text-white/90 transition-colors leading-relaxed mb-3">
                    {article.title}
                  </h3>
                  <div className="flex items-center gap-3 text-[8px] text-white/25 font-mono">
                    <span>{article.date}</span>
                    <span>· {article.readTime}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
}
