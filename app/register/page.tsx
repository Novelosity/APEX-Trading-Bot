'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const passwordStrength = (() => {
    if (password.length === 0) return 0
    let s = 0
    if (password.length >= 8) s++
    if (/[A-Z]/.test(password)) s++
    if (/[0-9]/.test(password)) s++
    if (/[^A-Za-z0-9]/.test(password)) s++
    return s
  })()

  const handleRegister = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, confirmPassword }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error || 'Registration failed'); return }
      router.push('/onboard')
    } catch { setError('Network error — please try again') }
    finally { setLoading(false) }
  }

  const strengthColors = ['bg-[#2a2a35]', 'bg-[#ff4757]', 'bg-[#ffd700]', 'bg-[#4f8ef7]', 'bg-[#00d68f]']
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']

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

        <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-[#e8e8f0] mb-1">Create account</h1>
          <p className="text-[#6b6b80] text-sm mb-2">Free to use. No credit card required.</p>

          {/* Paper trading default notice */}
          <div className="bg-[#00d68f]/10 border border-[#00d68f]/20 rounded-xl p-3 mb-6 flex gap-2">
            <span className="text-sm">🛡️</span>
            <p className="text-xs text-[#00d68f]">Paper trading is enabled by default — no real funds at risk until you explicitly switch to live mode.</p>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-2">Email address</label>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-2">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 chars, 1 uppercase, 1 number"
                  className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b80] hover:text-[#e8e8f0]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {showPassword
                      ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= passwordStrength ? strengthColors[passwordStrength] : 'bg-[#2a2a35]'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-[#6b6b80]">{strengthLabels[passwordStrength]}</p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-2">Confirm password</label>
              <input type="password" autoComplete="new-password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                placeholder="Repeat your password"
                className={`w-full bg-[#0d0d0f] border text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors ${confirmPassword && confirmPassword !== password ? 'border-[#ff4757]' : 'border-[#2a2a35] focus:border-[#4f8ef7]'}`} />
            </div>
          </div>

          {error && (
            <div className="bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-xl p-3 mb-4 text-sm text-[#ff4757]">{error}</div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-[#4a4a5a] mb-4">
            By creating an account you acknowledge that crypto trading involves substantial risk of loss. APEX provides tools and signals only — not financial advice. Past performance does not guarantee future results.
          </p>

          <button onClick={handleRegister}
            disabled={loading || !email || !password || !confirmPassword || password !== confirmPassword}
            className="w-full py-3.5 bg-gradient-to-r from-[#4f8ef7] to-[#00d68f] text-white font-bold rounded-xl transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3">
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating account...</>
              : 'Create Account →'}
          </button>
        </div>

        <p className="text-center text-sm text-[#6b6b80] mt-6">
          Already have an account? <Link href="/login" className="text-[#4f8ef7] hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
