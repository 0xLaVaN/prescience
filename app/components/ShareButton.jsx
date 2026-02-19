'use client';

import { useState } from 'react';

export default function ShareButton({ title = '', url = '' }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-1 text-[9px] tracking-widest text-white/30 hover:text-white/50 font-mono transition-colors border border-white/10 rounded px-2 py-1"
    >
      {copied ? (
        <span className="text-[#00ff88]">COPIED!</span>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
          </svg>
          SHARE
        </>
      )}
    </button>
  );
}
