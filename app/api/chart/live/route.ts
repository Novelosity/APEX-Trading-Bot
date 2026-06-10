export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getOpenTrades, getTrades } from '@/lib/storage'
import { calcEMA, calcRSI, calcMACD } from '@/lib/signals'

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession()

    const { searchParams } = new URL(request.url)
    const pair = searchParams.get('pair') || 'BTC/USDT'
    const timeframe = searchParams.get('timeframe') || '1h'

    // OHLCV is public data — create unauthenticated CCXT client using exchange from session
    const exchangeId = session.exchange || 'binance'
    const ccxt = await import('ccxt')
    const ExchangeClass = (ccxt as any)[exchangeId]
    if (!ExchangeClass) {
      return NextResponse.json({ success: false, error: `Exchange ${exchangeId} not supported` }, { status: 400 })
    }

    const ex = new ExchangeClass({ enableRateLimit: true })

    // Apply KuCoin proxy if needed (public endpoints also blocked in US)
    if (exchangeId === 'kucoin') {
      const p = 'https://kucoin-proxy-apex.fly.dev'
      const api = ex.urls['api']
      api['public'] = p
      api['private'] = p
      api['futuresPublic'] = `${p}/futures`
      api['futuresPrivate'] = `${p}/futures`
    }

    const raw = await ex.fetchOHLCV(pair, timeframe, undefined, 200)
    const candles = raw.map((c: any[]) => ({
      timestamp: c[0] as number,
      open: c[1] as number,
      high: c[2] as number,
      low: c[3] as number,
      close: c[4] as number,
      volume: c[5] as number,
    }))

    if (candles.length < 50) {
      return NextResponse.json({ success: false, error: 'Not enough candle data' }, { status: 400 })
    }

    const closes = candles.map((c: { close: number }) => c.close)
    const n = candles.length

    const rawEma9 = calcEMA(closes, 9)
    const rawEma21 = calcEMA(closes, 21)
    const rawEma50 = calcEMA(closes, 50)
    const rawRsi = calcRSI(closes, 14)
    const { macd: rawMacd, signal: rawSignal, histogram: rawHist } = calcMACD(closes)

    function align<T>(arr: T[]): (T | null)[] {
      const pad = n - arr.length
      return [...Array(pad).fill(null), ...arr]
    }

    // Fetch trades — graceful fallback if KV unavailable
    let openTrades: Awaited<ReturnType<typeof getOpenTrades>> = []
    let closedTrades: Awaited<ReturnType<typeof getTrades>> = []
    try {
      const [open, all] = await Promise.all([
        getOpenTrades(session.userId),
        getTrades(session.userId, 100),
      ])
      openTrades = open.filter((t) => t.pair === pair)
      closedTrades = all.filter((t) => t.pair === pair && t.status === 'closed' && t.closedAt).slice(0, 30)
    } catch {
      // trades are optional — chart still renders without them
    }

    return NextResponse.json({
      success: true,
      data: {
        candles,
        indicators: {
          ema9: align(rawEma9),
          ema21: align(rawEma21),
          ema50: align(rawEma50),
          rsi: align(rawRsi),
          macd: align(rawMacd),
          macdSignal: align(rawSignal),
          macdHist: align(rawHist),
        },
        trades: {
          open: openTrades,
          closed: closedTrades,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch chart data'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
