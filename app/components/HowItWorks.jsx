'use client';

import { useEffect, useRef, useState } from 'react';

/* ── SCAN CARD: Animated scanner sweep across dot grid ──────────── */
function ScanViz() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 200, H = 120;
    canvas.width = W; canvas.height = H;
    const cols = 16, rows = 8;
    const gapX = W / (cols + 1), gapY = H / (rows + 1);
    let sweep = -20;
    let animId;
    const litDots = new Set();
    // Randomly mark ~15% as "hits"
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (Math.random() < 0.15) litDots.add(`${r}-${c}`);

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      sweep += 1.2;
      if (sweep > W + 20) sweep = -20;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = gapX * (c + 1), y = gapY * (r + 1);
          const dist = Math.abs(x - sweep);
          const isLit = litDots.has(`${r}-${c}`);
          const inSweep = dist < 15;

          if (isLit && x < sweep) {
            ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 6;
            ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
          } else if (inSweep) {
            ctx.fillStyle = 'rgba(0, 240, 255, 0.5)';
            ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
          }
        }
      }

      // Sweep line
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sweep, 0); ctx.lineTo(sweep, H); ctx.stroke();

      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, []);
  return <canvas ref={canvasRef} className="w-full h-[120px]" style={{ imageRendering: 'auto' }} />;
}

/* ── DETECT CARD: Wallet flow graph with pulsing anomaly node ───── */
function DetectViz() {
  return (
    <svg viewBox="0 0 200 120" className="w-full h-[120px]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow-cyan"><feGaussianBlur stdDeviation="2" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="glow-red"><feGaussianBlur stdDeviation="3" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>

      {/* Connection lines */}
      <line x1="40" y1="35" x2="100" y2="60" stroke="rgba(0,240,255,0.2)" strokeWidth="1"/>
      <line x1="40" y1="85" x2="100" y2="60" stroke="rgba(0,240,255,0.2)" strokeWidth="1"/>
      <line x1="100" y1="60" x2="160" y2="35" stroke="rgba(255,51,102,0.3)" strokeWidth="1.5">
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite"/>
      </line>
      <line x1="100" y1="60" x2="160" y2="85" stroke="rgba(0,240,255,0.2)" strokeWidth="1"/>
      <line x1="40" y1="35" x2="40" y2="85" stroke="rgba(0,240,255,0.1)" strokeWidth="0.5"/>

      {/* Normal nodes */}
      <circle cx="40" cy="35" r="6" fill="rgba(0,240,255,0.15)" stroke="#00f0ff" strokeWidth="1" filter="url(#glow-cyan)"/>
      <circle cx="40" cy="85" r="5" fill="rgba(0,240,255,0.15)" stroke="#00f0ff" strokeWidth="1" filter="url(#glow-cyan)"/>
      <circle cx="100" cy="60" r="7" fill="rgba(0,240,255,0.15)" stroke="#00f0ff" strokeWidth="1" filter="url(#glow-cyan)"/>
      <circle cx="160" cy="85" r="5" fill="rgba(0,240,255,0.15)" stroke="#00f0ff" strokeWidth="1" filter="url(#glow-cyan)"/>

      {/* Anomaly node — pulses red */}
      <circle cx="160" cy="35" r="8" fill="rgba(255,51,102,0.2)" stroke="#ff3366" strokeWidth="1.5" filter="url(#glow-red)">
        <animate attributeName="r" values="7;10;7" dur="1.5s" repeatCount="indefinite"/>
      </circle>
      <circle cx="160" cy="35" r="3" fill="#ff3366" opacity="0.8">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite"/>
      </circle>

      {/* Labels */}
      <text x="40" y="18" fill="rgba(255,255,255,0.3)" fontSize="7" fontFamily="JetBrains Mono" textAnchor="middle">0x7a..f2</text>
      <text x="100" y="43" fill="rgba(255,255,255,0.3)" fontSize="7" fontFamily="JetBrains Mono" textAnchor="middle">HUB</text>
      <text x="160" y="18" fill="rgba(255,51,102,0.6)" fontSize="7" fontFamily="JetBrains Mono" textAnchor="middle">ANOMALY</text>
      <text x="160" y="103" fill="rgba(255,255,255,0.3)" fontSize="7" fontFamily="JetBrains Mono" textAnchor="middle">0x3b..e1</text>

      {/* Flow arrows on anomaly line */}
      <circle r="2" fill="#ff3366" opacity="0.7">
        <animateMotion dur="2s" repeatCount="indefinite" path="M100,60 L160,35"/>
      </circle>
    </svg>
  );
}

