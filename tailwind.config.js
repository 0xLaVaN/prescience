/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'presc-bg': '#0a0a0f',
        'presc-surface': '#12121a',
        'presc-border': '#1e1e2e',
        'presc-cyan': '#00FFD1',
        'presc-green': '#00FF88',
        'presc-red': '#FF3366',
        'presc-yellow': '#FFD700',
        'presc-text': '#E0E0E0',
        'presc-muted': '#6B7280',
      },
      fontFamily: {
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'monospace'],
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
