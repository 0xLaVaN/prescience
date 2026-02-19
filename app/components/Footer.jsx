import Link from 'next/link';

const cols = [
  {
    title: 'PRODUCT',
    links: [
      { label: 'Wire', href: '/wire' },
      { label: 'Scanner', href: '/scanner' },
      { label: 'Newsroom', href: '/newsroom' },
    ],
  },
  {
    title: 'COMPANY',
    links: [
      { label: 'About', href: '/about' },
      { label: 'API', href: '/about' },
      { label: 'Pro', href: '/pro' },
    ],
  },
  {
    title: 'SOCIAL',
    links: [
      { label: 'X @lavanism_', href: 'https://x.com/lavanism_', external: true },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-8 px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-3 gap-8 mb-8">
        {cols.map((col) => (
          <div key={col.title}>
            <h4 className="text-[9px] tracking-[0.3em] text-white/30 font-mono mb-3">{col.title}</h4>
            <ul className="space-y-1.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="text-[10px] tracking-widest text-white/20 hover:text-white/40 font-mono transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="text-center border-t border-white/5 pt-6">
        <p className="text-[9px] tracking-[0.3em] text-white/20 font-mono">
          PRESCIENCE — PREDICTION MARKET INTELLIGENCE
        </p>
        <p className="text-[9px] tracking-widest text-white/10 font-mono mt-1">© 2026</p>
      </div>
    </footer>
  );
}
