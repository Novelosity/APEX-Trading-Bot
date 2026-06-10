export const runtime = 'nodejs'
export const preferredRegion = 'fra1'

import { NextResponse } from 'next/server'
import { getAllOpenTrades, updateTrade, getBotState, updateBotState, getUser } from '@/lib/storage'
import { ExchangeClient } from '@/lib/exchange'

export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Reset daily P&L for all users if we're in a new UTC day
    const todayUTC = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"
    try {
      const { getAllUsers, getBotState: getBS, updateBotState: updateBS } = await import('@/lib/storage').then(m => m)
      const allUsers = await getAllUsers()
      for (const u of allUsers) {
        const bs = await getBS(u.id)
        const lastReset = (bs as any).lastDailyResetAt?.slice(0, 10)
        if (lastReset !== todayUTC) {
          await updateBS(u.id, { dailyPnl: 0, lastDailyResetAt: todayUTC } as any)
        }
      }
    } catch { /* non-critical */ }

    const openTrades = await getAllOpenTrades()

    if (openTrades.length === 0) {
      return NextResponse.json({ success: true, message: 'No open trades', monitored: 0 })
    }

    // Group trades by user
    const tradesByUser: Record<string, typeof openTrades> = {}
    for (const trade of openTrades) {
      if (!tradesByUser[trade.userId]) tradesByUser[trade.userId] = []
      tradesByUser[trade.userId].push(trade)
    }

    let closedCount = 0

    for (const [userId, trades] of Object.entries(tradesByUser)) {
      const user = await getUser(userId)
      if (!user) continue

      const client = new ExchangeClient(user)

      // Get unique pairs and fetch current prices
      const pairs = [...new Set(trades.map((t) => t.pair))]
      const prices: Record<string, number> = {}

      for (const pair of pairs) {
        try {
          const ticker = await client.fetchTicker(pair)
          prices[pair] = ticker.last
        } catch {
          // Skip if price fetch fails
        }
      }

      // Check each trade against TP/SL
      for (const trade of trades) {
        const currentPrice = prices[trade.pair]
        if (!currentPrice) continue

        let closeReason: 'tp1' | 'tp2' | 'tp3' | 'sl' | null = null

        if (trade.direction === 'long') {
          if (currentPrice >= trade.tp3Price) closeReason = 'tp3'
          else if (currentPrice >= trade.tp2Price) closeReason = 'tp2'
          else if (currentPrice >= trade.tp1Price) closeReason = 'tp1'
          else if (currentPrice <= trade.slPrice) closeReason = 'sl'
        } else {
          if (currentPrice <= trade.tp3Price) closeReason = 'tp3'
          else if (currentPrice <= trade.tp2Price) closeReason = 'tp2'
          else if (currentPrice <= trade.tp1Price) closeReason = 'tp1'
          else if (currentPrice >= trade.slPrice) closeReason = 'sl'
        }

        if (closeReason) {
          const pnlPct =
            trade.direction === 'long'
              ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
              : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100

          const pnlUsd = (pnlPct / 100) * trade.positionSize

          await updateTrade(trade.id, userId, {
            status: 'closed',
            exitPrice: currentPrice,
            pnlUsd,
            pnlPct,
            closeReason,
            closedAt: new Date().toISOString(),
          })

          // Update bot state
          const botState = await getBotState(userId)
          await updateBotState(userId, {
            dailyPnl: botState.dailyPnl + pnlUsd,
            weeklyPnl: botState.weeklyPnl + pnlUsd,
            consecutiveLosses: pnlUsd >= 0 ? 0 : botState.consecutiveLosses + 1,
            winCount: pnlUsd >= 0 ? botState.winCount + 1 : botState.winCount,
            lossCount: pnlUsd < 0 ? botState.lossCount + 1 : botState.lossCount,
            lastTradeAt: new Date().toISOString(),
          })

          closedCount++
        }
      }

      await new Promise((r) => setTimeout(r, 200))
    }

    return NextResponse.json({
      success: true,
      message: `Monitored ${openTrades.length} trades`,
      closedCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Monitor failed'
    console.error('Cron monitor error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
