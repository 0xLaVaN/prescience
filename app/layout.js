import './globals.css';

export const metadata = {
  title: 'Prescience — Prediction Market Intelligence',
  description: 'Real-time prediction market intelligence. Threat detection, flow analysis, and trader behavior signals.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#e0e0e0',
        fontFamily: "'Inter', -apple-system, sans-serif",
        margin: 0,
      }}>
        {children}
      </body>
    </html>
  );
}
