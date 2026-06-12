'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Navbar } from '@/components/Navbar'
import { BalanceCard } from '@/components/BalanceCard'
import { PnLChart } from '@/components/PnLChart'
import { TradingToggle } from '@/components/TradingToggle'
import { TradeForm } from '@/components/TradeForm'
import { PositionRow } from '@/components/PositionRow'
import { SignalCard } from '@/components/SignalCard'
import { ApprovalQueue } from '@/components/ApprovalQueue'
import type { Trade, Signal, ChartDataPoint } from '@/lib/types'

const LiveChart = dynamic(() => import('@/components/LiveChart').then((m) => ({ default: m.LiveChart })), { ssr: false })

interface Settings {
  exchange: string
  execMode: 'manual' | 'auto' | 'approval'
  riskPct: number
  balancePct: number
  maxPositions: number
  tradingMode: string
  paperMode?: boolean
  email?: string
}

interface Balance {
  total: number
  free: number
  used: number
}

interface BotStateData {
  dailyPnl: number
  weeklyPnl: number
  winCount: number
  lossCount: number
  totalTrades: number
  consecutiveLosses: number
  tradingHalted: boolean
}

interface MetricsData {
  profitFactor: number | null
  maxDrawdownPct: number
  sharpeRatio: number | null
  expectancyUsd: number
  winCount: number
  lossCount: number
  totalTrades: number
  currentStreak: number
  currentStreakType: 'win' | 'loss' | 'none'
  tradingHalted: boolean
  haltReason?: string
  paperMode: boolean
  exchangeHealthy: boolean
}

