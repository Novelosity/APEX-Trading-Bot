'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const EXCHANGE_DEPOSIT_URLS: Record<string, { usdt: string; name: string; emoji: string; color: string }> = {
  binance:  { usdt: 'https://www.binance.com/en/my/wallet/account/main/deposit/crypto/USDT', name: 'Binance', emoji: '🟡', color: '#F0B90B' },
  bybit:    { usdt: 'https://www.bybit.com/user/assets/deposit', name: 'Bybit', emoji: '🟠', color: '#F7A600' },
  okx:      { usdt: 'https://www.okx.com/balance/recharge', name: 'OKX', emoji: '⚫', color: '#FFFFFF' },
  kraken:   { usdt: 'https://www.kraken.com/u/funding/deposit', name: 'Kraken', emoji: '🔵', color: '#5741D9' },
  kucoin:   { usdt: 'https://www.kucoin.com/assets/recharge/USDT', name: 'KuCoin', emoji: '🟢', color: '#24AE8F' },
}

interface BalanceData {
  free: number
  used: number
  total: number
}

export default function DepositPage() {
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [exchange, setExchange] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await fetch('/api/balance')
        const data = await res.json()
        if (data.success) {
          setBalance(data.data)
          setExchange(data.exchange || '')
        } else {
          setError(data.error || 'Failed to load balance')
        }
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }
    fetchBalance()
  }, [])

  const exchangeInfo = EXCHANGE_DEPOSIT_URLS[exchange]

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#e8e8f0]">
      {/* Header */}
      <div className="border-b border-[#2a2a35] px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-[#4f8ef7] to-[#00d68f] rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span className="font-bold text-[#e8e8f0]">APEX</span>
        </Link>
        <Link href="/dashboard" className="text-sm text-[#6b6b80] hover:text-[#e8e8f0] transition-colors flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-1">Deposit Funds</h1>
        <p className="text-[#6b6b80] mb-8">Add USDT to your exchange account to start trading.</p>

        {/* Current Balance */}
        <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#e8e8f0]">Current Balance</h2>
            {exchangeInfo && (
              <span className="text-sm font-medium" style={{ color: exchangeInfo.color }}>
                {exchangeInfo.emoji} {exchangeInfo.name}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[#6b6b80]">
              <div className="w-4 h-4 border-2 border-[#4f8ef7]/30 border-t-[#4f8ef7] rounded-full animate-spin" />
              Loading balance...
            </div>
          ) : error ? (
            <p className="text-[#ff4757] text-sm">{error}</p>
          ) : balance ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[#6b6b80] mb-1">Available</p>
                <p className="text-2xl font-bold text-[#00d68f] font-mono">
                  ${balance.free.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6b6b80] mb-1">In Positions</p>
                <p className="text-2xl font-bold text-[#ffd700] font-mono">
                  ${balance.used.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6b6b80] mb-1">Total</p>
                <p className="text-2xl font-bold text-[#e8e8f0] font-mono">
                  ${balance.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Deposit Instructions */}
        <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-[#e8e8f0] mb-4">How to Deposit</h2>
          <ol className="space-y-4">
            {[
              { n: '1', text: 'Click the button below to open your exchange deposit page', color: '#4f8ef7' },
              { n: '2', text: 'Select USDT and choose a network (TRC20 is cheapest, ERC20 is most compatible)', color: '#00d68f' },
              { n: '3', text: 'Copy your deposit address and send funds from your wallet or another exchange', color: '#ffd700' },
              { n: '4', text: 'Wait for confirmation (usually 1–5 minutes). APEX will automatically detect your new balance.', color: '#ff4757' },
            ].map((step) => (
              <li key={step.n} className="flex gap-4 items-start">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                  style={{ background: `${step.color}20`, color: step.color, border: `1px solid ${step.color}40` }}
                >
                  {step.n}
                </div>
                <p className="text-sm text-[#c0c0d0] pt-1">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Warning */}
        <div className="bg-[#ffd700]/10 border border-[#ffd700]/30 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold text-[#ffd700] text-sm mb-1">Important</p>
              <p className="text-xs text-[#e8e8f0]">
                APEX does not process deposits directly — funds go to your exchange account.
                Only send USDT or the exchange&apos;s supported stablecoins. Never send funds to unknown addresses.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        {exchangeInfo ? (
          <a
            href={exchangeInfo.usdt}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 flex items-center justify-center gap-3 font-bold text-lg rounded-xl transition-all hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${exchangeInfo.color}22, ${exchangeInfo.color}44)`, border: `1px solid ${exchangeInfo.color}60`, color: exchangeInfo.color }}
          >
            {exchangeInfo.emoji} Deposit on {exchangeInfo.name}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        ) : (
          <div className="w-full py-4 text-center text-[#6b6b80] bg-[#16161a] border border-[#2a2a35] rounded-xl">
            Loading exchange info...
          </div>
        )}
      </div>
    </div>
  )
}
