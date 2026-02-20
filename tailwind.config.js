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
        mono: ["'JetBrains Mono'", 'monospace'],
        sans: ["'Geist'", 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
