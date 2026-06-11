'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface TickerPrice {
  symbol: string
  price: string
  change: string
  positive: boolean
}

const FEATURES = [
  {
    icon: '🔗',
    title: 'Multi-Exchange',
    desc: 'Connect to Binance, Bybit, OKX, Kraken, or KuCoin with secure encrypted API keys.',
    color: '#4f8ef7',
  },
  {
    icon: '🤖',
    title: 'AI Signals',
    desc: 'Multi-timeframe analysis across 15m, 1h, 4h, and 1D with 100-point confidence scoring.',
    color: '#00d68f',
  },
  {
    icon: '🛡️',
    title: 'Risk Management',
    desc: 'Auto position sizing, daily loss limits, consecutive loss protection, and trailing stops.',
    color: '#ffd700',
  },
  {
    icon: '📡',
    title: 'Real-Time Monitoring',
    desc: 'Automated TP/SL monitoring every minute. Auto-close at targets or stop loss.',
    color: '#ff4757',
  },
]

const STATS = [
  { label: 'Supported Exchanges', value: '5' },
  { label: 'Analysis Timeframes', value: '4' },
  { label: 'Signal Score Points', value: '100' },
  { label: 'Monitor Interval', value: '1 min' },
]

const PLACEHOLDER_PRICES: TickerPrice[] = [
  { symbol: 'BTC/USDT', price: '67,234.50', change: '+2.34%', positive: true },
  { symbol: 'ETH/USDT', price: '3,521.80', change: '+1.87%', positive: true },
  { symbol: 'SOL/USDT', price: '142.65', change: '-0.54%', positive: false },
  { symbol: 'BNB/USDT', price: '578.20', change: '+0.92%', positive: true },
  { symbol: 'LTC/USDT', price: '84.30', change: '-1.21%', positive: false },
]

