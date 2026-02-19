const config = {
  CRITICAL: { color: '#ff3366', bg: 'rgba(255,51,102,0.1)' },
  HIGH:     { color: '#f0a000', bg: 'rgba(240,160,0,0.1)' },
  MODERATE: { color: '#00f0ff', bg: 'rgba(0,240,255,0.1)' },
  LOW:      { color: '#00ff88', bg: 'rgba(0,255,136,0.1)' },
};

export default function ThreatBadge({ level = 'LOW', size = 'sm' }) {
  const { color, bg } = config[level] || config.LOW;
  const px = size === 'md' ? 'px-3 py-1' : 'px-2 py-0.5';
  const text = size === 'md' ? 'text-[10px]' : 'text-[9px]';

  return (
    <span
      className={`inline-block ${px} ${text} font-mono tracking-[0.15em] rounded-full border`}
      style={{ color, borderColor: color, backgroundColor: bg }}
    >
      {level}
    </span>
  );
}
