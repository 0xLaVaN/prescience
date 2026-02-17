'use client';

export default function FlowBar({ minorityFlow = 0, majorityFlow = 0, minorityOutcome = 'No', majorityOutcome = 'Yes', flowDirection = '' }) {
  const total = minorityFlow + majorityFlow || 1;
  const minPct = (minorityFlow / total) * 100;
  const majPct = (majorityFlow / total) * 100;

  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#e0e0e0', marginBottom: 4 }}>
        <span style={{ color: '#ff2d55' }}>{minorityOutcome} (minority)</span>
        <span style={{ color: '#00f0ff' }}>{majorityOutcome} (majority)</span>
      </div>
      <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', background: '#1a1a2e' }}>
        <div style={{
          width: `${minPct}%`,
          background: 'linear-gradient(90deg, #ff2d55, #ff2d5588)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: '#fff', fontWeight: 'bold',
          minWidth: minPct > 5 ? 'auto' : 0,
        }}>
          {minPct > 8 ? `$${(minorityFlow / 1000).toFixed(1)}k` : ''}
        </div>
        <div style={{
          width: `${majPct}%`,
          background: 'linear-gradient(90deg, #00f0ff88, #00f0ff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: '#000', fontWeight: 'bold',
        }}>
          {majPct > 8 ? `$${(majorityFlow / 1000).toFixed(1)}k` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 10, color: '#666', marginTop: 4 }}>
        Flow: {flowDirection} · Imbalance: {((Math.abs(minorityFlow - majorityFlow) / total) * 100).toFixed(1)}%
      </div>
    </div>
  );
}
