export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import type { SessionData } from '@/lib/types'
import {
  getUser, getSignal, markSignalExecuted, saveTrade,
  updateBotState, getBotState, getOpenTrades, getTrades,
  getPendingApprovals, removePendingApproval,
  getDailyTradeCount, incrementDailyTradeCount, getLastLossAt,
} from '@/lib/storage'
import { checkCanTrade } from '@/lib/risk'
import { calculateTradeSpec } from '@/lib/position-sizing'
import { ExchangeClient } from '@/lib/exchange'

const SESSION_OPTIONS = {
  cookieName: 'apex_session',
  password: process.env.SESSION_SECRET || 'dev-secret-change-in-production-32chars',
  cookieOptions: { secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30 },
}

async function requireSession(): Promise<{ session: SessionData; error?: never } | { error: NextResponse; session?: never }> {
  const session = await getIronSession<SessionData>(await cookies(), SESSION_OPTIONS)
  if (!session.userId) {
    return { error: NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 }) }
  }
  return { session }
}

const PAPER_BALANCE = 10000
const PAIRS_ATR_APPROX: Record<string, number> = {
  'BTC/USDT': 800, 'ETH/USDT': 45, 'SOL/USDT': 3.5, 'LTC/USDT': 2.5,
  'BNB/USDT': 8, 'XRP/USDT': 0.03, 'ADA/USDT': 0.002, 'MATIC/USDT': 0.05,
  'LINK/USDT': 0.5, 'AVAX/USDT': 2.5, 'ATOM/USDT': 1.2, 'DOT/USDT': 0.8,
}

/** GET /api/bot/approve — list pending approvals */
export async function GET() {
  const { session, error } = await requireSession()
  if (error) return error

  const userId = session!.userId
  const signalIds = await getPendingApprovals(userId)

  // Fetch signal details and filter out expired ones
  const signals = await Promise.all(
    signalIds.map(async (id) => {
      const sig = await getSignal(id)
      if (!sig) return null
      // Expire pending signals older than 2 hours
      if (sig.approvalExpiresAt && new Date(sig.approvalExpiresAt) < new Date()) {
        await removePendingApproval(userId, id)
        return null
      }
      return sig
    })
  )

  return NextResponse.json({
    success: true,
    data: signals.filter(Boolean),
  })
}

