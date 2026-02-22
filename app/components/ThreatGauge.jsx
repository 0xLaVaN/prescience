'use client';
import { useState, useEffect, useRef } from 'react';

export default function ThreatGauge({ score = 0, level = 'low', size = 120 }) {
  const [displayScore, setDisplayScore] = useState(0);
  const [arcProgress, setArcProgress] = useState(0);
  const hasAnimated = useRef(false);
  const gaugeRef = useRef(null);

  const clamp = Math.min(100, Math.max(0, score));
  const radius = 40;
  const cx = 50, cy = 55;
  const startAngle = -210;
  const endAngle = 30;
  const range = endAngle - startAngle;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const arcX = (a) => cx + radius * Math.cos(toRad(a));
  const arcY = (a) => cy + radius * Math.sin(toRad(a));

  const bgPath = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${radius} ${radius} 0 1 1 ${arcX(endAngle)} ${arcY(endAngle)}`;

  // Animate on intersection
  useEffect(() => {
    if (hasAnimated.current || clamp === 0) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          animate();
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    if (gaugeRef.current) observer.observe(gaugeRef.current);
    return () => observer.disconnect();
  }, [clamp]);

  function animate() {
    const duration = 1800; // ms
    const start = performance.now();

    function easeOutExpo(t) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(t);

      setDisplayScore(Math.round(eased * clamp));
      setArcProgress(eased * clamp);

      if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  // Build the value arc based on animated progress
  const currentSweep = startAngle + (arcProgress / 100) * range;
  const largeArc = (arcProgress / 100) * range > 180 ? 1 : 0;
  const valPath = arcProgress > 0
    ? `M ${arcX(startAngle)} ${arcY(startAngle)} A ${radius} ${radius} 0 ${largeArc} 1 ${arcX(currentSweep)} ${arcY(currentSweep)}`
    : '';

  const color = arcProgress < 33 ? '#22c55e' : arcProgress < 66 ? '#ffcc00' : '#ff2d55';
  const levelColors = { low: '#22c55e', medium: '#ffcc00', high: '#ff2d55', critical: '#ff2d55' };

  // Glow intensity scales with progress
  const glowOpacity = Math.min(0.6, arcProgress / 100);

  return (
    <div ref={gaugeRef}>
      <svg width={size} height={size * 0.75} viewBox="0 0 100 80">
        {/* Glow filter */}
        <defs>
          <filter id="arcGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background arc */}
        <path d={bgPath} fill="none" stroke="#1a1a2e" strokeWidth="8" strokeLinecap="round" />

        {/* Animated value arc with glow */}
        {valPath && (
          <>
            <path d={valPath} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
              style={{ filter: 'url(#arcGlow)', opacity: glowOpacity + 0.4 }} />
            <path d={valPath} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
          </>
        )}

        {/* Animated score number */}
        <text x={cx} y={cy - 2} textAnchor="middle" fill="#e0e0e0" fontSize="18"
          fontFamily="var(--font-geist-mono), monospace" fontWeight="bold"
          style={{ opacity: displayScore > 0 ? 1 : 0.2 }}>
          {displayScore}
        </text>

        {/* Level label */}
        <text x={cx} y={cy + 12} textAnchor="middle"
          fill={displayScore > 0 ? (levelColors[level] || '#666') : '#333'}
          fontSize="8" fontFamily="var(--font-geist-mono), monospace"
          style={{ opacity: displayScore > 0 ? 1 : 0.3, transition: 'opacity 0.5s ease' }}>
          {displayScore > 0 ? level.toUpperCase() : '—'}
        </text>
      </svg>
    </div>
  );
}
