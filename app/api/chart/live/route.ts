export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getUser } from '@/lib/storage'
import { ExchangeClient } from '@/lib/exchange'
import { getOpenTrades, getTrades } from '@/lib/storage'
import { calcEMA, calcRSI, calcMACD } from '@/lib/signals'

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession()
    const user = await getUser(session.userId)
    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const pair = searchParams.get('pair') || 'BTC/USDT'
    const timeframe = searchParams.get('timeframe') || '1h'

    const client = new ExchangeClient(user)
    const candles = await client.fetchOHLCV(pair, timeframe, 200)

    if (candles.length < 50) {
      return NextResponse.json({ success: false, error: 'Not enough candle data' }, { status: 400 })
    }

    const closes = candles.map((c) => c.close)
    const n = candles.length

    // Calculate indicators aligned to candle indices
    const rawEma9 = calcEMA(closes, 9)
    const rawEma21 = calcEMA(closes, 21)
    const rawEma50 = calcEMA(closes, 50)
    const rawRsi = calcRSI(closes, 14)
    const { macd: rawMacd, signal: rawSignal, histogram: rawHist } = calcMACD(closes)

    // Align each indicator array to candle timestamps (pad front with nulls)
    function align<T>(arr: T[]): (T | null)[] {
      const pad = n - arr.length
      return [...Array(pad).fill(null), ...arr]
    }

    const ema9 = align(rawEma9)
    const ema21 = align(rawEma21)
    const ema50 = align(rawEma50)
    const rsi = align(rawRsi)

    // MACD: macd line starts at slowPeriod-1 (25), signal 8 bars later
    const macdLine = align(rawMacd)
    const macdSignal = align(rawSignal)
    const macdHist = align(rawHist)

    // Fetch trades for this pair
    const [openTrades, allTrades] = await Promise.all([
      getOpenTrades(session.userId),
      getTrades(session.userId, 100),
    ])

    const pairOpen = openTrades.filter((t) => t.pair === pair)
    const pairClosed = allTrades
      .filter((t) => t.pair === pair && t.status === 'closed' && t.closedAt)
      .slice(0, 30)

    return NextResponse.json({
      success: true,
      data: {
        candles,
        indicators: {
          ema9,
          ema21,
          ema50,
          rsi,
          macd: macdLine,
          macdSignal,
          macdHist,
        },
        trades: {
          open: pairOpen,
          closed: pairClosed,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch chart data'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
