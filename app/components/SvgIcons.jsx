'use client';

// Consistent thin line art icons, 20-24px, monochrome with brand cyan accent
export function ThreatPulseIcon({ size = 22, color = '#ff3366' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7" opacity="0.5" />
      <circle cx="12" cy="12" r="11" opacity="0.25" />
    </svg>
  );
}

export function GridScanIcon({ size = 22, color = '#00f0ff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <circle cx="5" cy="5" r="1.5" fill={color} opacity="0.6" />
      <circle cx="12" cy="5" r="1.5" fill={color} opacity="0.8" />
      <circle cx="19" cy="5" r="1.5" fill={color} opacity="0.4" />
      <circle cx="5" cy="12" r="1.5" fill={color} opacity="0.9" />
      <circle cx="12" cy="12" r="1.5" fill={color} />
      <circle cx="19" cy="12" r="1.5" fill={color} opacity="0.7" />
      <circle cx="5" cy="19" r="1.5" fill={color} opacity="0.5" />
      <circle cx="12" cy="19" r="1.5" fill={color} opacity="0.6" />
      <circle cx="19" cy="19" r="1.5" fill={color} opacity="0.8" />
    </svg>
  );
}

export function WalletIcon({ size = 22, color = '#00f0ff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <circle cx="17" cy="14" r="1.5" fill={color} />
      <path d="M6 6V4a2 2 0 012-2h8a2 2 0 012 2v2" />
    </svg>
  );
}

export function VolumeBarIcon({ size = 22, color = '#00f0ff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="14" width="4" height="8" rx="1" fill={color} opacity="0.3" />
      <rect x="10" y="8" width="4" height="14" rx="1" fill={color} opacity="0.5" />
      <rect x="16" y="2" width="4" height="20" rx="1" fill={color} opacity="0.8" />
    </svg>
  );
}

export function ShieldIcon({ size = 22, color = '#00ff88', fillOpacity = 0.15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V6l8-4z" stroke={color} fill={color} fillOpacity={fillOpacity} />
      <path d="M9 12l2 2 4-4" stroke={color} />
    </svg>
  );
}

export function RadarIcon({ size = 22, color = '#00f0ff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" opacity="0.3" />
      <circle cx="12" cy="12" r="6" opacity="0.5" />
      <circle cx="12" cy="12" r="2" fill={color} />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

export function TrendUpIcon({ size = 16, color = '#00ff88' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,12 6,7 9,9 14,3" />
      <polyline points="10,3 14,3 14,7" />
    </svg>
  );
}

export function TrendDownIcon({ size = 16, color = '#ff3366' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 6,9 9,7 14,13" />
      <polyline points="10,13 14,13 14,9" />
    </svg>
  );
}
