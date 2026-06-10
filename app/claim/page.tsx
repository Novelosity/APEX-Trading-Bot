'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { EXCHANGES } from '@/lib/exchanges'

export default function ClaimPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [exchange, setExchange] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClaim = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, exchange, apiKey: apiKey.trim(), apiSecret: apiSecret.trim() }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error || 'Claim failed'); return }
      router.push('/dashboard')
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0f] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-9 h-9 bg-gradient-to-br from-[#4f8ef7] to-[#00d68f] rounded-xl flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-[#e8e8f0]">APEX</span>
        </div>

        <div className="bg-[#16161a] border border-[#ffd700]/30 rounded-2xl p-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🔑</span>
            <h1 className="text-xl font-bold text-[#e8e8f0]">Claim Existing Account</h1>
          </div>
          <p className="text-[#6b6b80] text-sm mb-6">
            If you previously set up APEX with API keys only (no email/password), verify your exchange credentials to attach a new secure login.
          </p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-2">New Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#ffd700] transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-2">New Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters"
                className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#ffd700] transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-2">Exchange</label>
              <div className="grid grid-cols-5 gap-2">
                {EXCHANGES.map((ex) => (
                  <button key={ex.id} onClick={() => setExchange(ex.id)} title={ex.name}
                    className={`py-2.5 rounded-xl border-2 text-xl transition-all ${exchange === ex.id ? 'border-[#ffd700] bg-[#ffd700]/10' : 'border-[#2a2a35] hover:border-[#3a3a48]'}`}>
                    {ex.emoji}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-2">API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your existing API key"
                className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:border-[#ffd700] transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-2">API Secret</label>
              <input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Your existing API secret"
                onKeyDown={(e) => e.key === 'Enter' && handleClaim()}
                className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:border-[#ffd700] transition-colors" />
            </div>
          </div>

          {error && <div className="bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-xl p-3 mb-4 text-sm text-[#ff4757]">{error}</div>}

          <button onClick={handleClaim}
            disabled={loading || !email || !password || !exchange || !apiKey || !apiSecret}
            className="w-full py-3.5 bg-[#ffd700] text-black font-bold rounded-xl transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3">
            {loading
              ? <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Verifying...</>
              : 'Claim Account →'}
          </button>
        </div>

        <p className="text-center text-sm text-[#6b6b80] mt-6">
          <Link href="/login" className="text-[#4f8ef7] hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
