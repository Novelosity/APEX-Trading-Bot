import type { OHLCVCandle } from './exchange'
import type { Signal } from './types'
import { randomUUID } from 'crypto'

// ─── Indicators ───────────────────────────────────────────────────────────────

export function calcEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return []
  const k = 2 / (period + 1)
  const ema: number[] = []

  // SMA as seed
  let sum = 0
  for (let i = 0; i < period; i++) sum += closes[i]
  ema.push(sum / period)

  for (let i = period; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[ema.length - 1] * (1 - k))
  }

  return ema
}

export function calcRSI(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return []

  const rsi: number[] = []
  let avgGain = 0
  let avgLoss = 0

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) avgGain += change
    else avgLoss += Math.abs(change)
  }

  avgGain /= period
  avgLoss /= period

  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss
  rsi.push(100 - 100 / (1 + firstRS))

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi.push(100 - 100 / (1 + rs))
  }

  return rsi
}

export function calcMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEMA = calcEMA(closes, fastPeriod)
  const slowEMA = calcEMA(closes, slowPeriod)

  const offset = slowPeriod - fastPeriod
  const macdLine: number[] = []

  for (let i = 0; i < slowEMA.length; i++) {
    macdLine.push(fastEMA[i + offset] - slowEMA[i])
  }

  const signalLine = calcEMA(macdLine, signalPeriod)
  const histogram: number[] = []

  const sigOffset = macdLine.length - signalLine.length
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + sigOffset] - signalLine[i])
  }

  return { macd: macdLine, signal: signalLine, histogram }
}

export function calcATR(candles: OHLCVCandle[], period = 14): number[] {
  if (candles.length < period + 1) return []

  const trueRanges: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high
    const low = candles[i].low
    const prevClose = candles[i - 1].close
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)))
  }

  const atrs: number[] = []
  const sum = trueRanges.slice(0, period).reduce((a, b) => a + b, 0)
  atrs.push(sum / period)

  for (let i = period; i < trueRanges.length; i++) {
    atrs.push((atrs[atrs.length - 1] * (period - 1) + trueRanges[i]) / period)
  }

  return atrs
}

// ─── Signal Analysis ──────────────────────────────────────────────────────────

interface TimeframeAnalysis {
  timeframe: string
  direction: 'long' | 'short' | 'neutral'
  trendScore: number
  momentumScore: number
}

export function analyzeTimeframe(candles: OHLCVCandle[], timeframe: string): TimeframeAnalysis {
  const closes = candles.map((c) => c.close)

  const ema9 = calcEMA(closes, 9)
  const ema21 = calcEMA(closes, 21)
  const ema50 = calcEMA(closes, 50)
  const ema200 = calcEMA(closes, 200)
  const rsiValues = calcRSI(closes, 14)
  const { macd, signal } = calcMACD(closes)

  const lastClose = closes[closes.length - 1]
  const lastEMA9 = ema9[ema9.length - 1]
  const lastEMA21 = ema21[ema21.length - 1]
  const lastEMA50 = ema50[ema50.length - 1]
  const lastEMA200 = ema200.length > 0 ? ema200[ema200.length - 1] : null
  const lastRSI = rsiValues[rsiValues.length - 1]
  const lastMACD = macd[macd.length - 1]
  const lastSignal = signal[signal.length - 1]

  // Trend scoring (bullish alignment = price > EMA9 > EMA21 > EMA50 > EMA200)
  let trendScore = 0
  let bullishCount = 0
  let bearishCount = 0

  if (lastClose > lastEMA9) bullishCount++
  else bearishCount++

  if (lastEMA9 > lastEMA21) bullishCount++
  else bearishCount++

  if (lastEMA21 > lastEMA50) bullishCount++
  else bearishCount++

  if (lastEMA200 !== null) {
    if (lastEMA50 > lastEMA200) bullishCount++
    else bearishCount++
  }

  const totalChecks = lastEMA200 !== null ? 4 : 3
  if (bullishCount > bearishCount) {
    trendScore = (bullishCount / totalChecks) * 100
  } else if (bearishCount > bullishCount) {
    trendScore = -(bearishCount / totalChecks) * 100
  }

  // Momentum scoring
  let momentumScore = 0

  // RSI
  if (lastRSI !== undefined) {
    if (lastRSI > 55 && lastRSI < 80) momentumScore += 50
    else if (lastRSI < 45 && lastRSI > 20) momentumScore -= 50
    else if (lastRSI >= 80) momentumScore += 20 // overbought, weaker signal
    else if (lastRSI <= 20) momentumScore -= 20
  }

  // MACD
  if (lastMACD !== undefined && lastSignal !== undefined) {
    if (lastMACD > lastSignal) momentumScore += 50
    else momentumScore -= 50
  }

  let direction: 'long' | 'short' | 'neutral' = 'neutral'
  if (trendScore > 30 && momentumScore > 30) direction = 'long'
  else if (trendScore < -30 && momentumScore < -30) direction = 'short'

  return { timeframe, direction, trendScore, momentumScore }
}

