'use client'

import { useState } from 'react'

const PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'LTC/USDT', 'BNB/USDT']

interface TradeFormProps {
  onTradeExecuted: () => void
  onCloseAll: () => void
  hasOpenTrades: boolean
}

export function TradeForm({ onTradeExecuted, onCloseAll, hasOpenTrades }: TradeFormProps) {
  const [pair, setPair] = useState('BTC/USDT')
  const [direction, setDirection] = useState<'long' | 'short' | null>(null)
  const [loading, setLoading] = useState(false)
  const [closingAll, setClosingAll] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleTrade = async () => {
    if (!direction) {
      setError('Please select a direction (Long or Short)')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair, direction, action: 'open' }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Trade failed')
        return
      }
      setSuccess(`${direction.toUpperCase()} ${pair} opened successfully`)
      setDirection(null)
      onTradeExecuted()
      setTimeout(() => setSuccess(''), 4000)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const handleCloseAll = async () => {
    if (!confirm('Close all open positions?')) return
    setClosingAll(true)
    setError('')
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close_all' }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Failed to close positions')
        return
      }
      setSuccess(`Closed ${data.data.closed} positions`)
      onCloseAll()
      setTimeout(() => setSuccess(''), 4000)
    } catch {
      setError('Network error')
    } finally {
      setClosingAll(false)
    }
  }

  return (
    <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-5">
      <h3 className="font-semibold text-[#e8e8f0] mb-4">Quick Trade</h3>

      {/* Pair selector */}
      <div className="mb-4">
        <label className="text-xs text-[#6b6b80] font-medium mb-2 block">Trading Pair</label>
        <div className="grid grid-cols-3 gap-1.5">
          {PAIRS.map((p) => (
            <button
              key={p}
              onClick={() => setPair(p)}
              className={`py-1.5 text-xs rounded-lg font-mono font-semibold transition-all ${
                pair === p
                  ? 'bg-[#4f8ef7]/20 text-[#4f8ef7] border border-[#4f8ef7]/30'
                  : 'bg-[#0d0d0f] text-[#6b6b80] border border-[#2a2a35] hover:border-[#3a3a48] hover:text-[#e8e8f0]'
              }`}
            >
              {p.replace('/USDT', '')}
            </button>
          ))}
        </div>
      </div>

      {/* Direction */}
      <div className="mb-4">
        <label className="text-xs text-[#6b6b80] font-medium mb-2 block">Direction</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDirection(direction === 'long' ? null : 'long')}
            className={`py-3 rounded-xl font-bold text-sm transition-all ${
              direction === 'long'
                ? 'bg-[#00d68f] text-black shadow-[0_0_15px_rgba(0,214,143,0.4)]'
                : 'bg-[#00d68f]/10 text-[#00d68f] border border-[#00d68f]/30 hover:bg-[#00d68f]/20'
            }`}
          >
            ▲ LONG
          </button>
          <button
            onClick={() => setDirection(direction === 'short' ? null : 'short')}
            className={`py-3 rounded-xl font-bold text-sm transition-all ${
              direction === 'short'
                ? 'bg-[#ff4757] text-white shadow-[0_0_15px_rgba(255,71,87,0.4)]'
                : 'bg-[#ff4757]/10 text-[#ff4757] border border-[#ff4757]/30 hover:bg-[#ff4757]/20'
            }`}
          >
            ▼ SHORT
          </button>
        </div>
      </div>

      {/* Error/success */}
      {error && (
        <div className="bg-[#ff4757]/10 border border-[#ff4757]/20 rounded-lg p-3 mb-3 text-xs text-[#ff4757]">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-[#00d68f]/10 border border-[#00d68f]/20 rounded-lg p-3 mb-3 text-xs text-[#00d68f]">
          ✓ {success}
        </div>
      )}

      {/* Execute button */}
      <button
        onClick={handleTrade}
        disabled={loading || !direction}
        className={`w-full py-3 rounded-xl font-bold text-sm transition-all mb-2 flex items-center justify-center gap-2 ${
          direction === 'long'
            ? 'bg-[#00d68f] text-black hover:bg-[#00bf7f] disabled:opacity-50'
            : direction === 'short'
            ? 'bg-[#ff4757] text-white hover:bg-[#ff2d40] disabled:opacity-50'
            : 'bg-[#2a2a35] text-[#4a4a5a] cursor-not-allowed'
        }`}
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        ) : null}
        {loading ? 'Executing...' : `Execute ${direction ? direction.toUpperCase() : 'Trade'}`}
      </button>

      {/* Close all */}
      {hasOpenTrades && (
        <button
          onClick={handleCloseAll}
          disabled={closingAll}
          className="w-full py-2.5 rounded-xl font-semibold text-sm text-[#ff4757] border border-[#ff4757]/30 hover:bg-[#ff4757]/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {closingAll ? (
            <div className="w-4 h-4 border-2 border-[#ff4757]/30 border-t-[#ff4757] rounded-full animate-spin" />
          ) : null}
          {closingAll ? 'Closing...' : 'Close All Positions'}
        </button>
      )}
    </div>
  )
}