export default function DashboardPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [openTrades, setOpenTrades] = useState<Trade[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [botState, _setBotState] = useState<BotStateData | null>(null)
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<Signal[]>([])
  const [killSwitchLoading, setKillSwitchLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [lastScan, setLastScan] = useState<Date | null>(null)
  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d'>('30d')
  const [livePrices, setLivePrices] = useState<Record<string, number>>({})

  const fetchPrices = useCallback(async (trades: Trade[]) => {
    const pairs = [...new Set(trades.map((t) => t.pair))]
    if (pairs.length === 0) return
    try {
      const res = await fetch(`/api/prices?pairs=${pairs.map(encodeURIComponent).join(',')}`)
      const data = await res.json()
      if (data.success) setLivePrices(data.data)
    } catch {
      // silent fail
    }
  }, [])

  const fetchAll = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const [settingsRes, positionsRes, signalsRes, chartRes, metricsRes] = await Promise.all([
        fetch('/api/settings?cache=' + Date.now()),
        fetch('/api/positions?cache=' + Date.now()),
        fetch('/api/signals?cache=' + Date.now()),
        fetch(`/api/chart?period=${chartPeriod}&cache=` + Date.now()),
        fetch('/api/metrics?cache=' + Date.now()),
      ])

      const approvalsRes = await fetch('/api/bot/approve')
      const approvalsData = await approvalsRes.json()
      if (approvalsData.success) setPendingApprovals(approvalsData.data || [])

      const [settingsData, positionsData, signalsData, chartResData, metricsData] = await Promise.all([
        settingsRes.json(),
        positionsRes.json(),
        signalsRes.json(),
        chartRes.json(),
        metricsRes.json(),
      ])

      if (!settingsData.success) {
        router.push('/onboard')
        return
      }

      setSettings(settingsData.data)
      if (positionsData.success) {
        const trades = positionsData.data || []
        setOpenTrades(trades)
        fetchPrices(trades)
      }
      if (signalsData.success) setSignals(signalsData.data || [])
      if (chartResData.success) setChartData(chartResData.data || [])
      if (metricsData.success) setMetrics(metricsData.data)
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router, chartPeriod, fetchPrices])

  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true)
    try {
      const res = await fetch('/api/balance')
      const data = await res.json()
      if (data.success) setBalance(data.data)
    } catch {
      // silent fail
    } finally {
      setBalanceLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    fetchBalance()
  }, [fetchAll, fetchBalance])

  // Auto-refresh data every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAll(true)
    }, 15000)
    return () => clearInterval(interval)
  }, [fetchAll])

  // Balance refresh every 60 seconds (slower — expensive call)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchBalance()
    }, 60000)
    return () => clearInterval(interval)
  }, [fetchBalance])

  // Live price refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (openTrades.length > 0) fetchPrices(openTrades)
    }, 10000)
    return () => clearInterval(interval)
  }, [openTrades, fetchPrices])

  // Refetch chart when period changes
  useEffect(() => {
    if (!loading) fetchAll()
  }, [chartPeriod]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when window regains focus (e.g., user returns from settings)
  useEffect(() => {
    const handleFocus = () => {
      fetchAll()
      fetchBalance()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchAll, fetchBalance])

  const handleToggleExecMode = async (mode: 'manual' | 'auto' | 'approval') => {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // Include paperMode so the server never resets it to the default (true) on a partial update
      body: JSON.stringify({ execMode: mode, paperMode: settings?.paperMode ?? false }),
    })
    const data = await res.json()
    if (data.success && data.data) {
      setSettings((prev) => prev ? { ...prev, execMode: data.data.execMode, paperMode: data.data.paperMode } : prev)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    try {
      const res = await fetch('/api/bot/scan', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setLastScan(new Date())
        await fetchAll(true)
      }
    } catch {
      // silent fail
    } finally {
      setScanning(false)
    }
  }

  const handleKillSwitch = async (action: 'halt' | 'resume') => {
    setKillSwitchLoading(true)
    try {
      const res = await fetch('/api/bot/killswitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (data.success) {
        setMetrics((prev) => prev ? { ...prev, tradingHalted: action === 'halt' } : prev)
      }
    } catch {
      // silent fail
    } finally {
      setKillSwitchLoading(false)
    }
  }

  const handleCloseTrade = async (tradeId: string) => {
    const res = await fetch('/api/trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', tradeId }),
    })
    const data = await res.json()
    if (data.success) {
      setOpenTrades((prev) => prev.filter((t) => t.id !== tradeId))
    }
  }

  const winRate = metrics && metrics.totalTrades > 0
    ? Math.round((metrics.winCount / metrics.totalTrades) * 100)
    : botState && botState.totalTrades > 0
    ? Math.round((botState.winCount / botState.totalTrades) * 100)
    : 0

  const isHalted = metrics?.tradingHalted ?? false
  const isPaperMode = settings?.paperMode ?? false

  const totalPnl = chartData.length > 0 ? chartData[chartData.length - 1].cumulative : 0
  const dailyPnl = chartData.length > 0 ? chartData[chartData.length - 1].pnl : 0

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0f] flex">
        <Navbar exchange={undefined} />
        <main className="lg:ml-64 flex-1 p-6 pt-20 lg:pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-5 h-28 skeleton" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[#16161a] border border-[#2a2a35] rounded-2xl h-72 skeleton" />
            <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl h-72 skeleton" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d0d0f] flex">
      <Navbar exchange={settings?.exchange} />

      <main className="lg:ml-64 flex-1 p-4 lg:p-6 pt-20 lg:pt-6 min-w-0">
        {/* Paper mode banner */}
        {isPaperMode && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-[#4f8ef7]/10 border border-[#4f8ef7]/30 rounded-xl">
            <span className="text-lg">🧪</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#4f8ef7]">Paper Trading Mode</p>
              <p className="text-xs text-[#6b6b80]">No real funds at risk. Trades are simulated with virtual balance.</p>
            </div>
            <a href="/settings" className="text-xs text-[#4f8ef7] hover:underline shrink-0">Switch to Live →</a>
          </div>
        )}

        {/* Kill switch banner */}
        {isHalted && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-xl">
            <span className="text-lg">🛑</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#ff4757]">Trading Halted</p>
              <p className="text-xs text-[#6b6b80]">{metrics?.haltReason || 'Emergency stop is active. No new positions will be opened.'}</p>
            </div>
            <button
              onClick={() => handleKillSwitch('resume')}
              disabled={killSwitchLoading}
              className="shrink-0 px-3 py-1.5 bg-[#00d68f] text-black text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Resume Trading
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e8e8f0]">Dashboard</h1>
            <p className="text-sm text-[#6b6b80]">
              {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'Loading...'}
              {refreshing && <span className="ml-2 text-[#4f8ef7]">↻ Refreshing...</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isHalted && (
              <button
                onClick={() => handleKillSwitch('halt')}
                disabled={killSwitchLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-xl text-xs font-semibold text-[#ff4757] hover:bg-[#ff4757]/20 transition-colors disabled:opacity-50"
                title="Emergency stop — halts all new trades"
              >
                🛑 Kill Switch
              </button>
            )}
            <button
              onClick={handleScan}
              disabled={scanning || loading}
              className="flex items-center gap-2 px-4 py-2 bg-[#4f8ef7]/10 border border-[#4f8ef7]/30 rounded-xl text-sm text-[#4f8ef7] hover:bg-[#4f8ef7]/20 transition-colors disabled:opacity-50"
              title={lastScan ? `Last scanned: ${lastScan.toLocaleTimeString()}` : 'Scan all pairs for new signals'}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={scanning ? 'animate-spin' : ''}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {scanning ? 'Scanning...' : 'Scan Now'}
            </button>
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-[#16161a] border border-[#2a2a35] rounded-xl text-sm text-[#6b6b80] hover:text-[#e8e8f0] hover:border-[#3a3a48] transition-colors disabled:opacity-50"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={refreshing ? 'animate-spin' : ''}
              >
                <polyline points="1 4 1 10 7 10" />
                <polyline points="23 20 23 14 17 14" />
                <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <BalanceCard
            title="Total Balance"
            value={
              balance
                ? `$${balance.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                : balanceLoading
                ? 'Loading...'
                : '—'
            }
            subtitle="USDT"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            }
            color="#4f8ef7"
            loading={balanceLoading && !balance}
          />

          <BalanceCard
            title="Daily P&L"
            value={`${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`}
            change={dailyPnl}
            subtitle="today"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            }
            color={dailyPnl >= 0 ? '#00d68f' : '#ff4757'}
          />

          <BalanceCard
            title="Open Positions"
            value={String(openTrades.length)}
            subtitle={`of ${settings?.maxPositions || 5} max`}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            }
            color="#ffd700"
          />

          <BalanceCard
            title="Win Rate"
            value={`${winRate}%`}
            subtitle={`${(botState?.winCount || 0) + (botState?.lossCount || 0)} trades`}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            }
            color={winRate >= 50 ? '#00d68f' : '#ff4757'}
          />
        </div>

        {/* Advanced metrics row */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-4">
              <div className="text-xs text-[#6b6b80] mb-1">Profit Factor</div>
              <div className={`text-xl font-bold font-mono ${metrics.profitFactor === null ? 'text-[#4a4a5a]' : metrics.profitFactor >= 1.5 ? 'text-[#00d68f]' : metrics.profitFactor >= 1 ? 'text-[#ffd700]' : 'text-[#ff4757]'}`}>
                {metrics.profitFactor === null ? '—' : metrics.profitFactor.toFixed(2)}
              </div>
              <div className="text-xs text-[#4a4a5a] mt-0.5">gross profit / loss</div>
            </div>
            <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-4">
              <div className="text-xs text-[#6b6b80] mb-1">Max Drawdown</div>
              <div className={`text-xl font-bold font-mono ${metrics.maxDrawdownPct > 10 ? 'text-[#ff4757]' : metrics.maxDrawdownPct > 5 ? 'text-[#ffd700]' : 'text-[#00d68f]'}`}>
                -{metrics.maxDrawdownPct.toFixed(1)}%
              </div>
              <div className="text-xs text-[#4a4a5a] mt-0.5">peak to trough</div>
            </div>
            <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-4">
              <div className="text-xs text-[#6b6b80] mb-1">Sharpe Ratio</div>
              <div className={`text-xl font-bold font-mono ${metrics.sharpeRatio === null ? 'text-[#4a4a5a]' : metrics.sharpeRatio >= 1 ? 'text-[#00d68f]' : metrics.sharpeRatio >= 0 ? 'text-[#ffd700]' : 'text-[#ff4757]'}`}>
                {metrics.sharpeRatio === null ? '—' : metrics.sharpeRatio.toFixed(2)}
              </div>
              <div className="text-xs text-[#4a4a5a] mt-0.5">annualized</div>
            </div>
            <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-4">
              <div className="text-xs text-[#6b6b80] mb-1">Expectancy</div>
              <div className={`text-xl font-bold font-mono ${metrics.expectancyUsd >= 0 ? 'text-[#00d68f]' : 'text-[#ff4757]'}`}>
                {metrics.expectancyUsd >= 0 ? '+' : ''}${metrics.expectancyUsd.toFixed(2)}
              </div>
              <div className="text-xs text-[#4a4a5a] mt-0.5">per trade avg</div>
            </div>
          </div>
        )}

        {/* Live candlestick chart with indicators */}
        <div className="mb-6">
          <LiveChart pair="BTC/USDT" timeframe="1h" />
        </div>

        {/* Middle row: Chart + Trading controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* P&L Chart */}
          <div className="lg:col-span-2 bg-[#16161a] border border-[#2a2a35] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-[#e8e8f0]">P&L Performance</h3>
                <p className="text-xs text-[#6b6b80] mt-0.5">
                  Cumulative:{' '}
                  <span className={`font-mono font-semibold ${totalPnl >= 0 ? 'text-[#00d68f]' : 'text-[#ff4757]'}`}>
                    {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                  </span>
                </p>
              </div>
              <div className="flex gap-1">
                {(['7d', '30d'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                      chartPeriod === p
                        ? 'bg-[#4f8ef7]/20 text-[#4f8ef7]'
                        : 'text-[#6b6b80] hover:text-[#e8e8f0]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <PnLChart data={chartData} type="cumulative" height={220} />
          </div>

          {/* Trading toggle + Quick trade */}
          <div className="space-y-4">
            {settings && (
              <TradingToggle
                execMode={settings.execMode}
                onToggle={handleToggleExecMode}
              />
            )}
            <TradeForm
              onTradeExecuted={() => {
                fetchAll()
                fetchBalance()
              }}
              onCloseAll={() => {
                fetchAll()
                fetchBalance()
              }}
              hasOpenTrades={openTrades.length > 0}
            />
          </div>
        </div>

        {/* Approval queue — only shown when in approval mode */}
        {settings?.execMode === 'approval' && pendingApprovals.length > 0 && (
          <ApprovalQueue
            signals={pendingApprovals}
            onApproved={() => fetchAll(true)}
          />
        )}

        {/* Bottom row: Positions + Signals */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Open Positions */}
          <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2a2a35] flex items-center justify-between">
              <h3 className="font-semibold text-[#e8e8f0]">
                Open Positions
                {openTrades.length > 0 && (
                  <span className="ml-2 text-xs bg-[#4f8ef7]/20 text-[#4f8ef7] px-2 py-0.5 rounded-full">
                    {openTrades.length}
                  </span>
                )}
              </h3>
            </div>

            {openTrades.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-[#2a2a35] rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b6b80" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <p className="text-[#6b6b80] text-sm">No open positions</p>
                <p className="text-[#4a4a5a] text-xs mt-1">Use Quick Trade or enable Auto mode</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pair</th>
                      <th>Entry</th>
                      <th>Current</th>
                      <th>P&L</th>
                      <th className="hidden md:table-cell">TP / SL</th>
                      <th className="hidden lg:table-cell">Size</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openTrades.map((trade) => (
                      <PositionRow
                        key={trade.id}
                        trade={trade}
                        currentPrice={livePrices[trade.pair]}
                        onClose={handleCloseTrade}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Signals */}
          <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2a2a35] flex items-center justify-between">
              <h3 className="font-semibold text-[#e8e8f0]">
                Recent Signals
                {signals.length > 0 && (
                  <span className="ml-2 text-xs bg-[#ffd700]/20 text-[#ffd700] px-2 py-0.5 rounded-full">
                    {signals.length}
                  </span>
                )}
              </h3>
              {settings?.execMode === 'manual' && (
                <span className="text-xs text-[#6b6b80]">Manual review required</span>
              )}
            </div>

            {signals.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-[#2a2a35] rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b6b80" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <p className="text-[#6b6b80] text-sm">No signals yet</p>
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  className="mt-3 px-4 py-2 bg-[#4f8ef7]/10 border border-[#4f8ef7]/30 rounded-xl text-xs text-[#4f8ef7] hover:bg-[#4f8ef7]/20 transition-colors disabled:opacity-50"
                >
                  {scanning ? 'Scanning...' : 'Scan Now'}
                </button>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {signals.slice(0, 10).map((signal) => (
                  <SignalCard key={signal.id} signal={signal} compact />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
