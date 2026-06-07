export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getTrades } from '@/lib/storage'
import type { ChartDataPoint } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession()
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '30d'

    const daysMap: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
    }
    const days = daysMap[period] || 30
    const trades = await getTrades(session.userId, 200)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    // Filter to closed trades within period
    const closedTrades = trades.filter(
      (t) => t.status === 'closed' && t.closedAt && new Date(t.closedAt) >= cutoff
    )

    // Group by date
    const dailyPnl: Record<string, number> = {}

    // Initialize all days to 0
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      dailyPnl[key] = 0
    }

    for (const trade of closedTrades) {
      const key = trade.closedAt!.split('T')[0]
      if (dailyPnl[key] !== undefined) {
        dailyPnl[key] += trade.pnlUsd || 0
      }
    }

    // Build chart data with cumulative
    const chartData: ChartDataPoint[] = []
    let cumulative = 0

    for (const [date, pnl] of Object.entries(dailyPnl).sort()) {
      cumulative += pnl
      chartData.push({ date, pnl, cumulative })
    }

    return NextResponse.json({ success: true, data: chartData })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch chart data'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