export default function LandingPage() {
  const [prices, setPrices] = useState<TickerPrice[]>(PLACEHOLDER_PRICES)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    // Fetch real prices from public API
    const fetchPrices = async () => {
      try {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'LTCUSDT']
        const res = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`
        )
        if (!res.ok) return
        const data = await res.json()
        const updated: TickerPrice[] = data.map(
          (item: { symbol: string; lastPrice: string; priceChangePercent: string }) => ({
            symbol: item.symbol.replace('USDT', '/USDT'),
            price: parseFloat(item.lastPrice).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            change: `${parseFloat(item.priceChangePercent) >= 0 ? '+' : ''}${parseFloat(item.priceChangePercent).toFixed(2)}%`,
            positive: parseFloat(item.priceChangePercent) >= 0,
          })
        )
        setPrices(updated)
      } catch {
        // Keep placeholder prices on error
      }
    }

    fetchPrices()
    const interval = setInterval(fetchPrices, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen hero-bg">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#2a2a35] bg-[#0d0d0f]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#4f8ef7] to-[#00d68f] rounded-lg flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-[#e8e8f0]">APEX</span>
            <span className="text-xs bg-[#4f8ef7]/20 text-[#4f8ef7] px-2 py-0.5 rounded-full font-mono">BETA</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="px-4 py-2 text-[#6b6b80] hover:text-[#e8e8f0] text-sm font-semibold transition-colors">
              Sign In
            </Link>
            <Link href="/onboard" className="px-4 py-2 bg-[#4f8ef7] hover:bg-[#6aa0f9] text-white text-sm font-semibold rounded-lg transition-colors">
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Ticker strip */}
      <div className="fixed top-[61px] left-0 right-0 z-40 bg-[#16161a] border-b border-[#2a2a35] overflow-hidden">
        <div className="ticker-wrap py-2">
          <div className="ticker-content">
            {[...prices, ...prices].map((p, i) => (
              <span key={i} className="inline-flex items-center gap-2 mx-8 text-xs font-mono">
                <span className="text-[#6b6b80]">{p.symbol}</span>
                <span className="text-[#e8e8f0] font-semibold">${p.price}</span>
                <span className={p.positive ? 'text-[#00d68f]' : 'text-[#ff4757]'}>{p.change}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="min-h-screen flex items-center justify-center pt-28 pb-20 px-6">
        <div className={`text-center max-w-4xl mx-auto transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Logo mark */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="w-24 h-24 bg-gradient-to-br from-[#4f8ef7]/20 to-[#00d68f]/20 rounded-2xl border border-[#4f8ef7]/30 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
                  <defs>
                    <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4f8ef7" />
                      <stop offset="100%" stopColor="#00d68f" />
                    </linearGradient>
                  </defs>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="url(#logo-grad)" fill="none" strokeLinejoin="round" />
                  <circle cx="4" cy="4" r="1.5" fill="#4f8ef7" opacity="0.6" />
                  <circle cx="20" cy="20" r="1.5" fill="#00d68f" opacity="0.6" />
                  <circle cx="20" cy="4" r="1" fill="#4f8ef7" opacity="0.4" />
                  <circle cx="4" cy="20" r="1" fill="#00d68f" opacity="0.4" />
                  <line x1="4" y1="4" x2="8" y2="8" stroke="#4f8ef7" strokeWidth="0.5" opacity="0.4" />
                  <line x1="20" y1="4" x2="16" y2="8" stroke="#4f8ef7" strokeWidth="0.5" opacity="0.4" />
                </svg>
              </div>
              <div className="absolute -inset-4 bg-gradient-radial from-[#4f8ef7]/10 to-transparent rounded-full" />
            </div>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            <span className="text-[#e8e8f0]">Trade Like an </span>
            <span className="bg-gradient-to-r from-[#4f8ef7] to-[#00d68f] bg-clip-text text-transparent">
              Institution
            </span>
          </h1>

          <p className="text-xl text-[#6b6b80] mb-10 max-w-2xl mx-auto leading-relaxed">
            Institutional-grade AI trading, for everyone.
            Multi-exchange signals, automated risk management, and real-time monitoring — all in one terminal.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/onboard"
              className="group px-8 py-4 bg-gradient-to-r from-[#4f8ef7] to-[#00d68f] text-white font-bold text-lg rounded-xl hover:opacity-90 transition-all hover:scale-105 shadow-lg shadow-[#4f8ef7]/25"
            >
              Start Trading Free
              <span className="ml-2 group-hover:translate-x-1 inline-block transition-transform">→</span>
            </Link>
            <a
              href="#features"
              className="px-8 py-4 bg-[#16161a] border border-[#2a2a35] text-[#e8e8f0] font-semibold text-lg rounded-xl hover:bg-[#1e1e24] transition-colors"
            >
              See How It Works
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-[#16161a] border border-[#2a2a35] rounded-xl p-4">
                <div className="text-2xl font-bold text-[#4f8ef7] font-mono">{stat.value}</div>
                <div className="text-xs text-[#6b6b80] mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#e8e8f0] mb-4">
              Everything You Need to Trade Smarter
            </h2>
            <p className="text-[#6b6b80] text-lg max-w-xl mx-auto">
              Professional trading tools, automated risk management, and AI-powered signals.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-8 card-hover"
                style={{ '--accent': f.color } as React.CSSProperties}
              >
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl mb-6"
                  style={{ background: `${f.color}18`, border: `1px solid ${f.color}30` }}
                >
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold text-[#e8e8f0] mb-3">{f.title}</h3>
                <p className="text-[#6b6b80] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6 bg-[#16161a]/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#e8e8f0] mb-4">
              Up and Running in Minutes
            </h2>
          </div>

          <div className="space-y-6">
            {[
              {
                step: '01',
                title: 'Connect Your Exchange',
                desc: 'Choose from 5 major exchanges and paste your API keys. We encrypt everything with AES-256-GCM.',
                color: '#4f8ef7',
              },
              {
                step: '02',
                title: 'Configure Risk Settings',
                desc: 'Set your risk per trade (0.5%–5%), max positions, and execution mode (manual alerts or fully auto).',
                color: '#00d68f',
              },
              {
                step: '03',
                title: 'Let APEX Trade',
                desc: 'Our AI scans 5 pairs across 4 timeframes every 5 minutes. Positions are monitored every minute.',
                color: '#ffd700',
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-6 items-start">
                <div
                  className="w-12 h-12 rounded-xl font-mono font-bold text-sm flex items-center justify-center shrink-0"
                  style={{ background: `${item.color}18`, border: `1px solid ${item.color}30`, color: item.color }}
                >
                  {item.step}
                </div>
                <div className="pt-2">
                  <h3 className="text-lg font-bold text-[#e8e8f0] mb-1">{item.title}</h3>
                  <p className="text-[#6b6b80]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Link
              href="/onboard"
              className="inline-flex items-center gap-2 px-10 py-5 bg-gradient-to-r from-[#4f8ef7] to-[#00d68f] text-white font-bold text-xl rounded-xl hover:opacity-90 transition-all hover:scale-105 shadow-xl shadow-[#4f8ef7]/20"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Launch APEX Now
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#2a2a35] py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-gradient-to-br from-[#4f8ef7] to-[#00d68f] rounded-lg flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <span className="text-sm font-bold text-[#e8e8f0]">APEX Trading Bot</span>
            </div>
            <p className="text-xs text-[#6b6b80] text-center max-w-md">
              <strong className="text-[#ff4757]">Risk Disclaimer:</strong> Cryptocurrency trading involves substantial risk of loss.
              APEX provides tools and signals only — not financial advice.
              Past performance does not guarantee future results. Trade responsibly.
            </p>
            <p className="text-xs text-[#4a4a5a]">© 2024 APEX. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
