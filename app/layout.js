import './globals.css';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Nav from './components/Nav';
import Ticker from './components/Ticker';
import Footer from './components/Footer';

const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-inter',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({ 
  subsets: ['latin'], 
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata = {
  title: 'Prescience | Prediction Market Intelligence',
  description: 'Real-time prediction market intelligence. Insider threat detection, flow analysis, and trader behavior signals.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className={`min-h-screen bg-[#0a0a0f] antialiased grid-bg scanlines text-white ${jetbrains.className}`}>
        <Nav />
        <Ticker />
        <main className="pt-[88px]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
