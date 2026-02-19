import './globals.css';
import Nav from './components/Nav';
import Ticker from './components/Ticker';
import Footer from './components/Footer';

export const metadata = {
  title: 'Prescience | Prediction Market Intelligence',
  description: 'Real-time prediction market intelligence. Insider threat detection, flow analysis, and trader behavior signals.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[#0a0a0f] antialiased grid-bg scanlines font-mono text-white">
        <Nav />
        <Ticker />
        <main className="pt-[88px]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
