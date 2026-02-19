'use client';

import { motion } from 'framer-motion';

function barColor(score) {
  if (score >= 75) return '#ff3366';
  if (score >= 50) return '#f0a000';
  if (score >= 25) return '#00f0ff';
  return '#00ff88';
}

export default function ThreatBar({ score = 0, height = 6 }) {
  const color = barColor(score);

  return (
    <div
      className="w-full rounded-full bg-white/5 overflow-hidden"
      style={{ height }}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(score, 100)}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  );
}
