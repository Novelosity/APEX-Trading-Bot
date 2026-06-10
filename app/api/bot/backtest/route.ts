export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * APEX Backtest Engine
 *
 * Walk-forward backtest using actual exchange OHLCV data.
 * Uses the live signal engine — no look-ahead bias (window slides forward).
 *
 * Limitations:
 * - Exchange API typically provides 1000 candles max per call
 * - For BTC/USDT 1h: ~42 days of data
 * - Results are indicative only — not a guarantee of future performance
 * - Does not account for: funding rates, partial fills, network latency
 *
 * Test process:
 * 1. Fetch max available OHLCV history
 * 2. Slide a 250-candle analysis window forward
 * 3. Generate signal on each window
 * 4. Simulate trade outcome (TP1/TP2/TP3 or SL hit) on next candles
 * 5. Record results with fees and slippage
 */

import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import type { SessionData, BacktestResult } from '@/lib/types'
import type { OHLCVCandle } from '@/lib/exchange'
import { getUser } from '@/lib/storage'
import { ExchangeClient } from '@/lib/exchange'
import { generateSignal } from '@/lib/signals'

const SESSION_OPTIONS = {
  cookieName: 'apex_session',
  password: process.env.SESSION_SECRET || 'dev-secret-change-in-production-32chars',
  cookieOptions: { secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30 },
}

const ROUND_TRIP_FEE_PCT = 0.002  // 0.2% round-trip (market orders)
const SLIPPAGE_PCT       = 0.0003 // 0.03% slippage estimate
const TP1_CLOSE_PCT      = 0.30   // 30% of position at TP1
const TP2_CLOSE_PCT      = 0.40   // 40% of position at TP2
const TP3_CLOSE_PCT      = 0.30   // Remaining 30% at TP3 or trailing

interface SimulatedTrade {
  entryPrice: number
  exitPrice: number
  direction: 'long' | 'short'
  pnlPct: number         // net pnl% after fees/slippage
  closeReason: 'tp1' | 'tp2' | 'tp3' | 'sl'
  score: number
  openBar: number        // index in OHLCV array where trade opened
}

/**
 * Simulate trade outcome: scan forward candles to find which level hits first.
 * Uses partial close model: TP1 30%, TP2 40%, TP3 30%.
 * If only TP1 hits, remaining closes at sl (worst case).
 */
