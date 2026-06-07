'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { EXCHANGES, EXCHANGE_API_GUIDES } from '@/lib/exchanges'

type Step = 1 | 2 | 3 | 4

export default function OnboardPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [selectedExchange, setSelectedExchange] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [apiPassphrase, setApiPassphrase] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [tradingMode, setTradingMode] = useState<'spot' | 'futures'>('spot')
  const [leverage, setLeverage] = useState(5)
  const [riskPct, setRiskPct] = useState(1)
  const [balancePct, setBalancePct] = useState(100)
  const [maxPositions, setMaxPositions] = useState(5)
  const [execMode, setExecMode] = useState<'manual' | 'auto'>('manual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [validatedBalance, setValidatedBalance] = useState<number | null>(null)

  const exchange = EXCHANGES.find((e) => e.id === selectedExchange)
  const guide = selectedExchange ? EXCHANGE_API_GUIDES[selectedExchange] : null

  const handleConnect = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) {
      setError('Please enter both API key and secret')
      return
    }
    if (exchange?.requiresPassphrase && !apiPassphrase.trim()) {
      setError(`${exchange.name} requires an API passphrase`)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: selectedExchange,
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
          ...(apiPassphrase.trim() ? { apiPassphrase: apiPassphrase.trim() } : {}),
          tradingMode,
          leverage,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Connection failed')
        return
      }
      setValidatedBalance(data.data.balance)
      setStep(4)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const handleLaunch = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riskPct, balancePct, maxPositions, execMode }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Failed to save settings')
        return
      }
      router.push('/dashboard')
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0f] flex flex-col">
      {/* Header */}
      <div className="border-b border-[#2a2a35] px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-[#4f8ef7] to-[#00d68f] rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span className="font-bold text-[#e8e8f0]">APEX</span>
        </Link>
        {/* Step progress */}
        <div className="flex items-center gap-2">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  s < step
                    ? 'bg-[#00d68f] text-black'
                    : s === step
                    ? 'bg-[#4f8ef7] text-white'
                    : 'bg-[#2a2a35] text-[#6b6b80]'
                }`}
              >
                {s < step ? '✓' : s}
              </div>
              {s < 4 && (
                <div className={`w-8 h-0.5 mx-1 ${s < step ? 'bg-[#00d68f]' : 'bg-[#2a2a35]'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center py-12 px-6">
        <div className="w-full max-w-2xl animate-slide-up">

          {/* ── Step 1: Exchange Selection ──────────────────────────────────── */}
          {step === 1 && (
            <div>
              <h1 className="text-3xl font-bold text-[#e8e8f0] mb-2">Choose Your Exchange</h1>
              <p className="text-[#6b6b80] mb-8">Select the exchange where your funds are held.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {EXCHANGES.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => setSelectedExchange(ex.id)}
                    className={`relative p-5 rounded-xl border-2 text-left transition-all hover:scale-[1.02] ${
                      selectedExchange === ex.id
                        ? 'border-[#4f8ef7] bg-[#4f8ef7]/10'
                        : 'border-[#2a2a35] bg-[#16161a] hover:border-[#3a3a48]'
                    }`}
                  >
                    {selectedExchange === ex.id && (
                      <div className="absolute top-3 right-3 w-5 h-5 bg-[#4f8ef7] rounded-full flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{ex.emoji}</span>
                      <span
                        className="font-bold text-lg"
                        style={{ color: selectedExchange === ex.id ? ex.color : '#e8e8f0' }}
                      >
                        {ex.name}
                      </span>
                    </div>
                    <p className="text-sm text-[#6b6b80]">{ex.description}</p>
                  </button>
                ))}
              </div>

              <button
                onClick={() => selectedExchange && setStep(2)}
                disabled={!selectedExchange}
                className="w-full py-4 bg-[#4f8ef7] disabled:bg-[#2a2a35] disabled:text-[#4a4a5a] text-white font-bold rounded-xl transition-colors hover:bg-[#6aa0f9] disabled:cursor-not-allowed"
              >
                Continue with {exchange?.name || 'Exchange'} →
              </button>
            </div>
          )}

          {/* ── Step 2: API Setup Guide ─────────────────────────────────────── */}
          {step === 2 && exchange && guide && (
            <div>
              <button onClick={() => setStep(1)} className="flex items-center gap-2 text-[#6b6b80] hover:text-[#e8e8f0] mb-6 text-sm transition-colors">
                ← Back
              </button>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{exchange.emoji}</span>
                <h1 className="text-3xl font-bold text-[#e8e8f0]">{exchange.name} API Setup</h1>
              </div>
              <p className="text-[#6b6b80] mb-8">Follow these steps to create your API key.</p>

              {/* Warning callout */}
              <div className="bg-[#ffd700]/10 border border-[#ffd700]/30 rounded-xl p-4 mb-6">
                <div className="flex gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="font-semibold text-[#ffd700] mb-1">Security Notice</p>
                    <p className="text-sm text-[#e8e8f0]">
                      Your API keys are encrypted with AES-256-GCM before storage.
                      <strong className="text-[#ff4757]"> Never enable withdrawal permissions</strong> — APEX only needs trading access.
                    </p>
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="bg-[#16161a] border border-[#2a2a35] rounded-xl p-6 mb-6">
                <h3 className="font-semibold text-[#e8e8f0] mb-4">Step-by-Step Instructions</h3>
                <ol className="space-y-3">
                  {guide.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-6 h-6 rounded-full bg-[#4f8ef7]/20 text-[#4f8ef7] flex items-center justify-center shrink-0 text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="text-[#e8e8f0] pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Warnings */}
              <div className="bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-xl p-4 mb-6">
                <p className="font-semibold text-[#ff4757] mb-2">Important Warnings</p>
                <ul className="space-y-1">
                  {guide.warnings.map((w, i) => (
                    <li key={i} className="text-sm text-[#e8e8f0] flex gap-2">
                      <span className="text-[#ff4757]">•</span> {w}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-[#16161a] border border-[#2a2a35] rounded-xl p-4 mb-8">
                <p className="text-xs text-[#6b6b80] mb-1">API Management URL</p>
                <p className="text-sm font-mono text-[#4f8ef7] break-all">{guide.url}</p>
              </div>

              <button
                onClick={() => setStep(3)}
                className="w-full py-4 bg-[#4f8ef7] text-white font-bold rounded-xl transition-colors hover:bg-[#6aa0f9]"
              >
                I Have My API Keys →
              </button>
            </div>
          )}

          {/* ── Step 3: Enter API Keys ──────────────────────────────────────── */}
          {step === 3 && exchange && (
            <div>
              <button onClick={() => setStep(2)} className="flex items-center gap-2 text-[#6b6b80] hover:text-[#e8e8f0] mb-6 text-sm transition-colors">
                ← Back
              </button>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{exchange.emoji}</span>
                <h1 className="text-3xl font-bold text-[#e8e8f0]">Connect {exchange.name}</h1>
              </div>
              <p className="text-[#6b6b80] mb-8">Enter your API credentials to connect APEX.</p>

              <div className="space-y-5 mb-6">
                {/* API Key */}
                <div>
                  <label className="block text-sm font-medium text-[#e8e8f0] mb-2">API Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Paste your API key here"
                      className="w-full bg-[#16161a] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 pr-12 font-mono text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b80] hover:text-[#e8e8f0] transition-colors"
                    >
                      {showKey ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* API Secret */}
                <div>
                  <label className="block text-sm font-medium text-[#e8e8f0] mb-2">API Secret</label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="Paste your API secret here"
                      className="w-full bg-[#16161a] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 pr-12 font-mono text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b80] hover:text-[#e8e8f0] transition-colors"
                    >
                      {showSecret ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* API Passphrase (KuCoin, OKX) */}
                {exchange?.requiresPassphrase && (
                  <div>
                    <label className="block text-sm font-medium text-[#e8e8f0] mb-2">
                      API Passphrase
                      <span className="ml-2 text-xs font-normal text-[#ffd700] bg-[#ffd700]/10 px-2 py-0.5 rounded-full">
                        Required for {exchange.name}
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassphrase ? 'text' : 'password'}
                        value={apiPassphrase}
                        onChange={(e) => setApiPassphrase(e.target.value)}
                        placeholder="Enter your API passphrase"
                        className="w-full bg-[#16161a] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 pr-12 font-mono text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b80] hover:text-[#e8e8f0] transition-colors"
                      >
                        {showPassphrase ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-[#6b6b80] mt-1.5">
                      The passphrase you set when creating your {exchange.name} API key
                    </p>
                  </div>
                )}

                {/* Trading Mode */}
                <div>
                  <label className="block text-sm font-medium text-[#e8e8f0] mb-2">Trading Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['spot', 'futures'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setTradingMode(mode)}
                        className={`py-3 rounded-xl border-2 font-semibold capitalize transition-all ${
                          tradingMode === mode
                            ? 'border-[#4f8ef7] bg-[#4f8ef7]/10 text-[#4f8ef7]'
                            : 'border-[#2a2a35] text-[#6b6b80] hover:border-[#3a3a48]'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Leverage (futures only) */}
                {tradingMode === 'futures' && (
                  <div>
                    <label className="block text-sm font-medium text-[#e8e8f0] mb-2">
                      Leverage: <span className="text-[#4f8ef7] font-mono">{leverage}x</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={leverage}
                      onChange={(e) => setLeverage(Number(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-[#6b6b80] mt-1">
                      <span>1x</span>
                      <span>10x</span>
                      <span>20x</span>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-xl p-4 mb-4 text-sm text-[#ff4757]">
                  {error}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={loading || !apiKey || !apiSecret || (!!exchange?.requiresPassphrase && !apiPassphrase)}
                className="w-full py-4 bg-gradient-to-r from-[#4f8ef7] to-[#00d68f] text-white font-bold rounded-xl transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Connecting & Validating...
                  </>
                ) : (
                  'Connect & Validate →'
                )}
              </button>
            </div>
          )}

          {/* ── Step 4: Configure Settings ──────────────────────────────────── */}
          {step === 4 && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-[#00d68f]/20 rounded-full flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00d68f" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-[#e8e8f0]">Connected!</h1>
                  {validatedBalance !== null && (
                    <p className="text-[#00d68f] text-sm font-mono">
                      Balance: ${validatedBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[#6b6b80] mb-8">Configure your trading parameters.</p>

              <div className="space-y-6 mb-8">
                {/* Risk per trade */}
                <div className="bg-[#16161a] border border-[#2a2a35] rounded-xl p-5">
                  <div className="flex justify-between mb-3">
                    <label className="font-medium text-[#e8e8f0]">Risk Per Trade</label>
                    <span className="font-mono font-bold text-[#4f8ef7]">{riskPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.5"
                    value={riskPct}
                    onChange={(e) => setRiskPct(Number(e.target.value))}
                  />
                  <div className="flex justify-between text-xs text-[#6b6b80] mt-1">
                    <span>0.5% (Conservative)</span>
                    <span>5% (Aggressive)</span>
                  </div>
                  <p className="text-xs text-[#6b6b80] mt-2">
                    Max loss per trade. Position size is auto-calculated based on stop distance.
                  </p>
                </div>

                {/* Balance to use */}
                <div className="bg-[#16161a] border border-[#2a2a35] rounded-xl p-5">
                  <div className="flex justify-between mb-3">
                    <label className="font-medium text-[#e8e8f0]">Balance to Use</label>
                    <span className="font-mono font-bold text-[#4f8ef7]">{balancePct}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={balancePct}
                    onChange={(e) => setBalancePct(Number(e.target.value))}
                  />
                  <div className="flex justify-between text-xs text-[#6b6b80] mt-1">
                    <span>10%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Max concurrent positions */}
                <div className="bg-[#16161a] border border-[#2a2a35] rounded-xl p-5">
                  <div className="flex justify-between mb-3">
                    <label className="font-medium text-[#e8e8f0]">Max Concurrent Positions</label>
                    <span className="font-mono font-bold text-[#4f8ef7]">{maxPositions}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={maxPositions}
                    onChange={(e) => setMaxPositions(Number(e.target.value))}
                  />
                  <div className="flex justify-between text-xs text-[#6b6b80] mt-1">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>

                {/* Execution Mode */}
                <div className="bg-[#16161a] border border-[#2a2a35] rounded-xl p-5">
                  <label className="block font-medium text-[#e8e8f0] mb-4">Execution Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setExecMode('manual')}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        execMode === 'manual'
                          ? 'border-[#4f8ef7] bg-[#4f8ef7]/10'
                          : 'border-[#2a2a35] hover:border-[#3a3a48]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🔔</span>
                        <span className={`font-semibold ${execMode === 'manual' ? 'text-[#4f8ef7]' : 'text-[#e8e8f0]'}`}>
                          Manual
                        </span>
                      </div>
                      <p className="text-xs text-[#6b6b80]">Signals only — you approve each trade</p>
                    </button>
                    <button
                      onClick={() => setExecMode('auto')}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        execMode === 'auto'
                          ? 'border-[#00d68f] bg-[#00d68f]/10'
                          : 'border-[#2a2a35] hover:border-[#3a3a48]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🤖</span>
                        <span className={`font-semibold ${execMode === 'auto' ? 'text-[#00d68f]' : 'text-[#e8e8f0]'}`}>
                          Auto
                        </span>
                      </div>
                      <p className="text-xs text-[#6b6b80]">Bot trades ULTRA_HIGH signals automatically</p>
                    </button>
                  </div>
                  {execMode === 'auto' && (
                    <div className="mt-3 p-3 bg-[#ffd700]/10 border border-[#ffd700]/30 rounded-lg">
                      <p className="text-xs text-[#ffd700]">
                        ⚠️ Auto mode will execute trades on your exchange. Ensure you understand the risks.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-xl p-4 mb-4 text-sm text-[#ff4757]">
                  {error}
                </div>
              )}

              <button
                onClick={handleLaunch}
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-[#4f8ef7] to-[#00d68f] text-white font-bold text-lg rounded-xl transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Launching...
                  </>
                ) : (
                  '🚀 Launch Dashboard'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
