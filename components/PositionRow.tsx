'use client'

import { useState } from 'react'
import type { Trade } from '@/lib/types'

interface PositionRowProps {
  trade: Trade
  currentPrice?: number
  onClose: (tradeId: string) => void
}

export function PositionRow({ trade, currentPrice, onClose }: PositionRowProps) {
  const [closing, setClosing] = useState(false)

  const price = currentPrice || trade.entryPrice
  const pnlPct =
    trade.direction === 'long'
      ? ((price - trade.entryPrice) / trade.entryPrice) * 100
      : ((trade.entryPrice - price) / trade.entryPrice) * 100

  const pnlUsd = (pnlPct / 100) * trade.positionSize
  const isProfit = pnlPct >= 0

  const handleClose = async () => {
    setClosing(true)
    try {
      await onClose(trade.id)
    } finally {
      setClosing(false)
    }
  }

  const timeOpen = trade.openedAt
    ? (() => {
        const diff = Date.now() - new Date(trade.openedAt).getTime()
        const hours = Math.floor(diff / 3600000)
        const mins = Math.floor((diff % 3600000) / 60000)
        if (hours > 0) return `${hours}h ${mins}m`
        return `${mins}m`
      })()
    : '—'

  return (
    <tr className="group hover:bg-[#1a1a20] transition-colors">
      {/* Pair + direction */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-1.5 py-0.5 rounded ${
              trade.direction === 'long'
                ? 'bg-[#00d68f]/15 text-[#00d68f]'
                : 'bg-[#ff4757]/15 text-[#ff4757]'
            }`}
          >
            {trade.direction === 'long' ? '▲' : '▼'}
          </span>
          <span className="font-mono font-semibold text-[#e8e8f0] text-sm">{trade.pair}</span>
        </div>
        <div className="text-xs text-[#6b6b80] mt-0.5">{timeOpen} ago</div>
      </td>

      {/* Entry */}
      <td className="px-4 py-3 font-mono text-sm text-[#e8e8f0]">
        ${trade.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>

      {/* Current */}
      <td className="px-4 py-3 font-mono text-sm text-[#e8e8f0]">
        ${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>

      {/* P&L */}
      <td className="px-4 py-3">
        <div className={`font-mono font-bold text-sm ${isProfit ? 'text-[#00d68f]' : 'text-[#ff4757]'}`}>
          {isProfit ? '+' : ''}${pnlUsd.toFixed(2)}
        </div>
        <div className={`text-xs font-mono ${isProfit ? 'text-[#00d68f]/70' : 'text-[#ff4757]/70'}`}>
          {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
        </div>
      </td>

      {/* TP / SL */}
      <td className="px-4 py-3 hidden md:table-cell">
        <div className="text-xs space-y-0.5">
          <div className="text-[#00d68f]/70 font-mono">
            TP: ${trade.tp1Price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[#ff4757]/70 font-mono">
            SL: ${trade.slPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </td>

      {/* Size */}
      <td className="px-4 py-3 hidden lg:table-cell font-mono text-sm text-[#6b6b80]">
        ${trade.positionSize.toFixed(0)}
      </td>

      {/* Close button */}
      <td className="px-4 py-3">
        <button
          onClick={handleClose}
          disabled={closing}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#ff4757]/30 text-[#ff4757] hover:bg-[#ff4757]/10 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {closing ? (
            <div className="w-3 h-3 border border-[#ff4757]/30 border-t-[#ff4757] rounded-full animate-spin" />
          ) : null}
          {closing ? '...' : 'Close'}
        </button>
      </td>
    </tr>
  )
}