function simulateTrade(
  candles: OHLCVCandle[],
  startIdx: number,
  entry: number,
  sl: number,
  tp1: number,
  tp2: number,
  tp3: number,
  direction: 'long' | 'short',
  maxBars = 100
): Omit<SimulatedTrade, 'score' | 'openBar' | 'direction'> {
  const isLong = direction === 'long'
  const feePct = ROUND_TRIP_FEE_PCT + SLIPPAGE_PCT
  const effectiveEntry = isLong ? entry * (1 + SLIPPAGE_PCT) : entry * (1 - SLIPPAGE_PCT)

  let remainingPct = 1.0
  let realizedPnl = 0
  let tp1Hit = false
  let tp2Hit = false

  const endIdx = Math.min(startIdx + maxBars, candles.length)

  for (let i = startIdx; i < endIdx; i++) {
    const candle = candles[i]
    const high = candle.high
    const low = candle.low

    if (isLong) {
      if (low <= sl) {
        // SL hit — close remaining position
        const exitPct = (sl - effectiveEntry) / effectiveEntry - feePct
        realizedPnl += remainingPct * exitPct
        return { entryPrice: entry, exitPrice: sl, pnlPct: realizedPnl, closeReason: tp1Hit ? 'tp2' : 'sl' }
      }
      if (!tp1Hit && high >= tp1) {
        realizedPnl += TP1_CLOSE_PCT * ((tp1 - effectiveEntry) / effectiveEntry - feePct)
        remainingPct -= TP1_CLOSE_PCT
        tp1Hit = true
      }
      if (tp1Hit && !tp2Hit && high >= tp2) {
        realizedPnl += TP2_CLOSE_PCT * ((tp2 - effectiveEntry) / effectiveEntry - feePct)
        remainingPct -= TP2_CLOSE_PCT
        tp2Hit = true
      }
      if (tp2Hit && high >= tp3) {
        realizedPnl += TP3_CLOSE_PCT * ((tp3 - effectiveEntry) / effectiveEntry - feePct)
        remainingPct -= TP3_CLOSE_PCT
        return { entryPrice: entry, exitPrice: tp3, pnlPct: realizedPnl, closeReason: 'tp3' }
      }
    } else {
      if (high >= sl) {
        const exitPct = (effectiveEntry - sl) / effectiveEntry - feePct
        realizedPnl += remainingPct * exitPct
        return { entryPrice: entry, exitPrice: sl, pnlPct: realizedPnl, closeReason: tp1Hit ? 'tp2' : 'sl' }
      }
      if (!tp1Hit && low <= tp1) {
        realizedPnl += TP1_CLOSE_PCT * ((effectiveEntry - tp1) / effectiveEntry - feePct)
        remainingPct -= TP1_CLOSE_PCT
        tp1Hit = true
      }
      if (tp1Hit && !tp2Hit && low <= tp2) {
        realizedPnl += TP2_CLOSE_PCT * ((effectiveEntry - tp2) / effectiveEntry - feePct)
        remainingPct -= TP2_CLOSE_PCT
        tp2Hit = true
      }
      if (tp2Hit && low <= tp3) {
        realizedPnl += TP3_CLOSE_PCT * ((effectiveEntry - tp3) / effectiveEntry - feePct)
        remainingPct -= TP3_CLOSE_PCT
        return { entryPrice: entry, exitPrice: tp3, pnlPct: realizedPnl, closeReason: 'tp3' }
      }
    }
  }

  // Timeout — close at last available price
  const lastCandle = candles[Math.min(endIdx - 1, candles.length - 1)]
  const lastPrice = lastCandle.close
  const timeoutPnl = isLong
    ? (lastPrice - effectiveEntry) / effectiveEntry - feePct
    : (effectiveEntry - lastPrice) / effectiveEntry - feePct
  realizedPnl += remainingPct * timeoutPnl

  return {
    entryPrice: entry,
    exitPrice: lastPrice,
    pnlPct: realizedPnl,
    closeReason: realizedPnl >= 0 ? 'tp1' : 'sl',
  }
}

function computeStats(trades: SimulatedTrade[], startDate: string, endDate: string, pair: string, timeframe: string, totalBars: number, signalsGenerated: number): BacktestResult {
  const wins = trades.filter((t) => t.pnlPct > 0)
  const losses = trades.filter((t) => t.pnlPct <= 0)
  const totalPnl = trades.reduce((s, t) => s + t.pnlPct, 0)
  const grossProfit = wins.reduce((s, t) => s + t.pnlPct, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0))

  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : wins.length > 0 ? 999 : null

  // Max drawdown (simulate equity curve)
  let peak = 1.0
  let equity = 1.0
  let maxDD = 0
  for (const t of trades) {
    equity *= 1 + t.pnlPct
    if (equity > peak) peak = equity
    const dd = (peak - equity) / peak
    if (dd > maxDD) maxDD = dd
  }

  // Sharpe ratio (simplified — uses trade returns as daily proxy)
  let sharpe: number | null = null
  if (trades.length >= 10) {
    const mean = totalPnl / trades.length
    const variance = trades.reduce((s, t) => s + Math.pow(t.pnlPct - mean, 2), 0) / trades.length
    const stdDev = Math.sqrt(variance)
    if (stdDev > 0) sharpe = (mean / stdDev) * Math.sqrt(252)
  }

  // Max consecutive losses
  let maxConsecLoss = 0
  let consecLoss = 0
  for (const t of trades) {
    if (t.pnlPct <= 0) {
      consecLoss++
      maxConsecLoss = Math.max(maxConsecLoss, consecLoss)
    } else {
      consecLoss = 0
    }
  }

  const winRate = trades.length > 0 ? wins.length / trades.length : 0
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0

  return {
    pair,
    timeframe,
    totalTrades: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: Math.round(winRate * 100) / 100,
    profitFactor: profitFactor !== null ? Math.round(profitFactor * 100) / 100 : null,
    netPnlPct: Math.round(totalPnl * 10000) / 100, // as percentage
    maxDrawdownPct: Math.round(maxDD * 10000) / 100,
    sharpeRatio: sharpe !== null ? Math.round(sharpe * 100) / 100 : null,
    expectancyPct: trades.length > 0 ? Math.round((totalPnl / trades.length) * 10000) / 100 : 0,
    avgWinPct: Math.round(avgWin * 10000) / 100,
    avgLossPct: Math.round(avgLoss * 10000) / 100,
    bestTradePct: trades.length > 0 ? Math.round(Math.max(...trades.map((t) => t.pnlPct)) * 10000) / 100 : 0,
    worstTradePct: trades.length > 0 ? Math.round(Math.min(...trades.map((t) => t.pnlPct)) * 10000) / 100 : 0,
    consecutiveLossesMax: maxConsecLoss,
    startDate,
    endDate,
    totalBars,
    signalsGenerated,
    feePct: ROUND_TRIP_FEE_PCT * 100,
    slippagePct: SLIPPAGE_PCT * 100,
    passedFilter: (profitFactor ?? 0) >= 1.5 && maxDD < 0.2 && totalPnl > 0,
  }
}

