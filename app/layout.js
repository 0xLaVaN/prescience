import './globals.css';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import Nav from './components/Nav';
import Ticker from './components/Ticker';
import Footer from './components/Footer';

export const metadata = {
  title: 'Prescience | Prediction Market Intelligence',
  description: 'See who moves before the news. Prediction market intelligence — whale detection, flow analysis, timestamped calls.',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-[#0a0a0f] antialiased grid-bg scanlines text-white font-sans">
        <Nav />
        <Ticker />
        <main className="pt-[88px]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
