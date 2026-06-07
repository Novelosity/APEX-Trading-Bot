export const runtime = 'nodejs'
export const preferredRegion = 'fra1'

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getAllUsers, saveSignal, getAllSignalSources, saveExternalSignal } from '@/lib/storage'
import { ExchangeClient } from '@/lib/exchange'
import type { OHLCVCandle } from '@/lib/exchange'
import { generateSignal } from '@/lib/signals'
import {
  analyzeFundingRates,
  analyzeWhaleTransactions,
  analyzeOpenInterest,
  analyzeSocialSentiment,
  calculateEnhancedSignal
} from '@/lib/signal-providers'
import type { Signal, SignalSource } from '@/lib/types'

const SCAN_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'LTC/USDT', 'BNB/USDT', 'ADA/USDT', 'MATIC/USDT', 'LINK/USDT', 'AVAX/USDT', 'ATOM/USDT', 'DOT/USDT', 'ARB/USDT', 'OP/USDT']
const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d', '1w']

async function processSignalSource(
  source: SignalSource,
  pair: string,
  closesByTF: Record<string, number[]>,
  candlesByTF: Record<string, OHLCVCandle[]>,
  externalSignals: Signal[]
): Promise<void> {
  try {
    switch (source.type) {
      case 'funding_rate': {
        const result = await analyzeFundingRates(pair)
        if (result && result.confidence > 50) {
          const closes = closesByTF['1h'] || []
          const enhanced = calculateEnhancedSignal(pair, candlesByTF['1h'] || [], closes)
          const entry = closes[closes.length - 1] || 0
          const direction: 'long' | 'short' = result.longBias > 0 ? 'long' : result.longBias < 0 ? 'short' : enhanced.scoreBoost > 0 ? 'long' : 'short'
          const conf = Math.round(Math.max(result.confidence, 50))

          const signal: Signal = {
            id: randomUUID(),
            userId: 'external',
            pair,
            direction,
            score: Math.min(95, 50 + conf),
            tier: conf >= 80 ? 'ULTRA_HIGH' : conf >= 65 ? 'HIGH' : 'MODERATE',
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
          externalSignals.push(signal)
          await saveExternalSignal({
            id: randomUUID(),
            sourceId: source.id,
            pair,
            direction,
            confidence: conf,
            price: entry,
            metadata: { longBias: result.longBias },
            timestamp: new Date().toISOString(),
          })
        }
        break
      }

      case 'whale': {
        const result = await analyzeWhaleTransactions(pair)
        if (result && result.confidence > 50) {
          const closes = closesByTF['1h'] || []
          const entry = closes[closes.length - 1] || 0
          const direction: 'long' | 'short' = (result.direction || 0) > 0 ? 'long' : 'short'
          const conf = Math.round(Math.max(result.confidence, 50))

          const signal: Signal = {
            id: randomUUID(),
            userId: 'external',
            pair,
            direction,
            score: Math.min(95, 50 + conf),
            tier: conf >= 80 ? 'ULTRA_HIGH' : conf >= 65 ? 'HIGH' : 'MODERATE',
            entry,
            tp1: direction === 'long' ? entry * 1.02 : entry * 0.98,
            tp2: direction === 'long' ? entry * 1.04 : entry * 0.96,
            tp3: direction === 'long' ? entry * 1.07 : entry * 0.93,
            sl: direction === 'long' ? entry * 0.97 : entry * 1.03,
            timeframe: '1h',
            timeframesAligned: [source.id],
            executed: false,
            createdAt: new Date().toISOString(),
          }
          externalSignals.push(signal)
          await saveExternalSignal({
            id: randomUUID(),
            sourceId: source.id,
            pair,
            direction,
            confidence: conf,
            price: entry,
            metadata: { direction: result.direction },
            timestamp: new Date().toISOString(),
          })
        }
        break
      }

      case 'open_interest': {
        const result = await analyzeOpenInterest(pair)
        if (result && result.confidence > 50) {
          const closes = closesByTF['1h'] || []
          const entry = closes[closes.length - 1] || 0
          const direction: 'long' | 'short' = result.bullish ? 'long' : 'short'
          const conf = Math.round(Math.max(result.confidence, 50))

          const signal: Signal = {
            id: randomUUID(),
            userId: 'external',
            pair,
            direction,
            score: Math.min(95, 50 + conf),
            tier: conf >= 80 ? 'ULTRA_HIGH' : conf >= 65 ? 'HIGH' : 'MODERATE',
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
          externalSignals.push(signal)
          await saveExternalSignal({
            id: randomUUID(),
            sourceId: source.id,
            pair,
            direction,
            confidence: conf,
            price: entry,
            metadata: { bullish: result.bullish },
            timestamp: new Date().toISOString(),
          })
        }
        break
      }

      case 'social':
      case 'sentiment': {
        const result = await analyzeSocialSentiment(pair)
        if (result && result.confidence > 50) {
          const closes = closesByTF['1h'] || []
          const entry = closes[closes.length - 1] || 0
          const direction: 'long' | 'short' = result.bullish ? 'long' : 'short'
          const conf = Math.round(Math.max(result.confidence, 50))

          const signal: Signal = {
            id: randomUUID(),
            userId: 'external',
            pair,
            direction,
            score: Math.min(95, 50 + conf),
            tier: conf >= 80 ? 'ULTRA_HIGH' : conf >= 65 ? 'HIGH' : 'MODERATE',
            entry,
            tp1: direction === 'long' ? entry * 1.015 : entry * 0.985,
            tp2: direction === 'long' ? entry * 1.03 : entry * 0.97,
            tp3: direction === 'long' ? entry * 1.05 : entry * 0.95,
            sl: direction === 'long' ? entry * 0.97 : entry * 1.03,
            timeframe: '1h',
            timeframesAligned: [source.id],
            executed: false,
            createdAt: new Date().toISOString(),
          }
          externalSignals.push(signal)
          await saveExternalSignal({
            id: randomUUID(),
            sourceId: source.id,
            pair,
            direction,
            confidence: conf,
            price: entry,
            metadata: { bullish: result.bullish },
            timestamp: new Date().toISOString(),
          })
        }
        break
      }
    }
  } catch (e) {
    console.error(`External signal error for ${source.name} on ${pair}:`, e)
  }
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
      return NextResponse.json({ success: true, message: 'No auto-mode users', scanned: 0 })
    }

    const firstUser = autoUsers[0]
    const client = new ExchangeClient(firstUser)

    let signalsFound = 0
    const externalSignals: Signal[] = []

    for (const pair of SCAN_PAIRS) {
      try {
        const candlesByTF: Record<string, OHLCVCandle[]> = {}
        const closesByTF: Record<string, number[]> = {}

        for (const tf of TIMEFRAMES) {
          try {
            const candles = await client.fetchOHLCV(pair, tf, 500)
            candlesByTF[tf] = candles
            closesByTF[tf] = candles.map(c => c.close)
          } catch {}
        }

        const signalSources = await getAllSignalSources()
        const enabledSources = signalSources.filter((s) => s.enabled)

        for (const source of enabledSources) {
          await processSignalSource(source, pair, closesByTF, candlesByTF, externalSignals)
        }

        for (const user of autoUsers) {
          const signal = generateSignal(user.id, pair, candlesByTF)
          if (signal && signal.score >= 70) {
            await saveSignal(signal)
            signalsFound++
          }
        }
      } catch {
        console.error(`Failed to scan ${pair}`)
      }

      await new Promise((r) => setTimeout(r, 300))
    }

    // Save external signals to storage
    for (const extSignal of externalSignals) {
      await saveSignal(extSignal)
    }

    return NextResponse.json({
      success: true,
      message: `Scanned ${SCAN_PAIRS.length} pairs`,
      signalsFound,
      externalSignalsAdded: externalSignals.length,
      usersScanned: autoUsers.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan failed'
    console.error('Cron scan error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
