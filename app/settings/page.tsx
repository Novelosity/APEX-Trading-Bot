'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { ExchangeBadge } from '@/components/ExchangeBadge'
import { EXCHANGES } from '@/lib/exchanges'

interface UserSettings {
  exchange: string
  email?: string
  tradingMode: string
  execMode: 'manual' | 'auto' | 'approval'
  paperMode: boolean
  leverage: number
  balancePct: number
  riskPct: number
  maxPositions: number
  hasApiKey: boolean
  hasPassphrase: boolean
  maskedApiKey?: string
  createdAt: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [disconnecting, setDisconnecting] = useState(false)

  // Credential update state
  const [showCredUpdate, setShowCredUpdate] = useState(false)
  const [newApiKey, setNewApiKey] = useState('')
  const [newApiSecret, setNewApiSecret] = useState('')
  const [newPassphrase, setNewPassphrase] = useState('')
  const [showNewKey, setShowNewKey] = useState(false)
  const [showNewSecret, setShowNewSecret] = useState(false)
  const [showNewPassphrase, setShowNewPassphrase] = useState(false)
  const [credSaving, setCredSaving] = useState(false)
  const [credError, setCredError] = useState('')
  const [credSaved, setCredSaved] = useState(false)

  // Local editable state
  const [execMode, setExecMode] = useState<'manual' | 'auto' | 'approval'>('manual')
  const [paperMode, setPaperMode] = useState(true)
  const [riskPct, setRiskPct] = useState(1)
  const [balancePct, setBalancePct] = useState(100)
  const [maxPositions, setMaxPositions] = useState(5)
  const [leverage, setLeverage] = useState(5)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (!data.success) {
        router.push('/onboard')
        return
      }
      setSettings(data.data)
      setExecMode(data.data.execMode)
      setPaperMode(data.data.paperMode ?? true)
      setRiskPct(data.data.riskPct)
      setBalancePct(data.data.balancePct)
      setMaxPositions(data.data.maxPositions)
      setLeverage(data.data.leverage)
    } catch {
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const handleUpdateCredentials = async () => {
    if (!newApiKey.trim() || !newApiSecret.trim()) {
      setCredError('Please enter both API key and secret')
      return
    }
    const exchangeInfo = EXCHANGES.find((e) => e.id === settings?.exchange)
    if (exchangeInfo?.requiresPassphrase && !newPassphrase.trim()) {
      setCredError(`${exchangeInfo.name} requires a passphrase`)
      return
    }
    setCredSaving(true)
    setCredError('')
    setCredSaved(false)
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: settings?.exchange,
          apiKey: newApiKey.trim(),
          apiSecret: newApiSecret.trim(),
          ...(newPassphrase.trim() ? { apiPassphrase: newPassphrase.trim() } : {}),
          tradingMode: settings?.tradingMode,
          leverage: settings?.leverage,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setCredError(data.error || 'Failed to update credentials')
        return
      }
      setCredSaved(true)
      setNewApiKey('')
      setNewApiSecret('')
      setNewPassphrase('')
      setShowCredUpdate(false)
      setTimeout(() => setCredSaved(false), 3000)
    } catch {
      setCredError('Network error')
    } finally {
      setCredSaving(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ execMode, paperMode, riskPct, balancePct, maxPositions, leverage }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Save failed')
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your exchange? This will log you out and remove your API keys.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
    } catch {
      setDisconnecting(false)
    }
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
      <Navbar exchange={settings?.exchange} />

      <main className="lg:ml-64 flex-1 p-4 lg:p-6 pt-20 lg:pt-6 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#e8e8f0]">Settings</h1>
          <p className="text-sm text-[#6b6b80]">Manage your trading configuration</p>
        </div>

        {/* Exchange info */}
        {settings && (
          <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-6 mb-4">
            <h3 className="font-semibold text-[#e8e8f0] mb-4">Exchange Connection</h3>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ExchangeBadge exchangeId={settings.exchange} size="md" />
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#00d68f] animate-pulse" />
                    <span className="text-sm text-[#00d68f] font-semibold">Connected</span>
                  </div>
                  <div className="text-xs text-[#6b6b80] capitalize mt-0.5">
                    {settings.tradingMode} mode
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-[#0d0d0f] rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-[#6b6b80] mb-1">API Key</div>
                <div className="font-mono text-sm text-[#e8e8f0]">
                  {settings.hasApiKey ? '●●●●●●●●●●●●●●●●' : 'Not set'}
                </div>
              </div>
              {settings.hasApiKey && (
                <div className="flex items-center gap-1.5 text-xs text-[#00d68f]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  Encrypted
                </div>
              )}
            </div>
            <div className="text-xs text-[#4a4a5a] mt-3">
              Connected on {settings.createdAt ? new Date(settings.createdAt).toLocaleDateString() : '—'}
            </div>

            {/* Update Credentials */}
            <div className="mt-4 pt-4 border-t border-[#2a2a35]">
              <button
                onClick={() => { setShowCredUpdate(!showCredUpdate); setCredError(''); setCredSaved(false) }}
                className="text-sm text-[#4f8ef7] hover:text-[#6aa0f9] font-medium transition-colors flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                {showCredUpdate ? 'Cancel' : 'Update API Credentials'}
              </button>

              {showCredUpdate && (
                <div className="mt-4 space-y-4">
                  {/* New API Key */}
                  <div>
                    <label className="block text-xs font-medium text-[#6b6b80] mb-1.5">New API Key</label>
                    <div className="relative">
                      <input
                        type={showNewKey ? 'text' : 'password'}
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                        placeholder="Enter new API key"
                        className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-2.5 pr-10 font-mono text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                      />
                      <button type="button" onClick={() => setShowNewKey(!showNewKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b80] hover:text-[#e8e8f0]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {showNewKey
                            ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                            : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* New API Secret */}
                  <div>
                    <label className="block text-xs font-medium text-[#6b6b80] mb-1.5">New API Secret</label>
                    <div className="relative">
                      <input
                        type={showNewSecret ? 'text' : 'password'}
                        value={newApiSecret}
                        onChange={(e) => setNewApiSecret(e.target.value)}
                        placeholder="Enter new API secret"
                        className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-2.5 pr-10 font-mono text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                      />
                      <button type="button" onClick={() => setShowNewSecret(!showNewSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b80] hover:text-[#e8e8f0]">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          {showNewSecret
                            ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                            : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Passphrase (OKX, KuCoin) */}
                  {EXCHANGES.find((e) => e.id === settings.exchange)?.requiresPassphrase && (
                    <div>
                      <label className="block text-xs font-medium text-[#6b6b80] mb-1.5">
                        API Passphrase
                        <span className="ml-2 text-[#ffd700] bg-[#ffd700]/10 px-1.5 py-0.5 rounded-full text-xs">Required</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassphrase ? 'text' : 'password'}
                          value={newPassphrase}
                          onChange={(e) => setNewPassphrase(e.target.value)}
                          placeholder="Enter your API passphrase"
                          className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-2.5 pr-10 font-mono text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                        />
                        <button type="button" onClick={() => setShowNewPassphrase(!showNewPassphrase)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b80] hover:text-[#e8e8f0]">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {showNewPassphrase
                              ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {credError && (
                    <div className="bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-xl p-3 text-xs text-[#ff4757]">
                      {credError}
                    </div>
                  )}

                  <button
                    onClick={handleUpdateCredentials}
                    disabled={credSaving || !newApiKey || !newApiSecret || (!!EXCHANGES.find((e) => e.id === settings.exchange)?.requiresPassphrase && !newPassphrase)}
                    className="w-full py-2.5 bg-[#4f8ef7] hover:bg-[#6aa0f9] text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {credSaving ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Validating & Saving...</>
                    ) : 'Update & Validate Credentials'}
                  </button>
                </div>
              )}

              {credSaved && (
                <div className="mt-3 bg-[#00d68f]/10 border border-[#00d68f]/20 rounded-xl p-3 text-xs text-[#00d68f]">
                  ✓ Credentials updated successfully
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trading settings */}
        <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-6 mb-4">
          <h3 className="font-semibold text-[#e8e8f0] mb-5">Trading Parameters</h3>

          <div className="space-y-6">
            {/* Paper Trading Mode */}
            <div className={`p-4 rounded-xl border-2 transition-all ${paperMode ? 'border-[#ffd700]/40 bg-[#ffd700]/5' : 'border-[#ff4757]/40 bg-[#ff4757]/5'}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-[#e8e8f0] text-sm">{paperMode ? '🛡️ Paper Trading' : '⚡ Live Trading'}</p>
                  <p className="text-xs text-[#6b6b80] mt-0.5">{paperMode ? 'Simulated trades — no real funds at risk' : 'Real orders placed on exchange'}</p>
                </div>
                <button
                  onClick={() => {
                    if (!paperMode) {
                      if (!window.confirm('Switch to LIVE trading? Real orders will be placed on your exchange. Make sure your API keys and risk settings are correct.')) return
                    }
                    setPaperMode(!paperMode)
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${paperMode ? 'bg-[#ffd700]' : 'bg-[#ff4757]'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${paperMode ? 'translate-x-1' : 'translate-x-7'}`} />
                </button>
              </div>
              {!paperMode && (
                <div className="mt-2 p-2 bg-[#ff4757]/10 rounded-lg">
                  <p className="text-xs text-[#ff4757]">⚠️ Live mode active. All trades with exec mode &quot;Auto&quot; will place real orders. Ensure your stop-losses and position sizes are correct.</p>
                </div>
              )}
            </div>

            {/* Execution mode */}
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-3">Execution Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { mode: 'manual', icon: '🔔', label: 'Signal Only', desc: 'Bot generates signals, you trade manually', color: '#4f8ef7' },
                  { mode: 'approval', icon: '✋', label: 'Approval', desc: 'Bot queues trades — you approve each one', color: '#ffd700' },
                  { mode: 'auto', icon: '🤖', label: 'Auto', desc: 'Bot executes trades automatically', color: '#00d68f' },
                ].map(({ mode, icon, label, desc, color }) => (
                  <button
                    key={mode}
                    onClick={() => {
                      if (mode === 'auto' && !paperMode) {
                        if (!window.confirm('⚠️ Auto mode with LIVE trading will place real orders without confirmation.\n\nAre you sure?')) return
                      }
                      setExecMode(mode as typeof execMode)
                    }}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${execMode === mode ? 'bg-opacity-10' : 'border-[#2a2a35] hover:border-[#3a3a48]'}`}
                    style={execMode === mode ? { borderColor: color, backgroundColor: `${color}18` } : {}}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-base">{icon}</span>
                      <span className="font-semibold text-xs" style={execMode === mode ? { color } : { color: '#e8e8f0' }}>{label}</span>
                    </div>
                    <p className="text-xs text-[#6b6b80] leading-tight">{desc}</p>
                  </button>
                ))}
              </div>
              {execMode === 'auto' && !paperMode && (
                <div className="mt-2 p-2.5 bg-[#ff4757]/10 border border-[#ff4757]/20 rounded-lg">
                  <p className="text-xs text-[#ff4757]">⚠️ Auto + Live: real orders will be placed without manual confirmation. Score ≥75 required.</p>
                </div>
              )}
              {execMode === 'approval' && (
                <div className="mt-2 p-2.5 bg-[#ffd700]/10 border border-[#ffd700]/20 rounded-lg">
                  <p className="text-xs text-[#ffd700]">Signals appear in your dashboard approval queue. You approve or reject each trade before execution.</p>
                </div>
              )}
            </div>

            {/* Risk per trade */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-[#e8e8f0]">Risk Per Trade</label>
                <span className="text-sm font-mono font-bold text-[#4f8ef7]">{riskPct}%</span>
              </div>
              <input type="range" min="0.1" max="1" step="0.1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} />
              <div className="flex justify-between text-xs text-[#6b6b80] mt-1">
                <span>0.1% (Ultra-safe)</span>
                <span>1% (Max — capital protection cap)</span>
              </div>
            </div>

            {/* Balance to use */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-[#e8e8f0]">Balance to Use</label>
                <span className="text-sm font-mono font-bold text-[#4f8ef7]">{balancePct}%</span>
              </div>
              <input type="range" min="10" max="100" step="5" value={balancePct} onChange={(e) => setBalancePct(Number(e.target.value))} />
              <div className="flex justify-between text-xs text-[#6b6b80] mt-1">
                <span>10%</span>
                <span>100% of balance</span>
              </div>
            </div>

            {/* Max positions */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-[#e8e8f0]">Max Concurrent Positions</label>
                <span className="text-sm font-mono font-bold text-[#4f8ef7]">{maxPositions}</span>
              </div>
              <input type="range" min="1" max="3" step="1" value={maxPositions} onChange={(e) => setMaxPositions(Number(e.target.value))} />
              <div className="flex justify-between text-xs text-[#6b6b80] mt-1">
                <span>1 (Focused)</span>
                <span>3 (Max — capital protection cap)</span>
              </div>
            </div>

            {/* Leverage (if futures) */}
            {settings?.tradingMode === 'futures' && (
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium text-[#e8e8f0]">Leverage</label>
                  <span className="text-sm font-mono font-bold text-[#ffd700]">{leverage}x</span>
                </div>
                <input type="range" min="1" max="3" step="1" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} />
                <div className="flex justify-between text-xs text-[#6b6b80] mt-1">
                  <span>1x (Spot-like)</span>
                  <span>3x (Max safe — never higher)</span>
                </div>
                <p className="text-xs text-[#6b6b80] mt-1.5">High leverage causes liquidations. APEX enforces 3x maximum.</p>
              </div>
            )}
          </div>
        </div>

        {/* Risk limits info */}
        <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-6 mb-4">
          <h3 className="font-semibold text-[#e8e8f0] mb-4">Built-in Capital Protection Rules</h3>
          <p className="text-xs text-[#6b6b80] mb-4">These limits cannot be disabled. They exist to protect your capital.</p>
          <div className="space-y-3">
            {[
              { label: 'Daily Loss Limit', value: '3% of balance', color: '#ff4757' },
              { label: 'Weekly Loss Limit', value: '7% of balance', color: '#ff4757' },
              { label: 'Max Consecutive Losses', value: '3 trades — then pause', color: '#ffd700' },
              { label: 'Loss Cooldown', value: '30 min after each loss', color: '#ffd700' },
              { label: 'Max Trades Per Day', value: '5 trades', color: '#4f8ef7' },
              { label: 'Max Risk Per Trade', value: '1% hard cap', color: '#4f8ef7' },
              { label: 'Minimum Signal Score', value: '75/100 required', color: '#00d68f' },
              { label: 'Min Risk/Reward', value: '2:1 required', color: '#00d68f' },
              { label: 'Max Futures Leverage', value: '3x hard cap', color: '#ffd700' },
              { label: 'Position Sizing', value: 'ATR-based, score-adjusted', color: '#4f8ef7' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-[#2a2a35]/50 last:border-0">
                <span className="text-sm text-[#6b6b80]">{item.label}</span>
                <span className="text-sm font-semibold font-mono" style={{ color: item.color }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        {error && (
          <div className="bg-[#ff4757]/10 border border-[#ff4757]/20 rounded-xl p-4 mb-4 text-sm text-[#ff4757]">
            {error}
          </div>
        )}
        {saved && (
          <div className="bg-[#00d68f]/10 border border-[#00d68f]/20 rounded-xl p-4 mb-4 text-sm text-[#00d68f]">
            ✓ Settings saved successfully
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 bg-[#4f8ef7] hover:bg-[#6aa0f9] text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mb-6"
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : null}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {/* Danger zone */}
        <div className="bg-[#ff4757]/5 border border-[#ff4757]/20 rounded-2xl p-6">
          <h3 className="font-semibold text-[#ff4757] mb-2">Danger Zone</h3>
          <p className="text-sm text-[#6b6b80] mb-4">
            Disconnecting will remove your API keys and log you out. Your trade history is preserved.
          </p>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="px-5 py-2.5 border border-[#ff4757]/40 text-[#ff4757] rounded-xl text-sm font-semibold hover:bg-[#ff4757]/10 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {disconnecting ? (
              <div className="w-4 h-4 border-2 border-[#ff4757]/30 border-t-[#ff4757] rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            )}
            {disconnecting ? 'Disconnecting...' : 'Disconnect Exchange'}
          </button>
        </div>
      </main>
    </div>
  )
}
