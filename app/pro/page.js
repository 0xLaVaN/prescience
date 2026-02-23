'use client';
import { useState } from 'react';
import Link from 'next/link';
import ParticleBackground from '../components/ParticleBackground';

const WALLET = '0x001c1422dbad5d258c4e0824c5510b7cf8c6c97a';
const BOT_URL = 'https://t.me/PrescienceSignalsBot';
const BOT_HANDLE = '@PrescienceSignalsBot';

/* ── SVG icons (no emoji per brand rules) ──────────────────────────── */
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2.5 7L5.5 10L11.5 4" stroke="#00ff88" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M4 4L10 10M10 4L4 10" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function IconCopy({ copied }) {
  return copied ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8L6.5 11.5L13 5" stroke="#00ff88" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="rgba(0,240,255,0.6)" strokeWidth="1.5"/>
      <path d="M5 4V3.5A1.5 1.5 0 0 1 6.5 2h6A1.5 1.5 0 0 1 14 3.5v7a1.5 1.5 0 0 1-1.5 1.5H12" stroke="rgba(0,240,255,0.4)" strokeWidth="1.5"/>
    </svg>
  );
}
function IconTelegram() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 4.5V8L10.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconBolt() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M9 2L3 9H8L7 14L13 7H8L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ── Step component ─────────────────────────────────────────────────── */
function Step({ n, title, children, accent = '#00f0ff' }) {
  return (
    <div style={{
      display: 'flex', gap: 20, padding: '24px 28px',
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${accent}22`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: `${accent}15`, border: `1.5px solid ${accent}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold', color: accent,
      }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', color: '#fff', marginBottom: 6 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────── */
export default function ProPage() {
  const [copied, setCopied] = useState(false);

  function copyWallet() {
    navigator.clipboard.writeText(WALLET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <style>{`
        @keyframes pulse-glow { 0%,100%{box-shadow:0 0 20px rgba(0,240,255,.15)} 50%{box-shadow:0 0 40px rgba(0,240,255,.35)} }
        .cta-btn { animation: pulse-glow 2.5s ease-in-out infinite; }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .delay-pill { animation: shimmer 3s linear infinite;
          background: linear-gradient(90deg, rgba(240,160,0,.15) 0%, rgba(240,160,0,.3) 50%, rgba(240,160,0,.15) 100%);
          background-size: 200% auto; }
        @keyframes tick { 0%,100%{opacity:.5} 50%{opacity:1} }
        .tick { animation: tick 1.5s ease-in-out infinite; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', paddingTop: 80 }}>
        <ParticleBackground />

        <div style={{ position: 'relative', zIndex: 10, maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>

          {/* ── Hero ──────────────────────────────────────────────────── */}
          <div style={{ textAlign: 'center', padding: '60px 0 56px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.4em', color: 'rgba(0,240,255,.4)', marginBottom: 16 }}>
              PRESCIENCE / PRO TIER
            </div>
            <h1 style={{ fontFamily: 'monospace', fontSize: 'clamp(32px,6vw,52px)', fontWeight: 900, margin: '0 0 20px',
              letterSpacing: '0.08em', lineHeight: 1.1 }}>
              See it when the money moves.
              <br/>
              <span style={{ color: '#00f0ff', textShadow: '0 0 30px rgba(0,240,255,0.4)' }}>Not an hour later.</span>
            </h1>
            <p style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, maxWidth: 540, margin: '0 auto' }}>
              Every signal you see on the free channel — smart money saw it 60 minutes before you did.
              Pro subscribers get the alert the moment we detect it.
            </p>
          </div>

          {/* ── Free vs Pro contrast ──────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 48 }}>
            {/* Free */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '22px 24px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.25)', marginBottom: 14 }}>FREE</div>
              {[
                'Community Telegram group',
                'Up to 3 signals/day',
                'Daily digest summary',
              ].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <IconCheck />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{t}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 12px',
                borderRadius: 8, border: '1px solid rgba(240,160,0,0.2)' }}
                className="delay-pill">
                <span className="tick" style={{ color: '#f0a000' }}><IconClock /></span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#f0a000', fontWeight: 'bold' }}>
                  Signals arrive 1 hour late
                </span>
              </div>
            </div>

            {/* Pro */}
            <div style={{ background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.2)',
              borderRadius: 12, padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, background: '#00f0ff', color: '#0a0a0f',
                fontFamily: 'monospace', fontSize: 9, fontWeight: 900, letterSpacing: '0.15em',
                padding: '4px 12px', borderBottomLeftRadius: 8 }}>$20/MO</div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.3em', color: '#00f0ff', marginBottom: 14 }}>PRO</div>
              {[
                'Real-time DMs the instant we detect',
                'Volume spike alerts',
                'Flow forensics detail',
                'Direct channel to @PrescienceSignalsBot',
              ].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <IconCheck />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{t}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '10px 12px',
                background: 'rgba(0,255,136,0.08)', borderRadius: 8, border: '1px solid rgba(0,255,136,0.2)' }}>
                <span style={{ color: '#00ff88' }}><IconBolt /></span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#00ff88', fontWeight: 'bold' }}>
                  Signals arrive instantly
                </span>
              </div>
            </div>
          </div>

          {/* ── Payment flow ──────────────────────────────────────────── */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.4em', color: 'rgba(0,240,255,.35)',
              marginBottom: 20 }}>HOW TO SUBSCRIBE</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <Step n="1" title="Send $20 USDC on Base">
                <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, lineHeight: 1.5 }}>
                  Send exactly $20 USDC (or more) on the Base network to this wallet:
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,240,255,0.15)',
                  borderRadius: 8, padding: '10px 14px' }}>
                  <code style={{ fontFamily: 'monospace', fontSize: 11, color: '#00f0ff',
                    flex: 1, wordBreak: 'break-all', letterSpacing: '0.03em' }}>
                    {WALLET}
                  </code>
                  <button onClick={copyWallet} style={{ background: 'none', border: 'none', cursor: 'pointer',
                    color: copied ? '#00ff88' : 'rgba(0,240,255,0.6)', padding: 4, flexShrink: 0,
                    transition: 'color 0.2s' }}>
                    <IconCopy copied={copied} />
                  </button>
                </div>
                {copied && (
                  <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#00ff88', marginTop: 6 }}>
                    Copied to clipboard
                  </div>
                )}
                <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
                  Network: Base (eip155:8453). Token: USDC (not ETH). Need Base USDC?{' '}
                  <a href="https://bridge.base.org" target="_blank" rel="noopener noreferrer"
                    style={{ color: 'rgba(0,240,255,0.5)', textDecoration: 'none' }}>Bridge here</a>
                </p>
              </Step>

              <Step n="2" title="Copy your transaction hash" accent="#f0a000">
                <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                  After sending, copy the transaction hash from your wallet or{' '}
                  <a href="https://basescan.org" target="_blank" rel="noopener noreferrer"
                    style={{ color: 'rgba(0,240,255,0.5)', textDecoration: 'none' }}>basescan.org</a>.
                  It starts with <code style={{ color: 'rgba(240,160,0,0.8)', fontFamily: 'monospace' }}>0x</code> and
                  is 66 characters long.
                </p>
              </Step>

              <Step n="3" title="DM the bot your tx hash" accent="#00ff88">
                <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 14, lineHeight: 1.5 }}>
                  Send the tx hash to {BOT_HANDLE} on Telegram. The bot verifies on-chain and
                  grants Pro access within 60 seconds.
                </p>
                <a href={BOT_URL} target="_blank" rel="noopener noreferrer"
                  className="cta-btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 10,
                    background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.35)',
                    color: '#00f0ff', fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold',
                    letterSpacing: '0.1em', padding: '11px 22px', borderRadius: 8,
                    textDecoration: 'none', cursor: 'pointer' }}>
                  <IconTelegram />
                  OPEN {BOT_HANDLE}
                </a>
              </Step>
            </div>
          </div>

          {/* ── Price clarity ─────────────────────────────────────────── */}
          <div style={{ background: 'rgba(0,240,255,0.03)', border: '1px solid rgba(0,240,255,0.1)',
            borderRadius: 12, padding: '24px 28px', marginBottom: 48,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 900, color: '#00f0ff' }}>$20</div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.2em' }}>
                PER MONTH · USDC ON BASE
              </div>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.35)', maxWidth: 380, lineHeight: 1.6 }}>
              No subscription contract. No auto-renewal trap.
              Each payment covers 30 days. The bot sends a 3-day warning before expiry.
              Renew by sending another $20.
            </div>
          </div>

          {/* ── FAQ ───────────────────────────────────────────────────── */}
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.4em',
              color: 'rgba(0,240,255,.35)', marginBottom: 20 }}>FAQ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                {
                  q: 'What counts as a signal?',
                  a: 'When our scanner detects anomalous wallet activity (score ≥ 6/12) — fresh wallets clustering on one side, minority-heavy flow, unusual volume at off-hours — the bot DMs Pro subscribers immediately. Free channel gets the same message 1 hour later.',
                },
                {
                  q: 'How many signals per day?',
                  a: 'Max 3 per day, some days zero. We only post when there\'s genuine anomaly. Scarcity is intentional — false positives destroy trust.',
                },
                {
                  q: 'What if I sent ETH instead of USDC?',
                  a: 'DM the bot your tx hash anyway. We verify at current ETH/USD price. If it was worth $20+ at send time, you\'re in.',
                },
                {
                  q: 'What if verification fails?',
                  a: 'The bot checks: correct recipient address, USDC token contract, amount ≥ $20, confirmed on Base. If any check fails it tells you why. Contact @lavanism_ on X if you\'re stuck.',
                },
                {
                  q: 'Is this financial advice?',
                  a: 'No. Prescience is an intelligence tool — we detect anomalies, not predict outcomes. We show you what the smart money is doing. What you do with that is on you.',
                },
              ].map(f => (
                <div key={f.q} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 10, padding: '16px 20px' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
                    {f.q}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65 }}>
                    {f.a}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Bottom CTA ────────────────────────────────────────────── */}
          <div style={{ textAlign: 'center', marginTop: 56 }}>
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer"
              className="cta-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '14px 32px',
                background: 'rgba(0,240,255,0.08)', border: '2px solid rgba(0,240,255,0.35)',
                color: '#00f0ff', fontFamily: 'monospace', fontSize: 13, fontWeight: 900,
                letterSpacing: '0.15em', borderRadius: 10, textDecoration: 'none' }}>
              <IconTelegram />
              GET PRO ACCESS — $20/MO
            </a>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 12 }}>
              USDC on Base · 30-day access · No contract
            </div>
            <div style={{ marginTop: 20 }}>
              <Link href="/" style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.2)',
                textDecoration: 'none', letterSpacing: '0.15em' }}>
                ← BACK TO PRESCIENCE
              </Link>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