/* ── ALERT CARD: Typing notification mockup ─────────────────────── */
function AlertViz() {
  const [text, setText] = useState('');
  const full = 'Threat Score: 47 — ELEVATED';
  const indexRef = useRef(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      indexRef.current++;
      if (indexRef.current > full.length + 20) {
        indexRef.current = 0;
        setText('');
      } else if (indexRef.current <= full.length) {
        setText(full.slice(0, indexRef.current));
      }
    }, 70);
    const cursorId = setInterval(() => setShowCursor(v => !v), 530);
    return () => { clearInterval(id); clearInterval(cursorId); };
  }, []);

  return (
    <div className="space-y-2 px-2">
      {/* Mini notification card */}
      <div className="bg-white/[0.03] border border-[#00f0ff]/30 rounded-lg p-3 relative overflow-hidden" style={{ boxShadow: '0 0 15px rgba(0,240,255,0.05), inset 0 0 15px rgba(0,240,255,0.02)' }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-[#ff3366] animate-pulse" />
          <span className="text-[9px] text-white/30 tracking-[0.2em] font-mono uppercase">Prescience Alert</span>
        </div>
        <div className="font-mono text-sm text-[#00f0ff] min-h-[20px]">
          {text}{showCursor && <span className="opacity-80">▌</span>}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-[#f0a000] rounded-full transition-all duration-300" style={{ width: text.length > 16 ? '47%' : '0%' }} />
          </div>
          <span className="text-[8px] text-white/20 font-mono">{text.length > 16 ? '47/100' : '--/100'}</span>
        </div>
      </div>
      {/* Mini metadata */}
      <div className="flex gap-2 text-[8px] text-white/20 font-mono px-1">
        <span>MKT: Will Iran...</span>
        <span>•</span>
        <span>74 wallets</span>
      </div>
    </div>
  );
}

/* ── MAIN COMPONENT ─────────────────────────────────────────────── */
const CARDS = [
  { key: 'scan', title: 'SCAN', subtitle: '500+ markets in real-time', desc: 'Continuous surveillance across Polymarket and Kalshi. Every trade, every wallet, every pattern — nothing escapes the grid.', Viz: ScanViz },
  { key: 'detect', title: 'DETECT', subtitle: 'Anomaly identification', desc: 'Graph analysis maps wallet relationships and money flow. When fresh wallets cluster on minority positions, we see the signal through the noise.', Viz: DetectViz },
  { key: 'alert', title: 'ALERT', subtitle: 'Instant intelligence', desc: 'Real-time threat scoring with conviction tiers. High-confidence signals surface instantly — before the market catches on.', Viz: AlertViz },
];

export default function HowItWorks() {
  const [visible, setVisible] = useState(new Set());
  const refs = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible((prev) => new Set([...prev, e.target.dataset.idx]));
          }
        });
      },
      { threshold: 0.2 }
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {CARDS.map((card, i) => {
        const show = visible.has(String(i));
        return (
          <div
            key={card.key}
            ref={(el) => (refs.current[i] = el)}
            data-idx={i}
            className="group relative bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 transition-all duration-700 hover:bg-white/[0.04] hover:border-[#00f0ff]/20"
            style={{
              opacity: show ? 1 : 0,
              transform: show ? 'translateY(0)' : 'translateY(40px)',
              transitionDelay: `${i * 150}ms`,
              boxShadow: 'none',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 40px rgba(0,240,255,0.06), inset 0 0 40px rgba(0,240,255,0.02)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
          >
            {/* Visualization */}
            <div className="mb-5 rounded-xl overflow-hidden bg-white/[0.01] border border-white/[0.04]">
              <card.Viz />
            </div>

            {/* Text */}
            <div className="text-xs text-[#00f0ff]/60 tracking-[0.3em] font-mono mb-1">{String(i + 1).padStart(2, '0')}</div>
            <h3 className="text-lg font-black tracking-[0.15em] text-white/90 mb-1">{card.title}</h3>
            <div className="text-xs text-[#00f0ff]/50 font-mono tracking-wider mb-3">{card.subtitle}</div>
            <p className="text-sm text-white/40 leading-relaxed">{card.desc}</p>
          </div>
        );
      })}
    </div>
  );
}
