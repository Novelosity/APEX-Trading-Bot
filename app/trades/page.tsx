'use client'

import { useState, useEffect, useCallback } from 'react'
import { Navbar } from '@/components/Navbar'
import { StatusBadge } from '@/components/StatusBadge'
import { PnLChart } from '@/components/PnLChart'
import type { Trade, ChartDataPoint } from '@/lib/types'

type FilterType = 'all' | 'open' | 'closed' | 'long' | 'short'

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [exchange, setExchange] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, positionsRes, allTradesRes, chartRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/positions'),
        fetch('/api/positions'), // We'll use positions for open and combine
        fetch('/api/chart?period=30d'),
      ])

      const [settingsData, posData, chartResData] = await Promise.all([
        settingsRes.json(),
        positionsRes.json(),
        allTradesRes.json(),
        chartRes.json(),
      ])

      if (settingsData.success) setExchange(settingsData.data.exchange)
      if (posData.success) setTrades(posData.data || [])
      if (chartResData.success) setChartData(chartResData.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredTrades = trades.filter((t) => {
    if (filter === 'all') return true
    if (filter === 'open') return t.status === 'open'
    if (filter === 'closed') return t.status === 'closed'
    if (filter === 'long') return t.direction === 'long'
    if (filter === 'short') return t.direction === 'short'
    return true
  })

  const closedTrades = trades.filter((t) => t.status === 'closed')
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnlUsd || 0), 0)
  const winCount = closedTrades.filter((t) => (t.pnlUsd || 0) >= 0).length
  const _lossCount = closedTrades.filter((t) => (t.pnlUsd || 0) < 0).length
  const winRate = closedTrades.length > 0 ? Math.round((winCount / closedTrades.length) * 100) : 0
  const bestTrade = closedTrades.reduce<Trade | null>((best, t) => !best || (t.pnlUsd || 0) > (best.pnlUsd || 0) ? t : best, null)
  const worstTrade = closedTrades.reduce<Trade | null>((worst, t) => !worst || (t.pnlUsd || 0) < (worst.pnlUsd || 0) ? t : worst, null)

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'closed', label: 'Closed' },
    { key: 'long', label: 'Long' },
    { key: 'short', label: 'Short' },
  ]

  return (
    <div className="min-h-screen bg-[#0d0d0f] flex">
      <Navbar exchange={exchange} />

      <main className="lg:ml-64 flex-1 p-4 lg:p-6 pt-20 lg:pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#e8e8f0]">Trade History</h1>
          <p className="text-sm text-[#6b6b80]">All your trading activity</p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total Trades', value: String(trades.length), color: '#4f8ef7' },
            { label: 'Win Rate', value: `${winRate}%`, color: winRate >= 50 ? '#00d68f' : '#ff4757' },
            {
              label: 'Total P&L',
              value: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`,
              color: totalPnl >= 0 ? '#00d68f' : '#ff4757',
            },
            {
              label: 'Best Trade',
              value: bestTrade ? `+$${(bestTrade.pnlUsd || 0).toFixed(2)}` : '—',
              color: '#00d68f',
            },
            {
              label: 'Worst Trade',
              value: worstTrade ? `$${(worstTrade.pnlUsd || 0).toFixed(2)}` : '—',
              color: '#ff4757',
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-4">
              <div className="text-xs text-[#6b6b80] mb-1">{stat.label}</div>
              <div className="font-mono font-bold text-lg" style={{ color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* P&L Chart */}
        {chartData.length > 0 && (
          <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-5 mb-6">
            <h3 className="font-semibold text-[#e8e8f0] mb-4">30-Day P&L Chart</h3>
            <PnLChart data={chartData} type="cumulative" height={200} />
          </div>
        )}

        {/* Filters + Table */}
        <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2a2a35] flex items-center gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-[#4f8ef7]/20 text-[#4f8ef7]'
                    : 'text-[#6b6b80] hover:text-[#e8e8f0] hover:bg-[#1e1e24]'
                }`}
              >
                {f.label}
                {f.key === 'all' && (
                  <span className="ml-1.5 text-xs bg-[#2a2a35] text-[#6b6b80] px-1.5 py-0.5 rounded-full">
                    {trades.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-8 text-center text-[#6b6b80]">
              <div className="w-6 h-6 border-2 border-[#2a2a35] border-t-[#4f8ef7] rounded-full animate-spin mx-auto mb-2" />
              Loading trades...
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-[#2a2a35] rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b6b80" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <p className="text-[#6b6b80]">No trades found</p>
              <p className="text-[#4a4a5a] text-sm mt-1">
                {filter === 'all' ? 'Your trades will appear here once you start trading' : `No ${filter} trades found`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Pair</th>
                    <th>Direction</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Size</th>
                    <th>P&L USD</th>
                    <th>P&L %</th>
                    <th>Close Reason</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((trade, idx) => {
                    const pnlUsd = trade.pnlUsd || 0
                    const pnlPct = trade.pnlPct || 0
                    const isProfit = pnlUsd >= 0

                    return (
                      <tr key={trade.id} className="hover:bg-[#1a1a20] transition-colors">
                        <td className="text-[#4a4a5a] font-mono text-xs">{idx + 1}</td>
                        <td className="font-mono font-semibold text-[#e8e8f0]">{trade.pair}</td>
                        <td>
                          <StatusBadge status={trade.direction} />
                        </td>
                        <td className="font-mono text-sm text-[#e8e8f0]">
                          ${trade.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="font-mono text-sm text-[#6b6b80]">
                          {trade.exitPrice
                            ? `$${trade.exitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="font-mono text-sm text-[#6b6b80]">
                          ${trade.positionSize.toFixed(0)}
                        </td>
                        <td
                          className={`font-mono font-semibold text-sm ${
                            trade.status === 'open'
                              ? 'text-[#6b6b80]'
                              : isProfit
                              ? 'text-[#00d68f]'
                              : 'text-[#ff4757]'
                          }`}
                        >
                          {trade.status === 'open'
                            ? '—'
                            : `${isProfit ? '+' : ''}$${pnlUsd.toFixed(2)}`}
                        </td>
                        <td
                          className={`font-mono text-sm ${
                            trade.status === 'open'
                              ? 'text-[#6b6b80]'
                              : isProfit
                              ? 'text-[#00d68f]'
                              : 'text-[#ff4757]'
                          }`}
                        >
                          {trade.status === 'open'
                            ? '—'
                            : `${isProfit ? '+' : ''}${pnlPct.toFixed(2)}%`}
                        </td>
                        <td className="text-[#6b6b80] text-xs capitalize">
                          {trade.closeReason || '—'}
                        </td>
                        <td>
                          <StatusBadge status={trade.status} />
                        </td>
                        <td className="text-[#6b6b80] text-xs font-mono whitespace-nowrap">
                          {new Date(trade.openedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
