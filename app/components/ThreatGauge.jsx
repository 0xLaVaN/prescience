'use client';

export default function ThreatGauge({ score = 0, level = 'low', size = 120 }) {
  const clamp = Math.min(100, Math.max(0, score));
  const radius = 40;
  const cx = 50, cy = 55;
  const startAngle = -210;
  const endAngle = 30;
  const range = endAngle - startAngle;
  const sweepAngle = startAngle + (clamp / 100) * range;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const arcX = (a) => cx + radius * Math.cos(toRad(a));
  const arcY = (a) => cy + radius * Math.sin(toRad(a));

  const bgPath = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${radius} ${radius} 0 1 1 ${arcX(endAngle)} ${arcY(endAngle)}`;

  const largeArc = (clamp / 100) * range > 180 ? 1 : 0;
  const valPath = clamp > 0
    ? `M ${arcX(startAngle)} ${arcY(startAngle)} A ${radius} ${radius} 0 ${largeArc} 1 ${arcX(sweepAngle)} ${arcY(sweepAngle)}`
    : '';

  const color = clamp < 33 ? '#22c55e' : clamp < 66 ? '#ffcc00' : '#ff2d55';
  const levelColors = { low: '#22c55e', medium: '#ffcc00', high: '#ff2d55', critical: '#ff2d55' };

  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 100 80">
      <path d={bgPath} fill="none" stroke="#1a1a2e" strokeWidth="8" strokeLinecap="round" />
      {valPath && (
        <path d={valPath} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
      )}
      <text x={cx} y={cy - 2} textAnchor="middle" fill="#e0e0e0" fontSize="18" fontFamily="'JetBrains Mono', monospace" fontWeight="bold">
        {Math.round(clamp)}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill={levelColors[level] || '#666'} fontSize="8" fontFamily="'JetBrains Mono', monospace">
        {level.toUpperCase()}
      </text>
    </svg>
  );
}
