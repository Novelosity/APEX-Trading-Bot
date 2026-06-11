export const runtime = 'nodejs'
export const preferredRegion = 'fra1'

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getAllUsers, getSignals, saveTrade, updateBotState, markSignalExecuted, getOpenTrades, getBotState, getDailyTradeCount, incrementDailyTradeCount, getLastLossAt } from '@/lib/storage'
import { checkCanTrade } from '@/lib/risk'
import { calculateTradeSpec } from '@/lib/position-sizing'
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

const PAPER_BALANCE = 10000

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
      const openTrades = await getOpenTrades(user.id)
      const botState = await getBotState(user.id)
      const tradesToday = await getDailyTradeCount(user.id)
      const lastLossAt = await getLastLossAt(user.id) || undefined

      // Get pending HIGH and ULTRA_HIGH signals for this user or external
      const userSignals = await getSignals(user.id, 50)
      const externalSignals = await getSignals('external', 50)
      const pendingSignals = [...userSignals, ...externalSignals].filter(
        (s) => !s.executed && (s.tier === 'HIGH' || s.tier === 'ULTRA_HIGH')
      )

      for (const signal of pendingSignals) {
        try {
          const entry = signal.entry
          if (!entry || entry === 0) {
            results.push({ userId: user.id, pair: signal.pair, direction: signal.direction, success: false, error: 'No entry price' })
            continue
          }

          const atr = PAIRS_ATR_APPROX[signal.pair] || entry * 0.01

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

          // Paper trading mode
          if (user.paperMode) {
            const availableBalance = PAPER_BALANCE * (user.balancePct / 100)

            const paperCanCheck = await checkCanTrade(user.id, signal.pair, signal.direction, openTrades, user, availableBalance, tradesToday, lastLossAt)
            if (!paperCanCheck.allowed) {
              continue
            }

            const spec = calculateTradeSpec({
              balance: availableBalance,
              user,
              entry,
              sl,
              tp2,
              direction: signal.direction,
              pair: signal.pair,
              score: signal.score || 85,
              consecutiveLosses: botState.consecutiveLosses,
            })

            if (!spec.isValid) {
              results.push({ userId: user.id, pair: signal.pair, direction: signal.direction, success: false, error: spec.invalidReason })
              continue
            }

            const trade: Trade = {
              id: randomUUID(),
              userId: user.id,
              pair: signal.pair,
              direction: signal.direction,
              entryPrice: entry,
              positionSize: spec.positionSizeUsd,
              slPrice: sl,
              tp1Price: tp1,
              tp2Price: tp2,
              tp3Price: tp3,
              status: 'open',
              openedAt: new Date().toISOString(),
              notes: '[PAPER]',
            }

            await saveTrade(trade)
            await markSignalExecuted(signal.id, trade.id)
            await updateBotState(user.id, {
              totalTrades: botState.totalTrades + 1,
              lastTradeAt: new Date().toISOString(),
            })
            await incrementDailyTradeCount(user.id)

            executedCount++
            results.push({ userId: user.id, pair: signal.pair, direction: signal.direction, success: true })
            continue
          }

          // Live trading mode
          const { ExchangeClient } = await import('@/lib/exchange')
          const client = new ExchangeClient(user)
          const balanceData = await client.fetchBalance()
          const availableBalance = balanceData.free * (user.balancePct / 100)

          // Re-check with actual balance
          const liveCanCheck = await checkCanTrade(user.id, signal.pair, signal.direction, openTrades, user, availableBalance, tradesToday, lastLossAt)
          if (!liveCanCheck.allowed) {
            continue
          }

          const ticker = await client.fetchTicker(signal.pair)
          const liveEntry = ticker.last || entry

          if (!liveEntry || liveEntry === 0) {
            results.push({ userId: user.id, pair: signal.pair, direction: signal.direction, success: false, error: 'No price' })
            continue
          }

          // Slippage guard: skip if price moved > 0.5% since signal
          const slippage = Math.abs(liveEntry - entry) / entry
          if (slippage > 0.005) {
            results.push({ userId: user.id, pair: signal.pair, direction: signal.direction, success: false, error: `Slippage too high: ${(slippage * 100).toFixed(2)}%` })
            continue
          }

          const spec = calculateTradeSpec({
            balance: availableBalance,
            user,
            entry: liveEntry,
            sl,
            tp2,
            direction: signal.direction,
            pair: signal.pair,
            score: signal.score || 85,
            consecutiveLosses: botState.consecutiveLosses,
          })

          if (!spec.isValid) {
            results.push({ userId: user.id, pair: signal.pair, direction: signal.direction, success: false, error: spec.invalidReason })
            continue
          }

          if (user.tradingMode === 'futures') {
            await client.setLeverage(signal.pair, user.leverage)
          }

          const side = signal.direction === 'long' ? 'buy' : 'sell'
          const order = await client.createMarketOrder(signal.pair, side, spec.quantityBase)

          const trade: Trade = {
            id: randomUUID(),
            userId: user.id,
            pair: signal.pair,
            direction: signal.direction,
            entryPrice: order.price || liveEntry,
            positionSize: spec.positionSizeUsd,
            slPrice: sl,
            tp1Price: tp1,
            tp2Price: tp2,
            tp3Price: tp3,
            status: 'open',
            openedAt: new Date().toISOString(),
            orderId: order.id,
          }

          await saveTrade(trade)
          await markSignalExecuted(signal.id, trade.id)
          await updateBotState(user.id, {
            totalTrades: botState.totalTrades + 1,
            lastTradeAt: new Date().toISOString(),
          })
          await incrementDailyTradeCount(user.id)

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
