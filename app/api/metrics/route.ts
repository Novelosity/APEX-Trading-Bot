export const runtime = 'nodejs'
export const preferredRegion = 'fra1'

import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getTrades, getBotState, getUser } from '@/lib/storage'
import { ExchangeClient } from '@/lib/exchange'
import type { Trade } from '@/lib/types'

function calcProfitFactor(trades: Trade[]): number {
  const closed = trades.filter((t) => t.status === 'closed' && t.pnlUsd !== undefined)
  const wins = closed.filter((t) => (t.pnlUsd ?? 0) > 0).reduce((s, t) => s + (t.pnlUsd ?? 0), 0)
  const losses = Math.abs(closed.filter((t) => (t.pnlUsd ?? 0) < 0).reduce((s, t) => s + (t.pnlUsd ?? 0), 0))
  if (losses === 0) return wins > 0 ? 999 : 1
  return Math.round((wins / losses) * 100) / 100
}

function calcMaxDrawdown(trades: Trade[]): number {
  const closed = trades
    .filter((t) => t.status === 'closed' && t.closedAt && t.pnlUsd !== undefined)
    .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime())

  if (closed.length === 0) return 0

  let cumPnl = 0
  let peak = 0
  let maxDD = 0

  for (const t of closed) {
    cumPnl += t.pnlUsd ?? 0
    if (cumPnl > peak) peak = cumPnl
    const dd = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0
    if (dd > maxDD) maxDD = dd
  }

  return Math.round(maxDD * 100) / 100
}

function calcSharpe(trades: Trade[]): number {
  const closed = trades
    .filter((t) => t.status === 'closed' && t.closedAt && t.pnlPct !== undefined)
    .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime())

  if (closed.length < 5) return 0

  const returns = closed.map((t) => t.pnlPct ?? 0)
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length
  const stddev = Math.sqrt(variance)

  if (stddev === 0) return 0
  // Annualise using sqrt(252) for daily equivalent
  return Math.round((mean / stddev) * Math.sqrt(252) * 100) / 100
}

function calcExpectancy(trades: Trade[]): number {
  const closed = trades.filter((t) => t.status === 'closed' && t.pnlUsd !== undefined)
  if (closed.length === 0) return 0
  const total = closed.reduce((s, t) => s + (t.pnlUsd ?? 0), 0)
  return Math.round((total / closed.length) * 100) / 100
}

export async function GET() {
  try {
    const session = await requireSession()
    const [trades, botState, user] = await Promise.all([
      getTrades(session.userId, 200),
      getBotState(session.userId),
      getUser(session.userId),
    ])

    // Exchange health check
    let exchangeHealth: { status: 'ok' | 'degraded' | 'error'; latencyMs: number } = { status: 'error', latencyMs: 0 }
    if (user?.apiKeyEnc) {
      const start = Date.now()
      try {
        const client = new ExchangeClient(user)
        await Promise.race([
          client.fetchBalance(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ])
        exchangeHealth = { status: 'ok', latencyMs: Date.now() - start }
      } catch {
        exchangeHealth = { status: Date.now() - start > 4500 ? 'degraded' : 'error', latencyMs: Date.now() - start }
      }
    } else if (!user?.apiKeyEnc) {
      exchangeHealth = { status: 'ok', latencyMs: 0 } // paper mode / no exchange
    }

    const closed = trades.filter((t) => t.status === 'closed')
    const winCount = closed.filter((t) => (t.pnlUsd ?? 0) > 0).length
    const lossCount = closed.filter((t) => (t.pnlUsd ?? 0) < 0).length

    // Current streak
    let currentStreak = 0
    let currentStreakType: 'win' | 'loss' | 'none' = 'none'
    const sorted = [...closed].sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime())
    if (sorted.length > 0) {
      const firstType = (sorted[0].pnlUsd ?? 0) >= 0 ? 'win' : 'loss'
      currentStreakType = firstType
      for (const t of sorted) {
        const type = (t.pnlUsd ?? 0) >= 0 ? 'win' : 'loss'
        if (type === firstType) currentStreak++
        else break
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        profitFactor: calcProfitFactor(trades),
        maxDrawdownPct: calcMaxDrawdown(trades),
        sharpeRatio: calcSharpe(trades),
        expectancyUsd: calcExpectancy(trades),
        winCount,
        lossCount,
        totalTrades: closed.length,
        currentStreak,
        currentStreakType,
        tradingHalted: botState.tradingHalted,
        haltReason: botState.haltReason,
        paperMode: user?.paperMode ?? false,
        exchangeHealth,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Metrics failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