// ─── Full Signal Generation ────────────────────────────────────────────────────

export function generateSignal(
  userId: string,
  pair: string,
  candlesByTF: Record<string, OHLCVCandle[]>
): Signal | null {
  const timeframes = ['15m', '1h', '4h', '1d']
  const analyses: TimeframeAnalysis[] = []

  for (const tf of timeframes) {
    const candles = candlesByTF[tf]
    if (!candles || candles.length < 50) continue
    analyses.push(analyzeTimeframe(candles, tf))
  }

  if (analyses.length < 2) return null

  const longCount = analyses.filter((a) => a.direction === 'long').length
  const shortCount = analyses.filter((a) => a.direction === 'short').length

  // Need at least 3/4 timeframes aligned (or 2/2 if we only have 2)
  const minAlignment = analyses.length >= 3 ? 3 : 2
  let direction: 'long' | 'short'

  if (longCount >= minAlignment) {
    direction = 'long'
  } else if (shortCount >= minAlignment) {
    direction = 'short'
  } else {
    return null
  }

  const alignedTFs = analyses
    .filter((a) => a.direction === direction)
    .map((a) => a.timeframe)

  // Primary TF for price levels (use 1h if available, else first available)
  const primaryTF = ['1h', '4h', '15m', '1d'].find((tf) => candlesByTF[tf]?.length > 50) || timeframes[0]
  const primaryCandles = candlesByTF[primaryTF]
  const lastCandle = primaryCandles[primaryCandles.length - 1]

  const atrValues = calcATR(primaryCandles, 14)
  const atr = atrValues[atrValues.length - 1]

  if (!atr || atr === 0) return null

  const entry = lastCandle.close

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

  // Score calculation
  const avgTrend =
    analyses
      .filter((a) => a.direction === direction)
      .reduce((sum, a) => sum + Math.abs(a.trendScore), 0) / alignedTFs.length

  const avgMomentum =
    analyses
      .filter((a) => a.direction === direction)
      .reduce((sum, a) => sum + Math.abs(a.momentumScore), 0) / alignedTFs.length

  // Volume score
  const volumes = primaryCandles.map((c) => c.volume)
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const lastVol = volumes[volumes.length - 1]
  const volumeScore = lastVol > avgVol * 1.2 ? 20 : lastVol > avgVol ? 10 : 0

  // Structure score (alignment count)
  const structureScore = (alignedTFs.length / analyses.length) * 20

  const trendPoints = (avgTrend / 100) * 30
  const momentumPoints = (avgMomentum / 100) * 30
  const score = Math.min(100, Math.round(trendPoints + momentumPoints + volumeScore + structureScore))

  let tier: Signal['tier']
  if (score >= 80) tier = 'ULTRA_HIGH'
  else if (score >= 65) tier = 'HIGH'
  else if (score >= 50) tier = 'MODERATE'
  else return null

  return {
    id: randomUUID(),
    userId,
    pair,
    direction,
    score,
    tier,
    entry,
    tp1,
    tp2,
    tp3,
    sl,
    timeframe: primaryTF,
    timeframesAligned: alignedTFs,
    executed: false,
    createdAt: new Date().toISOString(),
  }
}