/** POST /api/bot/approve — approve or reject a pending signal */
export async function POST(request: Request) {
  const { session, error } = await requireSession()
  if (error) return error

  const userId = session!.userId

  const body = await request.json()
  const { signalId, action } = body as { signalId: string; action: 'approve' | 'reject' }

  if (!signalId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ success: false, error: 'signalId and action (approve|reject) required' }, { status: 400 })
  }

  const signal = await getSignal(signalId)
  if (!signal) {
    return NextResponse.json({ success: false, error: 'Signal not found' }, { status: 404 })
  }

  // Security: ensure this signal belongs to this user
  if (signal.userId !== userId) {
    return NextResponse.json({ success: false, error: 'Not your signal' }, { status: 403 })
  }

  if (signal.executed) {
    await removePendingApproval(userId, signalId)
    return NextResponse.json({ success: false, error: 'Signal already executed' }, { status: 400 })
  }

  if (action === 'reject') {
    await removePendingApproval(userId, signalId)
    return NextResponse.json({ success: true, message: 'Signal rejected' })
  }

  // ── APPROVE: execute the trade ────────────────────────────────────────────
  const user = await getUser(userId)
  if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })

  const openTrades = await getOpenTrades(userId)
  const tradesToday = await getDailyTradeCount(userId)
  const lastLossAt = await getLastLossAt(userId) || undefined

  try {
    // Paper trading mode
    if (user.paperMode) {
      const botState = await getBotState(userId)
      const entry = signal.entry
      const atr = PAIRS_ATR_APPROX[signal.pair] || entry * 0.01
      const availableBalance = PAPER_BALANCE * (user.balancePct / 100)

      const riskCheck = await checkCanTrade(userId, signal.pair, signal.direction, openTrades, user, availableBalance, tradesToday, lastLossAt)
      if (!riskCheck.allowed) {
        await removePendingApproval(userId, signalId)
        return NextResponse.json({ success: false, error: riskCheck.reason }, { status: 409 })
      }

      const spec = calculateTradeSpec({
        balance: availableBalance,
        user,
        entry,
        sl: signal.sl,
        tp2: signal.tp2,
        direction: signal.direction,
        pair: signal.pair,
        score: signal.score,
        consecutiveLosses: botState.consecutiveLosses,
      })

      const slDist = Math.abs(entry - signal.sl)
      const sl = signal.sl
      const tp1 = signal.direction === 'long' ? entry + slDist : entry - slDist
      const tp2 = signal.direction === 'long' ? entry + slDist * 2 : entry - slDist * 2
      const tp3 = signal.direction === 'long' ? entry + slDist * 3 : entry - slDist * 3

      const trade = {
        id: randomUUID(),
        userId,
        pair: signal.pair,
        direction: signal.direction,
        entryPrice: entry,
        positionSize: spec.positionSizeUsd,
        slPrice: sl,
        tp1Price: tp1,
        tp2Price: tp2,
        tp3Price: tp3,
        status: 'open' as const,
        openedAt: new Date().toISOString(),
        notes: '[PAPER] Manual approval',
      }

      const { saveTrade: saveT } = await import('@/lib/storage')
      await saveT(trade)
      await markSignalExecuted(signalId, trade.id)
      await updateBotState(userId, { totalTrades: botState.totalTrades + 1, lastTradeAt: new Date().toISOString() })
      await incrementDailyTradeCount(userId)
      await removePendingApproval(userId, signalId)

      return NextResponse.json({ success: true, data: { tradeId: trade.id, paper: true } })
    }

    // Live mode
    const userClient = new ExchangeClient(user)
    const balanceData = await userClient.fetchBalance()
    const availableBalance = balanceData.free * (user.balancePct / 100)

    const riskCheck = await checkCanTrade(userId, signal.pair, signal.direction, openTrades, user, availableBalance, tradesToday, lastLossAt)
    if (!riskCheck.allowed) {
      await removePendingApproval(userId, signalId)
      return NextResponse.json({ success: false, error: riskCheck.reason }, { status: 409 })
    }

    const botState = await getBotState(userId)
    const spec = calculateTradeSpec({
      balance: availableBalance,
      user,
      entry: signal.entry,
      sl: signal.sl,
      tp2: signal.tp2,
      direction: signal.direction,
      pair: signal.pair,
      score: signal.score,
      consecutiveLosses: botState.consecutiveLosses,
    })

    if (!spec.isValid) {
      await removePendingApproval(userId, signalId)
      return NextResponse.json({ success: false, error: spec.invalidReason }, { status: 409 })
    }

    // Re-fetch live price
    const ticker = await userClient.fetchTicker(signal.pair)
    const liveEntry = ticker.last || signal.entry
    const slippage = Math.abs(liveEntry - signal.entry) / signal.entry

    if (slippage > 0.005) {
      return NextResponse.json({ success: false, error: `Price moved significantly since signal (${(slippage * 100).toFixed(2)}% slippage). Signal may be stale.` }, { status: 409 })
    }

    if (user.tradingMode === 'futures') {
      await userClient.setLeverage(signal.pair, user.leverage)
    }

    const side = signal.direction === 'long' ? 'buy' : 'sell'
    const quantity = spec.positionSizeUsd / liveEntry
    const order = await userClient.createMarketOrder(signal.pair, side, quantity)

    const slDist = Math.abs(liveEntry - signal.sl)
    const tp1 = signal.direction === 'long' ? liveEntry + slDist : liveEntry - slDist
    const tp2 = signal.direction === 'long' ? liveEntry + slDist * 2 : liveEntry - slDist * 2
    const tp3 = signal.direction === 'long' ? liveEntry + slDist * 3 : liveEntry - slDist * 3

    const trade = {
      id: randomUUID(),
      userId,
      pair: signal.pair,
      direction: signal.direction,
      entryPrice: order.price || liveEntry,
      positionSize: spec.positionSizeUsd,
      slPrice: signal.sl,
      tp1Price: tp1,
      tp2Price: tp2,
      tp3Price: tp3,
      status: 'open' as const,
      openedAt: new Date().toISOString(),
      orderId: order.id,
      notes: 'Manual approval',
    }

    const { saveTrade: saveT } = await import('@/lib/storage')
    await saveT(trade)
    await markSignalExecuted(signalId, trade.id)
    await updateBotState(userId, { totalTrades: botState.totalTrades + 1, lastTradeAt: new Date().toISOString() })
    await incrementDailyTradeCount(userId)
    await removePendingApproval(userId, signalId)

    return NextResponse.json({ success: true, data: { tradeId: trade.id, paper: false, executedAt: liveEntry } })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Execution failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