export async function POST(request: Request) {
  const session = await getIronSession<SessionData>(await cookies(), SESSION_OPTIONS)
  if (!session.userId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }

  const user = await getUser(session.userId)
  if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const pair = (body.pair as string) || 'BTC/USDT'
  const timeframe = (body.timeframe as string) || '1h'

  try {
    const client = new ExchangeClient(user)

    // Fetch maximum available history
    const candles1h: OHLCVCandle[] = await client.fetchOHLCV(pair, timeframe, 1000)
    const candles4h: OHLCVCandle[] = await client.fetchOHLCV(pair, '4h', 500)
    const candles1d: OHLCVCandle[] = await client.fetchOHLCV(pair, '1d', 500)

    if (candles1h.length < 300) {
      return NextResponse.json({
        success: false,
        error: `Insufficient historical data: only ${candles1h.length} candles available. Need 300+.`,
      }, { status: 422 })
    }

    const WINDOW = 250    // Candles used for signal analysis
    const STEP = 10       // Advance 10 bars per signal attempt (avoid over-trading)
    const FORWARD = 100   // Bars to simulate trade outcome

    const simTrades: SimulatedTrade[] = []
    let signalsGenerated = 0

    for (let i = WINDOW; i < candles1h.length - FORWARD; i += STEP) {
      const window1h = candles1h.slice(i - WINDOW, i)

      // Build matching 4h and 1d windows by timestamp
      const windowEnd = window1h[window1h.length - 1].timestamp
      const window4h = candles4h.filter((c) => c.timestamp <= windowEnd).slice(-100)
      const window1d = candles1d.filter((c) => c.timestamp <= windowEnd).slice(-60)

      const candlesByTF: Record<string, OHLCVCandle[]> = {
        [timeframe]: window1h,
        '4h': window4h,
        '1d': window1d,
      }

      const signal = generateSignal('backtest', pair, candlesByTF)
      if (!signal) continue

      signalsGenerated++
      const forwardCandles = candles1h.slice(i, i + FORWARD)
      if (forwardCandles.length < 10) continue

      const result = simulateTrade(
        forwardCandles, 0,
        signal.entry, signal.sl, signal.tp1, signal.tp2, signal.tp3,
        signal.direction
      )

      simTrades.push({
        ...result,
        score: signal.score,
        direction: signal.direction,
        openBar: i,
      })
    }

    if (simTrades.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: 'No qualifying signals found in this dataset. This is expected if market conditions did not meet the strategy criteria.',
          pair,
          timeframe,
          barsAnalyzed: candles1h.length,
          signalsGenerated: 0,
        },
      })
    }

    const startDate = candles1h[0] ? new Date(candles1h[0].timestamp).toISOString() : ''
    const endDate = candles1h[candles1h.length - 1] ? new Date(candles1h[candles1h.length - 1].timestamp).toISOString() : ''

    const result = computeStats(simTrades, startDate, endDate, pair, timeframe, candles1h.length, signalsGenerated)

    return NextResponse.json({ success: true, data: result })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backtest failed'
    console.error('Backtest error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
