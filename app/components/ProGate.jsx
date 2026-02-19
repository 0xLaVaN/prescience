'use client';

import Link from 'next/link';

export default function ProGate({ children, feature = 'feature' }) {
  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md bg-[#0a0a0f]/60 rounded-lg border border-white/5">
        <div className="text-[9px] tracking-[0.3em] text-white/30 font-mono mb-2">PRO FEATURE</div>
        <div className="text-[10px] text-white/50 font-mono mb-4">{feature}</div>
        <Link
          href="/pro"
          className="text-[10px] tracking-[0.2em] font-mono text-[#00f0ff] border border-[#00f0ff]/50 px-4 py-1.5 rounded hover:bg-[#00f0ff]/10 transition-colors"
        >
          UPGRADE TO PRO
        </Link>
      </div>
    </div>
  );
}
