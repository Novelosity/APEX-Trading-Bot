export const runtime = 'nodejs'
export const preferredRegion = 'fra1'

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getAllUsers, getSignals, saveTrade, updateBotState, markSignalExecuted, getOpenTrades, getBotState } from '@/lib/storage'
import { ExchangeClient } from '@/lib/exchange'
import { calculatePositionSize, checkCanTrade } from '@/lib/risk'
import type { Trade } from '@/lib/types'

const PAIRS_ATR_APPROX: Record<string, number> = {
  'BTC/USDT': 800,
  'ETH/USDT': 45,
  'SOL/USDT': 3.5,
  'LTC/USDT': 2.5,
  'BNB/USDT': 8,
  'ADA/USDT': 0.002,
  'MATIC/USDT': 0.05,
  'LINK/USDT': 0.5,
  'AVAX/USDT': 2.5,
  'ATOM/USDT': 1.2,
  'DOT/USDT': 0.8,
  'ARB/USDT': 0.15,
  'OP/USDT': 0.4,
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const users = await getAllUsers()
    const autoUsers = users.filter((u) => u.execMode === 'auto')

    if (autoUsers.length === 0) {
      return NextResponse.json({ success: true, message: 'No auto-mode users', executed: 0 })
    }

    let executedCount = 0
    const results: Array<{ userId: string; pair: string; direction: string; success: boolean; error?: string }> = []

    for (const user of autoUsers) {
      const client = new ExchangeClient(user)
      const openTrades = await getOpenTrades(user.id)
      const balanceData = await client.fetchBalance()
      const availableBalance = balanceData.free * (user.balancePct / 100)

      // Get pending HIGH and ULTRA_HIGH signals for this user or external
      const userSignals = await getSignals(user.id, 50)
      const externalSignals = await getSignals('external', 50)
      const pendingSignals = [...userSignals, ...externalSignals].filter(
        (s) => !s.executed && (s.tier === 'HIGH' || s.tier === 'ULTRA_HIGH')
      )

      for (const signal of pendingSignals) {
        const canCheck = await checkCanTrade(user.id, signal.pair, signal.direction, openTrades, user, availableBalance)
        if (!canCheck.allowed) {
          continue
        }

        try {
          const ticker = await client.fetchTicker(signal.pair)
          const entry = ticker.last || signal.entry

          if (!entry || entry === 0) {
            results.push({ userId: user.id, pair: signal.pair, direction: signal.direction, success: false, error: 'No price' })
            continue
          }

          const atr = PAIRS_ATR_APPROX[signal.pair] || entry * 0.01
          const botState = await getBotState(user.id)
          const positionSize = calculatePositionSize(
            availableBalance,
            user.riskPct,
            entry,
            signal.direction === 'long' ? entry - atr * 1.5 : entry + atr * 1.5,
            botState.consecutiveLosses
          )

          let sl: number, tp1: number, tp2: number, tp3: number
          if (signal.direction === 'long') {
            sl = entry - atr * 1.5
            tp1 = entry + atr * 2.25
            tp2 = entry + atr * 3.75
            tp3 = entry + atr * 6.0
          } else {
            sl = entry + atr * 1.5
            tp1 = entry - atr * 2.25
            tp2 = entry - atr * 3.75
            tp3 = entry - atr * 6.0
          }

          const trade: Trade = {
            id: randomUUID(),
            userId: user.id,
            pair: signal.pair,
            direction: signal.direction,
            entryPrice: entry,
            positionSize,
            slPrice: sl,
            tp1Price: tp1,
            tp2Price: tp2,
            tp3Price: tp3,
            status: 'open',
            openedAt: new Date().toISOString(),
          }

          if (user.tradingMode === 'futures') {
            await client.setLeverage(signal.pair, user.leverage)
          }

          const side = signal.direction === 'long' ? 'buy' : 'sell'
          const amountInBase = positionSize / entry
          const order = await client.createMarketOrder(signal.pair, side, amountInBase)

          trade.orderId = order.id
          trade.entryPrice = order.price || entry

          await saveTrade(trade)
          await markSignalExecuted(signal.id, trade.id)
          await updateBotState(user.id, {
            totalTrades: botState.totalTrades + 1,
            lastTradeAt: new Date().toISOString(),
          })

          executedCount++
          results.push({ userId: user.id, pair: signal.pair, direction: signal.direction, success: true })
        } catch (e) {
          const err = e instanceof Error ? e.message : 'Trade failed'
          results.push({ userId: user.id, pair: signal.pair, direction: signal.direction, success: false, error: err })
        }

        await new Promise((r) => setTimeout(r, 200))
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${autoUsers.length} users`,
      executed: executedCount,
      results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execute failed'
    console.error('Cron execute error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}