export const runtime = 'nodejs'
export const preferredRegion = 'fra1'

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getAllUsers, saveSignal, getAllSignalSources, saveExternalSignal, saveTrade, markSignalExecuted, updateBotState, getOpenTrades, getBotState, getDailyTradeCount, incrementDailyTradeCount, getLastLossAt, savePendingApproval } from '@/lib/storage'
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
import { checkCanTrade } from '@/lib/risk'
import { calculateTradeSpec } from '@/lib/position-sizing'
import type { Signal, SignalSource, Trade } from '@/lib/types'

const SCAN_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'LTC/USDT', 'BNB/USDT', 'ADA/USDT', 'MATIC/USDT', 'LINK/USDT', 'AVAX/USDT', 'ATOM/USDT', 'DOT/USDT', 'ARB/USDT', 'OP/USDT']
const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d', '1w']

// Returns a signal template without userId — caller assigns per-user
async function processSignalSource(
  source: SignalSource,
  pair: string,
  closesByTF: Record<string, number[]>,
  candlesByTF: Record<string, OHLCVCandle[]>,
): Promise<Omit<Signal, 'id' | 'userId'> | null> {
  try {
    const closes = closesByTF['1h'] || []
    const entry = closes[closes.length - 1] || 0
    if (!entry) return null

    let conf = 0
    let direction: 'long' | 'short' = 'long'
    let tpMult = { tp1: 1.025, tp2: 1.05, tp3: 1.08 }

    switch (source.type) {
      case 'funding_rate': {
        const result = await analyzeFundingRates(pair)
        if (!result || result.confidence <= 50) return null
        conf = result.confidence
        const enhanced = calculateEnhancedSignal(pair, candlesByTF['1h'] || [], closes)
        direction = result.longBias > 0 ? 'long' : result.longBias < 0 ? 'short' : enhanced.scoreBoost > 0 ? 'long' : 'short'
        await saveExternalSignal({ id: randomUUID(), sourceId: source.id, pair, direction, confidence: Math.round(conf), price: entry, metadata: { longBias: result.longBias }, timestamp: new Date().toISOString() })
        break
      }
      case 'whale': {
        const result = await analyzeWhaleTransactions(pair)
        if (!result || result.confidence <= 50) return null
        conf = result.confidence
        direction = (result.direction || 0) > 0 ? 'long' : 'short'
        tpMult = { tp1: 1.02, tp2: 1.04, tp3: 1.07 }
        await saveExternalSignal({ id: randomUUID(), sourceId: source.id, pair, direction, confidence: Math.round(conf), price: entry, metadata: { direction: result.direction }, timestamp: new Date().toISOString() })
        break
      }
      case 'open_interest': {
        const result = await analyzeOpenInterest(pair)
        if (!result || result.confidence <= 50) return null
        conf = result.confidence
        direction = result.bullish ? 'long' : 'short'
        await saveExternalSignal({ id: randomUUID(), sourceId: source.id, pair, direction, confidence: Math.round(conf), price: entry, metadata: { bullish: result.bullish }, timestamp: new Date().toISOString() })
        break
      }
      case 'social':
      case 'sentiment': {
        const result = await analyzeSocialSentiment(pair)
        if (!result || result.confidence <= 50) return null
        conf = result.confidence
        direction = result.bullish ? 'long' : 'short'
        tpMult = { tp1: 1.015, tp2: 1.03, tp3: 1.05 }
        await saveExternalSignal({ id: randomUUID(), sourceId: source.id, pair, direction, confidence: Math.round(conf), price: entry, metadata: { bullish: result.bullish }, timestamp: new Date().toISOString() })
        break
      }
      default:
        return null
    }

    const c = Math.round(Math.max(conf, 50))
    const isLong = direction === 'long'
    return {
      pair,
      direction,
      score: Math.min(95, 50 + c),
      tier: c >= 80 ? 'ULTRA_HIGH' : c >= 65 ? 'HIGH' : 'MODERATE',
      entry,
      tp1: isLong ? entry * tpMult.tp1 : entry * (2 - tpMult.tp1),
      tp2: isLong ? entry * tpMult.tp2 : entry * (2 - tpMult.tp2),
      tp3: isLong ? entry * tpMult.tp3 : entry * (2 - tpMult.tp3),
      sl: isLong ? entry * 0.97 : entry * 1.03,
      timeframe: '1h',
      timeframesAligned: [source.id],
      executed: false,
      createdAt: new Date().toISOString(),
    }
  } catch (e) {
    console.error(`External signal error for ${source.name} on ${pair}:`, e)
    return null
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const users = await getAllUsers()
    if (users.length === 0) {
      return NextResponse.json({ success: true, message: 'No users', scanned: 0 })
    }

    // Use first user's exchange for OHLCV (public data only)
    const primaryUser = users[0]
    const client = new ExchangeClient(primaryUser)

    let signalsFound = 0
    let executedCount = 0

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
            closesByTF[tf] = candles.map(c => c.close)
          } catch {}
        }

        // Fetch external signal templates once per pair (API calls), then copy per-user
        const extTemplates: Array<Omit<Signal, 'id' | 'userId'>> = []
        for (const source of enabledSources) {
          const tmpl = await processSignalSource(source, pair, closesByTF, candlesByTF)
          if (tmpl) extTemplates.push(tmpl)
        }

        // Generate signals for ALL users (signal engine v3.0 — min score 75)
        for (const user of users) {
          // Save external signal templates with this user's ID
          for (const tmpl of extTemplates) {
            await saveSignal({ ...tmpl, id: randomUUID(), userId: user.id })
            signalsFound++
          }

          const signal = generateSignal(user.id, pair, candlesByTF)
          // v3.0 engine already enforces 75+ score internally, but double-check
          if (!signal || signal.score < 75) continue

          await saveSignal(signal)
          signalsFound++

          const botState = await getBotState(user.id)

          // ── Kill switch check ────────────────────────────────────────────
          if (botState.tradingHalted) continue

          // ── Approval mode: queue for human review ────────────────────────
          if (user.execMode === 'approval') {
            // Attach expiry (2h from now) and queue for dashboard review
            const signalWithApproval = {
              ...signal,
              pendingApproval: true,
              approvalExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            }
            await saveSignal(signalWithApproval)
            await savePendingApproval(user.id, signal.id)
            continue
          }

          // ── Manual mode: only save signal, no execution ──────────────────
          if (user.execMode === 'manual') continue

          // ── Auto mode: execute if HIGH or ULTRA_HIGH ─────────────────────
          if (user.execMode === 'auto' && (signal.tier === 'HIGH' || signal.tier === 'ULTRA_HIGH')) {
            try {
              const PAPER_BALANCE = 10000

              // Paper trading
              if (user.paperMode) {
                const entry = signal.entry
                if (!entry || entry === 0) continue

                const availableBalance = PAPER_BALANCE * (user.balancePct / 100)
                const openTrades = await getOpenTrades(user.id)
                const tradesToday = await getDailyTradeCount(user.id)
                const lastLossAt = await getLastLossAt(user.id) || undefined

                const riskCheck = await checkCanTrade(user.id, signal.pair, signal.direction, openTrades, user, availableBalance, tradesToday, lastLossAt)
                if (!riskCheck.allowed) continue

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
                if (!spec.isValid) continue

                const trade: Trade = {
                  id: randomUUID(), userId: user.id, pair: signal.pair,
                  direction: signal.direction, entryPrice: entry,
                  positionSize: spec.positionSizeUsd,
                  slPrice: signal.sl, tp1Price: signal.tp1, tp2Price: signal.tp2, tp3Price: signal.tp3,
                  status: 'open', openedAt: new Date().toISOString(),
                  notes: '[PAPER]',
                }
                await saveTrade(trade)
                await markSignalExecuted(signal.id, trade.id)
                await updateBotState(user.id, { totalTrades: botState.totalTrades + 1, lastTradeAt: new Date().toISOString() })
                await incrementDailyTradeCount(user.id)
                executedCount++
                continue
              }

              // Live trading
              const userClient = new ExchangeClient(user)
              const openTrades = await getOpenTrades(user.id)
              const balanceData = await userClient.fetchBalance()
              const availableBalance = balanceData.free * (user.balancePct / 100)
              const tradesToday = await getDailyTradeCount(user.id)
              const lastLossAt = await getLastLossAt(user.id) || undefined

              const riskCheck = await checkCanTrade(user.id, signal.pair, signal.direction, openTrades, user, availableBalance, tradesToday, lastLossAt)
              if (!riskCheck.allowed) continue

              // Pre-execution recheck: get live price
              const ticker = await userClient.fetchTicker(signal.pair)
              const liveEntry = ticker.last || signal.entry
              if (!liveEntry || liveEntry === 0) continue

              // Slippage guard: skip if price moved > 0.5% since signal
              const slippage = Math.abs(liveEntry - signal.entry) / signal.entry
              if (slippage > 0.005) {
                console.log(`Skipping ${pair}: price moved ${(slippage * 100).toFixed(2)}% since signal`)
                continue
              }

              const spec = calculateTradeSpec({
                balance: availableBalance,
                user,
                entry: liveEntry,
                sl: signal.sl,
                tp2: signal.tp2,
                direction: signal.direction,
                pair: signal.pair,
                score: signal.score,
                consecutiveLosses: botState.consecutiveLosses,
              })
              if (!spec.isValid) {
                console.log(`Position sizing blocked: ${spec.invalidReason}`)
                continue
              }

              if (user.tradingMode === 'futures') {
                await userClient.setLeverage(signal.pair, user.leverage)
              }

              const side = signal.direction === 'long' ? 'buy' : 'sell'
              const order = await userClient.createMarketOrder(signal.pair, side, spec.quantityBase)
              const executedEntry = order.price || liveEntry

              const trade: Trade = {
                id: randomUUID(), userId: user.id, pair: signal.pair,
                direction: signal.direction, entryPrice: executedEntry,
                positionSize: spec.positionSizeUsd,
                slPrice: signal.sl, tp1Price: signal.tp1, tp2Price: signal.tp2, tp3Price: signal.tp3,
                status: 'open', openedAt: new Date().toISOString(),
                orderId: order.id,
              }

              await saveTrade(trade)
              await markSignalExecuted(signal.id, trade.id)
              await updateBotState(user.id, { totalTrades: botState.totalTrades + 1, lastTradeAt: new Date().toISOString() })
              await incrementDailyTradeCount(user.id)
              executedCount++
            } catch (execErr) {
              console.error(`Auto-execute failed for ${user.id} on ${pair}:`, execErr)
            }
          }
        }
      } catch {
        console.error(`Failed to scan ${pair}`)
      }

      await new Promise((r) => setTimeout(r, 300))
    }

    return NextResponse.json({
      success: true,
      message: `Scanned ${SCAN_PAIRS.length} pairs`,
      signalsFound,
      executedCount,
      usersScanned: users.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan failed'
    console.error('Cron scan error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

