'use client';

export default function MetricCard({ label, value, icon = '📊' }) {
  return (
    <div style={{
      background: '#111122',
      border: '1px solid #1a1a2e',
      borderRadius: 10,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 'bold', color: '#00f0ff' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
    </div>
  );
}
