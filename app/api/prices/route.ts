export const runtime = 'nodejs'
export const preferredRegion = 'fra1'

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getOpenTrades } from '@/lib/storage'

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession()

    // Get pairs from open trades OR from query param
    const { searchParams } = new URL(request.url)
    const queryPairs = searchParams.get('pairs')

    let pairs: string[]
    if (queryPairs) {
      pairs = queryPairs.split(',').map((p) => p.trim()).filter(Boolean)
    } else {
      const openTrades = await getOpenTrades(session.userId)
      pairs = [...new Set(openTrades.map((t) => t.pair))]
    }

    if (pairs.length === 0) {
      return NextResponse.json({ success: true, data: {} })
    }

    const exchangeId = session.exchange || 'binance'
    const ccxt = await import('ccxt')
    const ExchangeClass = (ccxt as any)[exchangeId]
    if (!ExchangeClass) {
      return NextResponse.json({ success: false, error: 'Exchange not found' }, { status: 400 })
    }

    const ex = new ExchangeClass({ enableRateLimit: true })

    // Apply KuCoin proxy
    if (exchangeId === 'kucoin') {
      const p = 'https://kucoin-proxy-apex.fly.dev'
      const api = ex.urls['api']
      api['public'] = p
      api['private'] = p
      api['futuresPublic'] = `${p}/futures`
      api['futuresPrivate'] = `${p}/futures`
    }

    const prices: Record<string, number> = {}
    await Promise.all(
      pairs.map(async (pair) => {
        try {
          const ticker = await ex.fetchTicker(pair)
          if (ticker.last) prices[pair] = ticker.last
        } catch {
          // skip failed pair
        }
      })
    )

    return NextResponse.json({ success: true, data: prices })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch prices'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
