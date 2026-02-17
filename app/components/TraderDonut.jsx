'use client';

export default function TraderDonut({ fresh = 0, veterans = 0, large = 0, total = 0, size = 120 }) {
  const sum = fresh + veterans + large || 1;
  const segments = [
    { value: fresh, color: '#00f0ff', label: 'Fresh' },
    { value: veterans, color: '#666666', label: 'Veterans' },
    { value: large, color: '#ff2d55', label: 'Large' },
  ];

  const radius = 36, cx = 50, cy = 50, strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1a1a2e" strokeWidth={strokeWidth} />
        {segments.map((seg, i) => {
          const pct = seg.value / sum;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const currentOffset = offset;
          offset += pct * circumference;
          return pct > 0 ? (
            <circle
              key={i}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-currentOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            />
          ) : null;
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#e0e0e0" fontSize="14" fontFamily="'JetBrains Mono', monospace" fontWeight="bold">
          {total}
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
        {segments.map((s, i) => (
          <span key={i} style={{ color: s.color }}>● {s.label}</span>
        ))}
      </div>
    </div>
  );
}
