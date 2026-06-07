'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import type { CongressionalDisclosure, MirrorPosition } from '@/lib/types'

type Tab = 'overview' | 'disclosures' | 'positions' | 'config'

interface ModuleConfig {
  enabled: boolean
  alpacaMode: 'paper' | 'live'
  hasAlpacaKey: boolean
  alpacaKeyPreview: string | null
  telegramBotToken?: string
  telegramChatId?: string
  maxAllocationPct: number
  positionSizePct: number
  stopLossPct: number
  trailingStopPct: number
  trailingStopTriggerPct: number
  maxDisclosureDelayDays: number
  minTradeValueUsd: number
}

interface CongressStats {
  activePositions: number
  totalAllocationPct: number
  mtdPnlUsd: number
  newDisclosures: number
}

export default function CongressionalPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [config, setConfig] = useState<ModuleConfig | null>(null)
  const [disclosures, setDisclosures] = useState<CongressionalDisclosure[]>([])
  const [openPositions, setOpenPositions] = useState<MirrorPosition[]>([])
  const [allPositions, setAllPositions] = useState<MirrorPosition[]>([])
  const [stats, setStats] = useState<CongressStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState('')
  const [exchange, setExchange] = useState<string | undefined>()

  // Config form state
  const [alpacaKey, setAlpacaKey] = useState('')
  const [alpacaSecret, setAlpacaSecret] = useState('')
  const [alpacaMode, setAlpacaMode] = useState<'paper' | 'live'>('paper')
  const [telegramToken, setTelegramToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  const [maxAlloc, setMaxAlloc] = useState(30)
  const [posSizePct, setPosSizePct] = useState(5)
  const [stopLoss, setStopLoss] = useState(8)
  const [trailingStop, setTrailingStop] = useState(12)
  const [trailingTrigger, setTrailingTrigger] = useState(15)
  const [maxDelay, setMaxDelay] = useState(45)
  const [minValue, setMinValue] = useState(15000)
  const [showKey, setShowKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/congressional')
      const data = await res.json()
      if (!data.success) {
        router.push('/onboard')
        return
      }
      const { config: cfg, disclosures: disc, openPositions: open, allPositions: all, stats: st } = data.data
      setConfig(cfg)
      setDisclosures(disc || [])
      setOpenPositions(open || [])
      setAllPositions(all || [])
      setStats(st)

      // Sync form state
      setAlpacaMode(cfg.alpacaMode || 'paper')
      setTelegramToken(cfg.telegramBotToken || '')
      setTelegramChatId(cfg.telegramChatId || '')
      setMaxAlloc(cfg.maxAllocationPct ?? 30)
      setPosSizePct(cfg.positionSizePct ?? 5)
      setStopLoss(cfg.stopLossPct ?? 8)
      setTrailingStop(cfg.trailingStopPct ?? 12)
      setTrailingTrigger(cfg.trailingStopTriggerPct ?? 15)
      setMaxDelay(cfg.maxDisclosureDelayDays ?? 45)
      setMinValue(cfg.minTradeValueUsd ?? 15000)

      // Get exchange for navbar
      const settRes = await fetch('/api/settings')
      const settData = await settRes.json()
      if (settData.success) setExchange(settData.data.exchange)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { fetchData() }, [fetchData])

  const handleToggleEnabled = async () => {
    if (!config) return
    const newEnabled = !config.enabled
    setSaving(true)
    try {
      const res = await fetch('/api/congressional', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      })
      const data = await res.json()
      if (data.success) setConfig((prev) => prev ? { ...prev, enabled: newEnabled } : prev)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    setSaveMsg('')
    setSaveError('')
    try {
      const payload: Record<string, unknown> = {
        alpacaMode,
        telegramBotToken: telegramToken,
        telegramChatId,
        maxAllocationPct: maxAlloc,
        positionSizePct: posSizePct,
        stopLossPct: stopLoss,
        trailingStopPct: trailingStop,
        trailingStopTriggerPct: trailingTrigger,
        maxDisclosureDelayDays: maxDelay,
        minTradeValueUsd: minValue,
      }
      if (alpacaKey.trim()) payload.alpacaApiKey = alpacaKey.trim()
      if (alpacaSecret.trim()) payload.alpacaSecretKey = alpacaSecret.trim()

      const res = await fetch('/api/congressional', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.success) {
        setSaveError(data.error || 'Save failed')
        return
      }
      setConfig((prev) => prev ? { ...prev, ...data.data } : data.data)
      setAlpacaKey('')
      setAlpacaSecret('')
      setSaveMsg('Configuration saved successfully')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch {
      setSaveError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const signalStars = (strength: number) =>
    '⭐'.repeat(strength) + '☆'.repeat(5 - strength)

  const partyColor = (party: string) => {
    if (party === 'D' || party === 'Democrat') return '#4f8ef7'
    if (party === 'R' || party === 'Republican') return '#ff4757'
    return '#ffd700'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0f] flex">
        <Navbar />
        <main className="lg:ml-64 flex-1 p-6 pt-20 lg:pt-6 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#2a2a35] border-t-[#4f8ef7] rounded-full animate-spin" />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d0d0f] flex">
      <Navbar exchange={exchange} />

      <main className="lg:ml-64 flex-1 p-4 lg:p-6 pt-20 lg:pt-6 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🏛️</span>
              <h1 className="text-2xl font-bold text-[#e8e8f0]">Congressional Trade Intelligence</h1>
            </div>
            <p className="text-sm text-[#6b6b80]">
              Mirror US Congress STOCK Act disclosures via Alpaca. Legal — publicly required.
            </p>
          </div>

          {/* Enable / Disable toggle */}
          <button
            onClick={handleToggleEnabled}
            disabled={saving}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              config?.enabled
                ? 'bg-[#00d68f]/15 text-[#00d68f] border border-[#00d68f]/30 hover:bg-[#00d68f]/25'
                : 'bg-[#2a2a35] text-[#6b6b80] border border-[#2a2a35] hover:border-[#3a3a48]'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${config?.enabled ? 'bg-[#00d68f] animate-pulse' : 'bg-[#4a4a5a]'}`} />
            {config?.enabled ? 'Module Active' : 'Module Inactive'}
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'Active Positions',
              value: String(stats?.activePositions ?? 0),
              sub: 'mirror trades open',
              color: '#4f8ef7',
            },
            {
              label: 'Total Allocation',
              value: `${(stats?.totalAllocationPct ?? 0).toFixed(1)}%`,
              sub: `of ${config?.maxAllocationPct ?? 30}% max`,
              color: '#ffd700',
            },
            {
              label: 'MTD P&L',
              value: `${(stats?.mtdPnlUsd ?? 0) >= 0 ? '+' : ''}$${(stats?.mtdPnlUsd ?? 0).toFixed(2)}`,
              sub: 'this month',
              color: (stats?.mtdPnlUsd ?? 0) >= 0 ? '#00d68f' : '#ff4757',
            },
            {
              label: 'New Disclosures',
              value: String(stats?.newDisclosures ?? 0),
              sub: 'last 24 hours',
              color: '#00d68f',
            },
          ].map((card) => (
            <div key={card.label} className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-5">
              <div className="text-xs text-[#6b6b80] mb-1">{card.label}</div>
              <div className="text-2xl font-bold font-mono" style={{ color: card.color }}>
                {card.value}
              </div>
              <div className="text-xs text-[#4a4a5a] mt-0.5">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#16161a] border border-[#2a2a35] p-1 rounded-xl w-fit">
          {(['overview', 'disclosures', 'positions', 'config'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'bg-[#4f8ef7]/20 text-[#4f8ef7]'
                  : 'text-[#6b6b80] hover:text-[#e8e8f0]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ──────────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Alpaca mode badge */}
            {config?.hasAlpacaKey && (
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    config.alpacaMode === 'live'
                      ? 'bg-[#ff4757]/15 text-[#ff4757] border border-[#ff4757]/30'
                      : 'bg-[#ffd700]/15 text-[#ffd700] border border-[#ffd700]/30'
                  }`}
                >
                  {config.alpacaMode === 'live' ? '🔴 LIVE TRADING' : '📄 PAPER MODE'}
                </span>
                {config.alpacaKeyPreview && (
                  <span className="text-xs text-[#4a4a5a] font-mono">
                    Key: {config.alpacaKeyPreview}
                  </span>
                )}
              </div>
            )}

            {!config?.hasAlpacaKey && (
              <div className="bg-[#ffd700]/10 border border-[#ffd700]/30 rounded-xl p-4 flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <p className="font-semibold text-[#ffd700] text-sm mb-1">Alpaca Account Required</p>
                  <p className="text-sm text-[#e8e8f0]">
                    Configure your Alpaca API keys in the Config tab to enable auto-execution.
                    The module will still track disclosures without an account.
                  </p>
                  <button
                    onClick={() => setTab('config')}
                    className="mt-2 text-xs text-[#4f8ef7] hover:underline"
                  >
                    Go to Config →
                  </button>
                </div>
              </div>
            )}

            {/* Latest disclosures preview */}
            <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#2a2a35] flex items-center justify-between">
                <h3 className="font-semibold text-[#e8e8f0]">
                  Latest Disclosures
                  <span className="ml-2 text-xs bg-[#4f8ef7]/20 text-[#4f8ef7] px-2 py-0.5 rounded-full">
                    {disclosures.length}
                  </span>
                </h3>
                <button
                  onClick={() => setTab('disclosures')}
                  className="text-xs text-[#4f8ef7] hover:underline"
                >
                  View all →
                </button>
              </div>

              {disclosures.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-[#6b6b80] text-sm">No disclosures fetched yet</p>
                  <p className="text-[#4a4a5a] text-xs mt-1">
                    The cron runs weekdays at 9:00 AM ET
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#2a2a35]">
                  {disclosures.slice(0, 5).map((d) => (
                    <div key={d.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: partyColor(d.party) }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#e8e8f0] text-sm">
                              ${d.ticker}
                            </span>
                            <span className="text-xs text-[#4a4a5a] truncate">{d.company}</span>
                          </div>
                          <div className="text-xs text-[#6b6b80] truncate">{d.politician}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono text-[#00d68f]">BUY</span>
                        <span className="text-xs" title={`${d.signalStrength}/5 signal`}>
                          {signalStars(d.signalStrength)}
                        </span>
                        <span className="text-xs text-[#4a4a5a]">{d.disclosureDelay}d lag</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Open mirror positions preview */}
            {openPositions.length > 0 && (
              <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#2a2a35] flex items-center justify-between">
                  <h3 className="font-semibold text-[#e8e8f0]">
                    Active Mirror Positions
                    <span className="ml-2 text-xs bg-[#00d68f]/20 text-[#00d68f] px-2 py-0.5 rounded-full">
                      {openPositions.length}
                    </span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-[#6b6b80] border-b border-[#2a2a35]">
                        <th className="text-left px-5 py-2">Ticker</th>
                        <th className="text-right px-3 py-2">Entry</th>
                        <th className="text-right px-3 py-2">Current</th>
                        <th className="text-right px-5 py-2">P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2a35]">
                      {openPositions.map((pos) => {
                        const pnl = pos.pnlPct ?? 0
                        return (
                          <tr key={pos.id}>
                            <td className="px-5 py-3">
                              <div className="font-mono font-bold text-[#e8e8f0]">${pos.ticker}</div>
                              <div className="text-xs text-[#6b6b80] truncate max-w-[140px]">
                                {pos.politician}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-[#6b6b80]">
                              ${pos.entryPrice.toFixed(2)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-[#e8e8f0]">
                              ${pos.currentPrice.toFixed(2)}
                            </td>
                            <td
                              className="px-5 py-3 text-right font-mono font-bold"
                              style={{ color: pnl >= 0 ? '#00d68f' : '#ff4757' }}
                            >
                              {pnl >= 0 ? '+' : ''}
                              {pnl.toFixed(2)}%
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Disclosures Tab ───────────────────────────────────────────────────── */}
        {tab === 'disclosures' && (
          <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2a2a35]">
              <h3 className="font-semibold text-[#e8e8f0]">
                Congressional Disclosures
                <span className="ml-2 text-xs bg-[#4f8ef7]/20 text-[#4f8ef7] px-2 py-0.5 rounded-full">
                  {disclosures.length}
                </span>
              </h3>
              <p className="text-xs text-[#6b6b80] mt-1">BUY trades from STOCK Act mandatory filings</p>
            </div>

            {disclosures.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-4xl mb-4">🏛️</div>
                <p className="text-[#6b6b80] text-sm">No disclosures yet</p>
                <p className="text-[#4a4a5a] text-xs mt-1">Check back after the weekday 9AM ET cron runs</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-[#6b6b80] border-b border-[#2a2a35]">
                      <th className="text-left px-5 py-3">Politician</th>
                      <th className="text-left px-3 py-3">Ticker</th>
                      <th className="text-left px-3 py-3 hidden md:table-cell">Committees</th>
                      <th className="text-right px-3 py-3 hidden sm:table-cell">Value</th>
                      <th className="text-right px-3 py-3">Lag</th>
                      <th className="text-right px-5 py-3">Signal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a35]">
                    {disclosures.map((d) => (
                      <tr key={d.id} className="hover:bg-[#1e1e24] transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs font-bold px-1.5 py-0.5 rounded"
                              style={{
                                color: partyColor(d.party),
                                background: partyColor(d.party) + '20',
                              }}
                            >
                              {d.party}
                            </span>
                            <div>
                              <div className="text-[#e8e8f0] font-medium text-xs">{d.politician}</div>
                              <div className="text-xs text-[#4a4a5a]">{d.state}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono font-bold text-[#e8e8f0]">${d.ticker}</div>
                          <div className="text-xs text-[#4a4a5a] truncate max-w-[100px]">{d.company}</div>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {d.committees.slice(0, 2).map((c, i) => (
                              <span
                                key={i}
                                className="text-xs bg-[#2a2a35] text-[#6b6b80] px-1.5 py-0.5 rounded"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right hidden sm:table-cell">
                          <span className="text-xs text-[#6b6b80] font-mono">
                            ${(d.estimatedValueMin / 1000).toFixed(0)}k+
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span
                            className={`text-xs font-mono font-bold ${
                              d.disclosureDelay <= 20
                                ? 'text-[#00d68f]'
                                : d.disclosureDelay <= 35
                                ? 'text-[#ffd700]'
                                : 'text-[#6b6b80]'
                            }`}
                          >
                            {d.disclosureDelay}d
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="text-xs">{signalStars(d.signalStrength)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Positions Tab ─────────────────────────────────────────────────────── */}
        {tab === 'positions' && (
          <div className="space-y-4">
            {/* Open positions */}
            <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#2a2a35]">
                <h3 className="font-semibold text-[#e8e8f0]">
                  Open Mirror Positions
                  {openPositions.length > 0 && (
                    <span className="ml-2 text-xs bg-[#00d68f]/20 text-[#00d68f] px-2 py-0.5 rounded-full">
                      {openPositions.length}
                    </span>
                  )}
                </h3>
              </div>

              {openPositions.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-[#6b6b80] text-sm">No open mirror positions</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-[#6b6b80] border-b border-[#2a2a35]">
                        <th className="text-left px-5 py-3">Ticker</th>
                        <th className="text-left px-3 py-3 hidden md:table-cell">Politician</th>
                        <th className="text-right px-3 py-3">Entry</th>
                        <th className="text-right px-3 py-3">Current</th>
                        <th className="text-right px-3 py-3">P&L</th>
                        <th className="text-right px-5 py-3 hidden sm:table-cell">Alloc</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2a35]">
                      {openPositions.map((pos) => {
                        const pnl = pos.pnlPct ?? 0
                        return (
                          <tr key={pos.id} className="hover:bg-[#1e1e24] transition-colors">
                            <td className="px-5 py-3">
                              <div className="font-mono font-bold text-[#e8e8f0]">${pos.ticker}</div>
                              <div className="text-xs text-[#4a4a5a]">{pos.shares} shares</div>
                            </td>
                            <td className="px-3 py-3 hidden md:table-cell">
                              <div className="text-xs text-[#e8e8f0]">{pos.politician}</div>
                              <div className="text-xs text-[#4a4a5a]">
                                {signalStars(pos.signalStrength)}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-[#6b6b80]">
                              ${pos.entryPrice.toFixed(2)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-[#e8e8f0]">
                              ${pos.currentPrice.toFixed(2)}
                            </td>
                            <td
                              className="px-3 py-3 text-right font-mono font-bold"
                              style={{ color: pnl >= 0 ? '#00d68f' : '#ff4757' }}
                            >
                              {pnl >= 0 ? '+' : ''}
                              {pnl.toFixed(2)}%
                              {pos.trailingStopActivated && (
                                <div className="text-xs text-[#ffd700] font-normal">trailing ↑</div>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right hidden sm:table-cell">
                              <span className="text-xs font-mono text-[#4f8ef7]">
                                {pos.allocationPct.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Closed positions */}
            {allPositions.filter((p) => p.status === 'closed').length > 0 && (
              <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[#2a2a35]">
                  <h3 className="font-semibold text-[#e8e8f0]">Closed Positions</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-[#6b6b80] border-b border-[#2a2a35]">
                        <th className="text-left px-5 py-3">Ticker</th>
                        <th className="text-right px-3 py-3">P&L</th>
                        <th className="text-right px-3 py-3 hidden sm:table-cell">Close Reason</th>
                        <th className="text-right px-5 py-3 hidden md:table-cell">Closed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2a35]">
                      {allPositions
                        .filter((p) => p.status === 'closed')
                        .map((pos) => {
                          const pnl = pos.pnlPct ?? 0
                          return (
                            <tr key={pos.id}>
                              <td className="px-5 py-3">
                                <span className="font-mono font-bold text-[#e8e8f0]">${pos.ticker}</span>
                              </td>
                              <td
                                className="px-3 py-3 text-right font-mono font-bold"
                                style={{ color: pnl >= 0 ? '#00d68f' : '#ff4757' }}
                              >
                                {pnl >= 0 ? '+' : ''}
                                {pnl.toFixed(2)}%
                              </td>
                              <td className="px-3 py-3 text-right hidden sm:table-cell">
                                <span className="text-xs text-[#6b6b80] capitalize">
                                  {pos.closeReason?.replace('_', ' ') || '—'}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right hidden md:table-cell">
                                <span className="text-xs text-[#4a4a5a]">
                                  {pos.closedAt
                                    ? new Date(pos.closedAt).toLocaleDateString()
                                    : '—'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Config Tab ────────────────────────────────────────────────────────── */}
        {tab === 'config' && (
          <div className="max-w-2xl space-y-4">
            {/* Alpaca credentials */}
            <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-6">
              <h3 className="font-semibold text-[#e8e8f0] mb-1">Alpaca Account</h3>
              <p className="text-xs text-[#6b6b80] mb-5">
                Alpaca is a US stock broker with a free paper trading API. Required for auto-execution.
              </p>

              {config?.hasAlpacaKey && (
                <div className="bg-[#00d68f]/10 border border-[#00d68f]/20 rounded-xl p-3 mb-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00d68f]" />
                  <span className="text-xs text-[#00d68f]">
                    Account connected — key: {config.alpacaKeyPreview || '●●●●'}
                  </span>
                </div>
              )}

              {/* API Key */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#6b6b80] mb-1.5">
                    {config?.hasAlpacaKey ? 'New API Key (leave blank to keep current)' : 'API Key'}
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={alpacaKey}
                      onChange={(e) => setAlpacaKey(e.target.value)}
                      placeholder="PK..."
                      className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-2.5 pr-10 font-mono text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b80] hover:text-[#e8e8f0]"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {showKey
                          ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                          : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#6b6b80] mb-1.5">
                    {config?.hasAlpacaKey ? 'New Secret Key (leave blank to keep current)' : 'Secret Key'}
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={alpacaSecret}
                      onChange={(e) => setAlpacaSecret(e.target.value)}
                      placeholder="SK..."
                      className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-2.5 pr-10 font-mono text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b80] hover:text-[#e8e8f0]"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {showSecret
                          ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                          : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Trading mode */}
                <div>
                  <label className="block text-xs font-medium text-[#6b6b80] mb-2">Trading Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['paper', 'live'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setAlpacaMode(mode)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          alpacaMode === mode
                            ? mode === 'live'
                              ? 'border-[#ff4757] bg-[#ff4757]/10'
                              : 'border-[#ffd700] bg-[#ffd700]/10'
                            : 'border-[#2a2a35] hover:border-[#3a3a48]'
                        }`}
                      >
                        <div className="font-semibold text-sm capitalize" style={{
                          color: alpacaMode === mode
                            ? mode === 'live' ? '#ff4757' : '#ffd700'
                            : '#e8e8f0'
                        }}>
                          {mode === 'live' ? '🔴 Live Trading' : '📄 Paper Mode'}
                        </div>
                        <p className="text-xs text-[#6b6b80] mt-1">
                          {mode === 'live'
                            ? 'Real money — use with caution'
                            : 'Simulated trades — safe to test'}
                        </p>
                      </button>
                    ))}
                  </div>
                  {alpacaMode === 'live' && (
                    <div className="mt-3 p-3 bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-lg">
                      <p className="text-xs text-[#ff4757]">
                        ⚠️ Live mode executes real orders with real money. Start with paper mode first.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Telegram notifications */}
            <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-6">
              <h3 className="font-semibold text-[#e8e8f0] mb-1">Telegram Alerts</h3>
              <p className="text-xs text-[#6b6b80] mb-5">
                Daily brief at 9:15 AM ET with new disclosures and portfolio snapshot.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#6b6b80] mb-1.5">Bot Token</label>
                  <input
                    type="text"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="1234567890:AAABBBCCC..."
                    className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-2.5 font-mono text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6b6b80] mb-1.5">Chat ID</label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="-100123456789"
                    className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-2.5 font-mono text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Risk parameters */}
            <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-6">
              <h3 className="font-semibold text-[#e8e8f0] mb-5">Risk Parameters</h3>
              <div className="space-y-5">
                {[
                  { label: 'Max Congressional Allocation', value: maxAlloc, set: setMaxAlloc, min: 5, max: 50, step: 5, unit: '%', color: '#4f8ef7', hint: 'Max % of portfolio for all mirror trades combined' },
                  { label: 'Position Size per Trade', value: posSizePct, set: setPosSizePct, min: 1, max: 15, step: 0.5, unit: '%', color: '#00d68f', hint: 'Default allocation per mirror trade' },
                  { label: 'Stop Loss', value: stopLoss, set: setStopLoss, min: 3, max: 20, step: 1, unit: '%', color: '#ff4757', hint: 'Hard stop loss from entry price' },
                  { label: 'Trailing Stop', value: trailingStop, set: setTrailingStop, min: 5, max: 25, step: 1, unit: '%', color: '#ffd700', hint: 'Trailing stop activated after trigger' },
                  { label: 'Trailing Stop Trigger', value: trailingTrigger, set: setTrailingTrigger, min: 5, max: 30, step: 1, unit: '%', color: '#ffd700', hint: 'Profit level that activates trailing stop' },
                  { label: 'Max Disclosure Delay', value: maxDelay, set: setMaxDelay, min: 10, max: 60, step: 5, unit: 'd', color: '#6b6b80', hint: 'Ignore disclosures older than this' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between mb-2">
                      <label className="text-sm text-[#e8e8f0]">{item.label}</label>
                      <span className="font-mono font-bold text-sm" style={{ color: item.color }}>
                        {item.value}{item.unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={item.min}
                      max={item.max}
                      step={item.step}
                      value={item.value}
                      onChange={(e) => item.set(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-xs text-[#4a4a5a] mt-1">{item.hint}</div>
                  </div>
                ))}

                {/* Min trade value */}
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm text-[#e8e8f0]">Min Trade Value to Track</label>
                    <span className="font-mono font-bold text-sm text-[#6b6b80]">
                      ${minValue.toLocaleString()}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1000}
                    max={100000}
                    step={1000}
                    value={minValue}
                    onChange={(e) => setMinValue(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-[#4a4a5a] mt-1">
                    Filter out small congressional trades (noise)
                  </div>
                </div>
              </div>
            </div>

            {/* Save button */}
            {saveError && (
              <div className="bg-[#ff4757]/10 border border-[#ff4757]/20 rounded-xl p-4 text-sm text-[#ff4757]">
                {saveError}
              </div>
            )}
            {saveMsg && (
              <div className="bg-[#00d68f]/10 border border-[#00d68f]/20 rounded-xl p-4 text-sm text-[#00d68f]">
                ✓ {saveMsg}
              </div>
            )}

            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="w-full py-3.5 bg-[#4f8ef7] hover:bg-[#6aa0f9] text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>

            {/* Info callout */}
            <div className="bg-[#2a2a35]/50 border border-[#2a2a35] rounded-xl p-4">
              <p className="text-xs text-[#6b6b80] leading-relaxed">
                <strong className="text-[#e8e8f0]">Legal notice:</strong> This module mirrors publicly
                disclosed trades under the STOCK Act of 2012. All data is sourced from mandatory
                government filings and Capitol Trades. This is not financial advice.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
