export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireSession, getSession } from '@/lib/session'
import { getUser, saveSignal, getAllSignalSources, saveExternalSignal, savePendingApproval } from '@/lib/storage'
import { ExchangeClient } from '@/lib/exchange'
import type { OHLCVCandle } from '@/lib/exchange'
import { generateSignal } from '@/lib/signals'
import {
  analyzeFundingRates,
  analyzeWhaleTransactions,
  analyzeOpenInterest,
  analyzeSocialSentiment,
  calculateEnhancedSignal,
} from '@/lib/signal-providers'
import type { Signal, SignalSource } from '@/lib/types'

const SCAN_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'LTC/USDT',
  'LINK/USDT', 'AVAX/USDT', 'ADA/USDT', 'DOT/USDT', 'ATOM/USDT',
]
const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d']

async function processSource(
  source: SignalSource,
  pair: string,
  closesByTF: Record<string, number[]>,
  candlesByTF: Record<string, OHLCVCandle[]>,
  userId: string,
): Promise<Signal | null> {
  try {
    const closes = closesByTF['1h'] || []
    const entry = closes[closes.length - 1] || 0
    if (!entry) return null

    let conf = 0
    let direction: 'long' | 'short' = 'long'

    switch (source.type) {
      case 'funding_rate': {
        const r = await analyzeFundingRates(pair)
        if (!r || r.confidence <= 50) return null
        conf = r.confidence
        direction = r.longBias > 0 ? 'long' : r.longBias < 0 ? 'short'
          : (calculateEnhancedSignal(pair, candlesByTF['1h'] || [], closes).scoreBoost > 0 ? 'long' : 'short')
        break
      }
      case 'whale': {
        const r = await analyzeWhaleTransactions(pair)
        if (!r || r.confidence <= 50) return null
        conf = r.confidence
        direction = (r.direction || 0) > 0 ? 'long' : 'short'
        break
      }
      case 'open_interest': {
        const r = await analyzeOpenInterest(pair)
        if (!r || r.confidence <= 50) return null
        conf = r.confidence
        direction = r.bullish ? 'long' : 'short'
        break
      }
      case 'social':
      case 'sentiment': {
        const r = await analyzeSocialSentiment(pair)
        if (!r || r.confidence <= 50) return null
        conf = r.confidence
        direction = r.bullish ? 'long' : 'short'
        break
      }
      default:
        return null
    }

    const c = Math.round(Math.max(conf, 50))
    await saveExternalSignal({
      id: randomUUID(),
      sourceId: source.id,
      pair,
      direction,
      confidence: c,
      price: entry,
      metadata: {},
      timestamp: new Date().toISOString(),
    })

    const signal: Signal = {
      id: randomUUID(),
      userId,
      pair,
      direction,
      score: Math.min(95, 50 + c),
      tier: c >= 80 ? 'ULTRA_HIGH' : c >= 65 ? 'HIGH' : 'MODERATE',
      entry,
      tp1: direction === 'long' ? entry * 1.025 : entry * 0.975,
      tp2: direction === 'long' ? entry * 1.05 : entry * 0.95,
      tp3: direction === 'long' ? entry * 1.08 : entry * 0.92,
      sl: direction === 'long' ? entry * 0.97 : entry * 1.03,
      timeframe: '1h',
      timeframesAligned: [source.id],
      executed: false,
      createdAt: new Date().toISOString(),
    }
    return signal
  } catch {
    return null
  }
}

/** POST /api/bot/scan — authenticated manual scan trigger */
export async function POST() {
  try {
    const session = await requireSession()
    const user = await getUser(session.userId)
    if (!user || !user.exchange) {
      return NextResponse.json({ success: false, error: 'Exchange not configured. Complete onboarding first.' }, { status: 400 })
    }

    const client = new ExchangeClient(user)
    const signals: Signal[] = []
    const signalSources = await getAllSignalSources()
    const enabledSources = signalSources.filter((s) => s.enabled)

    for (const pair of SCAN_PAIRS) {
      try {
        const candlesByTF: Record<string, OHLCVCandle[]> = {}
        const closesByTF: Record<string, number[]> = {}

        for (const tf of TIMEFRAMES) {
          try {
            const candles = await client.fetchOHLCV(pair, tf, 500)
            candlesByTF[tf] = candles
            closesByTF[tf] = candles.map((c) => c.close)
          } catch {}
        }

        // Technical signal
        const techSignal = generateSignal(user.id, pair, candlesByTF)
        if (techSignal && techSignal.score >= 75) {
          if (user.execMode === 'approval') {
            const withApproval = {
              ...techSignal,
              pendingApproval: true,
              approvalExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            }
            await saveSignal(withApproval)
            await savePendingApproval(user.id, techSignal.id)
          } else {
            await saveSignal(techSignal)
          }
          signals.push(techSignal)
        }

        // External source signals — save with userId so they appear in the user's feed
        for (const source of enabledSources) {
          const extSignal = await processSource(source, pair, closesByTF, candlesByTF, user.id)
          if (extSignal) {
            await saveSignal(extSignal)
            signals.push(extSignal)
          }
        }

        await new Promise((r) => setTimeout(r, 150))
      } catch {}
    }

    return NextResponse.json({
      success: true,
      data: signals,
      scanned: SCAN_PAIRS.length,
      found: signals.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
