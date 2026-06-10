'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Please fill in all fields'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error || 'Login failed'); return }
      router.push('/dashboard')
    } catch { setError('Network error — please try again') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0f] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-9 h-9 bg-gradient-to-br from-[#4f8ef7] to-[#00d68f] rounded-xl flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-[#e8e8f0]">APEX</span>
        </div>

        <div className="bg-[#16161a] border border-[#2a2a35] rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-[#e8e8f0] mb-1">Welcome back</h1>
          <p className="text-[#6b6b80] text-sm mb-8">Sign in to your APEX account</p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-2">Email address</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="you@example.com"
                className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#e8e8f0] mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Your password"
                  className="w-full bg-[#0d0d0f] border border-[#2a2a35] text-[#e8e8f0] placeholder-[#4a4a5a] rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-[#4f8ef7] transition-colors"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b80] hover:text-[#e8e8f0]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {showPassword
                      ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-[#ff4757]/10 border border-[#ff4757]/30 rounded-xl p-3 mb-4 text-sm text-[#ff4757]">{error}</div>
          )}

          <button onClick={handleLogin} disabled={loading || !email || !password}
            className="w-full py-3.5 bg-gradient-to-r from-[#4f8ef7] to-[#00d68f] text-white font-bold rounded-xl transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3">
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</>
              : 'Sign In →'}
          </button>
        </div>

        <div className="text-center text-sm text-[#6b6b80] mt-6 space-y-2">
          <p>New to APEX? <Link href="/register" className="text-[#4f8ef7] hover:underline font-medium">Create account</Link></p>
          <p>Existing user (API-key login)? <Link href="/claim" className="text-[#ffd700] hover:underline">Claim your account</Link></p>
        </div>
      </div>
    </div>
  )
}
