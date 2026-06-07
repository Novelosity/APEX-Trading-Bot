export const runtime = 'nodejs'
export const preferredRegion = 'fra1'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireSession } from '@/lib/session'
import { getUser, getOpenTrades, saveTrade, updateTrade, getBotState, updateBotState } from '@/lib/storage'
import { ExchangeClient } from '@/lib/exchange'
import { calculatePositionSize, checkCanTrade } from '@/lib/risk'
import type { Trade } from '@/lib/types'

const PAIRS_ATR_APPROX: Record<string, number> = {
  'BTC/USDT': 800,
  'ETH/USDT': 45,
  'SOL/USDT': 3.5,
  'LTC/USDT': 2.5,
  'BNB/USDT': 8,
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession()
    const body = await request.json()
    const { pair, direction, action, tradeId } = body

    const user = await getUser(session.userId)
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const client = new ExchangeClient(user)
    const openTrades = await getOpenTrades(session.userId)

    // ── Close trade ────────────────────────────────────────────────────────────
    if (action === 'close') {
      if (!tradeId) {
        return NextResponse.json({ success: false, error: 'tradeId required for close action' }, { status: 400 })
      }

      const trade = openTrades.find((t) => t.id === tradeId)
      if (!trade) {
        return NextResponse.json({ success: false, error: 'Trade not found or already closed' }, { status: 404 })
      }

      // Get current price
      const ticker = await client.fetchTicker(trade.pair)
      const exitPrice = ticker.last

      const pnlPct = trade.direction === 'long'
        ? ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - exitPrice) / trade.entryPrice) * 100

      const pnlUsd = (pnlPct / 100) * trade.positionSize

      const updated = await updateTrade(trade.id, session.userId, {
        status: 'closed',
        exitPrice,
        pnlUsd,
        pnlPct,
        closeReason: 'manual',
        closedAt: new Date().toISOString(),
      })

      // Update bot state P&L
      const botState = await getBotState(session.userId)
      await updateBotState(session.userId, {
        dailyPnl: botState.dailyPnl + pnlUsd,
        weeklyPnl: botState.weeklyPnl + pnlUsd,
        consecutiveLosses: pnlUsd >= 0 ? 0 : botState.consecutiveLosses + 1,
        winCount: pnlUsd >= 0 ? botState.winCount + 1 : botState.winCount,
        lossCount: pnlUsd < 0 ? botState.lossCount + 1 : botState.lossCount,
        lastTradeAt: new Date().toISOString(),
      })

      return NextResponse.json({ success: true, data: updated })
    }

    // ── Close all trades ───────────────────────────────────────────────────────
    if (action === 'close_all') {
      const results = []
      for (const trade of openTrades) {
        const ticker = await client.fetchTicker(trade.pair)
        const exitPrice = ticker.last

        const pnlPct = trade.direction === 'long'
          ? ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100
          : ((trade.entryPrice - exitPrice) / trade.entryPrice) * 100
        const pnlUsd = (pnlPct / 100) * trade.positionSize

        await updateTrade(trade.id, session.userId, {
          status: 'closed',
          exitPrice,
          pnlUsd,
          pnlPct,
          closeReason: 'manual',
          closedAt: new Date().toISOString(),
        })

        const botState = await getBotState(session.userId)
        await updateBotState(session.userId, {
          dailyPnl: botState.dailyPnl + pnlUsd,
          weeklyPnl: botState.weeklyPnl + pnlUsd,
          consecutiveLosses: pnlUsd >= 0 ? 0 : botState.consecutiveLosses + 1,
          winCount: pnlUsd >= 0 ? botState.winCount + 1 : botState.winCount,
          lossCount: pnlUsd < 0 ? botState.lossCount + 1 : botState.lossCount,
        })

        results.push({ id: trade.id, pair: trade.pair, pnlUsd })
      }

      return NextResponse.json({ success: true, data: { closed: results.length, results } })
    }

    // ── Open trade ─────────────────────────────────────────────────────────────
    if (action === 'open') {
      if (!pair || !direction) {
        return NextResponse.json({ success: false, error: 'pair and direction required' }, { status: 400 })
      }

      const balanceData = await client.fetchBalance()
      const availableBalance = balanceData.free * (user.balancePct / 100)

      const canCheck = await checkCanTrade(session.userId, pair, direction, openTrades, user, availableBalance)
      if (!canCheck.allowed) {
        return NextResponse.json({ success: false, error: canCheck.reason }, { status: 403 })
      }

      // Get current price
      const ticker = await client.fetchTicker(pair)
      const entry = ticker.last

      if (!entry || entry === 0) {
        return NextResponse.json({ success: false, error: 'Could not fetch current price' }, { status: 500 })
      }

      // Approximate ATR for SL/TP calculation
      const atr = PAIRS_ATR_APPROX[pair] || entry * 0.01

      const botState = await getBotState(session.userId)
      const positionSize = calculatePositionSize(
        availableBalance,
        user.riskPct,
        entry,
        direction === 'long' ? entry - atr * 1.5 : entry + atr * 1.5,
        botState.consecutiveLosses
      )

      let sl: number, tp1: number, tp2: number, tp3: number

      if (direction === 'long') {
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
        userId: session.userId,
        pair,
        direction,
        entryPrice: entry,
        positionSize,
        slPrice: sl,
        tp1Price: tp1,
        tp2Price: tp2,
        tp3Price: tp3,
        status: 'open',
        openedAt: new Date().toISOString(),
      }

      // Execute on exchange if auto mode
      if (user.execMode === 'auto') {
        const side = direction === 'long' ? 'buy' : 'sell'
        const amountInBase = positionSize / entry

        if (user.tradingMode === 'futures') {
          await client.setLeverage(pair, user.leverage)
        }

        const order = await client.createMarketOrder(pair, side, amountInBase)
        trade.orderId = order.id
        trade.entryPrice = order.price || entry
      }

      await saveTrade(trade)

      await updateBotState(session.userId, {
        totalTrades: botState.totalTrades + 1,
        lastTradeAt: new Date().toISOString(),
      })

      return NextResponse.json({ success: true, data: trade })
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Trade operation failed'
    console.error('Trade error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
