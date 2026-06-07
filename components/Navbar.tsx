'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { getExchange } from '@/lib/exchanges'

interface NavbarProps {
  exchange?: string
}

const NAV_LINKS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: '/trades',
    label: 'Trade History',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    href: '/congressional',
    label: 'Congress',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
]

export function Navbar({ exchange }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const exchangeInfo = exchange ? getExchange(exchange) : null

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
    } catch {
      setLoggingOut(false)
    }
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#0d0d0f] border-b border-[#2a2a35] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-[#4f8ef7] to-[#00d68f] rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <span className="font-bold text-[#e8e8f0]">APEX</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-[#6b6b80] hover:text-[#e8e8f0] transition-colors"
        >
          {mobileOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="lg:hidden fixed top-[57px] left-0 right-0 z-40 bg-[#0d0d0f] border-b border-[#2a2a35] p-4 space-y-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                pathname === link.href
                  ? 'bg-[#4f8ef7]/10 text-[#4f8ef7]'
                  : 'text-[#6b6b80] hover:bg-[#16161a] hover:text-[#e8e8f0]'
              }`}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-[#0d0d0f] border-r border-[#2a2a35] fixed left-0 top-0 bottom-0 z-40">
        {/* Logo */}
        <div className="p-6 border-b border-[#2a2a35]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-[#4f8ef7] to-[#00d68f] rounded-xl flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-[#e8e8f0] text-lg leading-none">APEX</div>
              <div className="text-xs text-[#6b6b80] mt-0.5">Trading Bot</div>
            </div>
          </div>
        </div>

        {/* Exchange badge */}
        {exchangeInfo && (
          <div className="px-4 py-3 border-b border-[#2a2a35]">
            <div className="flex items-center gap-2 bg-[#16161a] rounded-xl px-3 py-2.5">
              <span className="text-base">{exchangeInfo.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[#6b6b80]">Connected Exchange</div>
                <div className="text-sm font-semibold text-[#e8e8f0] truncate">{exchangeInfo.name}</div>
              </div>
              <div className="w-2 h-2 rounded-full bg-[#00d68f] animate-pulse" />
            </div>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 p-4 space-y-1">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#4f8ef7]/15 text-[#4f8ef7] border border-[#4f8ef7]/20'
                    : 'text-[#6b6b80] hover:bg-[#16161a] hover:text-[#e8e8f0]'
                }`}
              >
                <span className={isActive ? 'text-[#4f8ef7]' : ''}>{link.icon}</span>
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-[#2a2a35]">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#6b6b80] hover:bg-[#ff4757]/10 hover:text-[#ff4757] transition-colors disabled:opacity-50"
          >
            {loggingOut ? (
              <div className="w-4 h-4 border-2 border-[#6b6b80]/30 border-t-[#6b6b80] rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            )}
            {loggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </aside>
    </>
  )
}
