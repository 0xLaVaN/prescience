'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const tabs = [
  { label: 'WIRE', href: '/wire' },
  { label: 'NEWSROOM', href: '/newsroom' },
  { label: 'SCANNER', href: '/scanner' },
  { label: 'SCORECARD', href: '/scorecard' },
  { label: 'CMD', href: '/mission-control', admin: true },
];

export default function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 h-14 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5 flex items-center px-4 md:px-6">
      {/* Logo */}
      <Link href="/" className="flex-shrink-0 mr-6">
        <span
          className="text-[#00f0ff] font-mono font-bold text-lg tracking-widest"
          style={{ textShadow: '0 0 20px rgba(0,240,255,0.5), 0 0 40px rgba(0,240,255,0.2)' }}
        >
          PRESCIENCE
        </span>
      </Link>

      {/* Center tabs - desktop */}
      <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
        {tabs.map((tab) => {
          const active = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative px-4 py-4 text-[10px] tracking-[0.2em] font-mono transition-colors ${
                active
                  ? 'text-[#00f0ff]'
                  : tab.admin
                  ? 'text-white/20 hover:text-white/35'
                  : 'text-white/40 hover:text-white/60'
              }`}
              title={tab.admin ? 'Mission Control (admin)' : undefined}
            >
              {tab.admin ? `⌘ ${tab.label}` : tab.label}
              {active && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#00f0ff]"
                  style={{ boxShadow: '0 0 8px #00f0ff, 0 0 16px rgba(0,240,255,0.3)' }}
                />
              )}
            </Link>
          );
        })}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 ml-auto">
        {/* LIVE indicator */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[9px] tracking-widest text-red-400 font-mono">LIVE</span>
        </div>

        {/* PRO button */}
        <Link
          href="/pro"
          className="text-[9px] tracking-[0.2em] font-mono text-[#00f0ff] border border-[#00f0ff]/50 px-3 py-1 rounded animate-pulse hover:bg-[#00f0ff]/10 transition-colors"
          style={{ animationDuration: '2s' }}
        >
          PRO
        </Link>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-white/40 hover:text-white/60 ml-1"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen ? (
              <path d="M6 6l12 12M6 18L18 6" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="absolute top-14 left-0 right-0 bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-white/5 md:hidden">
          {tabs.map((tab) => {
            const active = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setMenuOpen(false)}
                className={`block px-6 py-3 text-[10px] tracking-[0.2em] font-mono border-b border-white/5 ${
                  active ? 'text-[#00f0ff] bg-[#00f0ff]/5' : 'text-white/40'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
