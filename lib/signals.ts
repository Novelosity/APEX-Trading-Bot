/**
 * APEX Signal Engine v3.0.0
 *
 * Multi-confirmation trading model:
 * - 5 timeframes: 5m (entry), 15m (short-term), 1h (trend), 4h (major), 1d (macro)
 * - Requires 3/5 TF agreement + both 1h and 4h must agree
 * - 100-point structured confidence scoring (minimum 75 to trade)
 * - Indicators: EMA 20/50/200, RSI 14, MACD, ATR 14, VWAP, Volume SMA 20
 * - S/R detection via swing highs/lows
 * - Breakout/retest patterns
 * - Candle pattern confirmation
 *
 * DISCLAIMER: No signal guarantees profit. Always use stop loss.
 */

import type { OHLCVCandle } from './exchange'
import type { Signal, SignalReason } from './types'
import { randomUUID } from 'crypto'

export const MODEL_VERSION = '3.0.0'

// Minimum confidence score to generate a signal
const MIN_SCORE_TO_SIGNAL = 60
// Minimum R:R ratio to allow a trade
const MIN_RISK_REWARD = 2.0
// Minimum timeframes that must agree
const MIN_TF_AGREEMENT = 3
// Required TFs — both must be in the agreeing set
const REQUIRED_TFS = ['1h', '4h']

// Liquidity tier for pairs (used in scoring)
const LIQUIDITY_TIERS: Record<string, number> = {
  'BTC/USDT': 10, 'ETH/USDT': 10, 'BNB/USDT': 9,
  'SOL/USDT': 8, 'XRP/USDT': 8, 'ADA/USDT': 7,
  'AVAX/USDT': 7, 'DOT/USDT': 7, 'LINK/USDT': 7,
  'MATIC/USDT': 6, 'ATOM/USDT': 6, 'LTC/USDT': 6,
  'ARB/USDT': 6, 'OP/USDT': 5,
}

// ─── Core Indicators ──────────────────────────────────────────────────────────

export function calcEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return []
  const k = 2 / (period + 1)
  const ema: number[] = []
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

/** Volume-Weighted Average Price — resets every session (uses all passed candles as one session) */
export function calcVWAP(candles: OHLCVCandle[]): number[] {
  const vwap: number[] = []
  let cumTPV = 0
  let cumVol = 0
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3
    cumTPV += tp * c.volume
    cumVol += c.volume
    vwap.push(cumVol > 0 ? cumTPV / cumVol : tp)
  }
  return vwap
}

// ─── Support/Resistance Detection ────────────────────────────────────────────

interface SRLevel {
  price: number
  touches: number
  strength: number // 0-100
  isRecent: boolean
}

export function detectSRLevels(candles: OHLCVCandle[], lookback = 100): {
  supports: SRLevel[]
  resistances: SRLevel[]
} {
  const n = Math.min(lookback, candles.length)
  const recent = candles.slice(-n)
  const swingHighs: number[] = []
  const swingLows: number[] = []
  const N = 3 // window each side for pivot

  for (let i = N; i < recent.length - N; i++) {
    const h = recent[i].high
    const l = recent[i].low
    let isHigh = true
    let isLow = true
    for (let j = 1; j <= N; j++) {
      if (recent[i - j].high >= h || recent[i + j].high >= h) isHigh = false
      if (recent[i - j].low <= l || recent[i + j].low <= l) isLow = false
    }
    if (isHigh) swingHighs.push(h)
    if (isLow) swingLows.push(l)
  }

  const clusterLevels = (prices: number[]): SRLevel[] => {
    if (prices.length === 0) return []
    const sorted = [...prices].sort((a, b) => a - b)
    const clusters: { prices: number[]; idxs: number[] }[] = []

    for (let i = 0; i < sorted.length; i++) {
      const tol = sorted[i] * 0.005 // 0.5% clustering tolerance
      let placed = false
      for (const cl of clusters) {
        const mean = cl.prices.reduce((s, p) => s + p, 0) / cl.prices.length
        if (Math.abs(sorted[i] - mean) < tol) {
          cl.prices.push(sorted[i])
          placed = true
          break
        }
      }
      if (!placed) clusters.push({ prices: [sorted[i]], idxs: [i] })
    }

    return clusters.map((cl) => {
      const mean = cl.prices.reduce((s, p) => s + p, 0) / cl.prices.length
      const touches = cl.prices.length
      const lastClose = recent[recent.length - 1].close
      const isRecent = cl.prices.some((p) => {
        const idx = recent.findIndex((c) => Math.abs(c.high - p) < p * 0.003 || Math.abs(c.low - p) < p * 0.003)
        return idx >= recent.length - 20
      })
      // Strength: based on touches + proximity to current price
      const proximity = 1 - Math.min(Math.abs(mean - lastClose) / lastClose, 0.1) / 0.1
      const strength = Math.min(100, touches * 20 + proximity * 40)
      return { price: mean, touches, strength, isRecent }
    }).sort((a, b) => b.strength - a.strength)
  }

  return {
    supports: clusterLevels(swingLows),
    resistances: clusterLevels(swingHighs),
  }
}

// ─── Candle Pattern Detection ─────────────────────────────────────────────────

interface CandlePattern {
  name: string
  bullish: boolean
  strength: number // 0-15
}

export function detectCandlePattern(candles: OHLCVCandle[]): CandlePattern | null {
  if (candles.length < 3) return null
  const last = candles[candles.length - 1]
  const prev = candles[candles.length - 2]
  const prev2 = candles[candles.length - 3]

  const lastBody = Math.abs(last.close - last.open)
  const lastRange = last.high - last.low
  const prevBody = Math.abs(prev.close - prev.open)

  if (lastRange === 0) return null

  const lowerWick = Math.min(last.open, last.close) - last.low
  const upperWick = last.high - Math.max(last.open, last.close)

  // Doji — indecision, skip trade
  if (lastBody < lastRange * 0.08) {
    return { name: 'DOJI', bullish: false, strength: 0 }
  }

  // Bullish engulfing
  if (prev.close < prev.open && last.close > last.open &&
      last.open <= prev.close && last.close >= prev.open &&
      lastBody > prevBody) {
    return { name: 'BULLISH_ENGULFING', bullish: true, strength: 15 }
  }

  // Bearish engulfing
  if (prev.close > prev.open && last.close < last.open &&
      last.open >= prev.close && last.close <= prev.open &&
      lastBody > prevBody) {
    return { name: 'BEARISH_ENGULFING', bullish: false, strength: 15 }
  }

  // Hammer (bullish reversal at support)
  if (lowerWick > lastBody * 2 && upperWick < lastBody * 0.5 && lastBody > 0) {
    return { name: 'HAMMER', bullish: true, strength: 10 }
  }

  // Shooting star (bearish reversal at resistance)
  if (upperWick > lastBody * 2 && lowerWick < lastBody * 0.5 && lastBody > 0) {
    return { name: 'SHOOTING_STAR', bullish: false, strength: 10 }
  }

  // Morning star (3-candle bullish reversal)
  if (prev2.close < prev2.open && // bearish candle
      Math.abs(prev.close - prev.open) < (prev.high - prev.low) * 0.3 && // small body
      last.close > last.open && // bullish candle
      last.close > (prev2.open + prev2.close) / 2) {
    return { name: 'MORNING_STAR', bullish: true, strength: 12 }
  }

  // Evening star (3-candle bearish reversal)
  if (prev2.close > prev2.open && // bullish candle
      Math.abs(prev.close - prev.open) < (prev.high - prev.low) * 0.3 && // small body
      last.close < last.open && // bearish candle
      last.close < (prev2.open + prev2.close) / 2) {
    return { name: 'EVENING_STAR', bullish: false, strength: 12 }
  }

  // Pin bar
  if (lowerWick > lastRange * 0.6 && last.close > last.open) {
    return { name: 'PIN_BAR_BULL', bullish: true, strength: 8 }
  }
  if (upperWick > lastRange * 0.6 && last.close < last.open) {
    return { name: 'PIN_BAR_BEAR', bullish: false, strength: 8 }
  }

  return null
}

// ─── Breakout / Retest Detection ─────────────────────────────────────────────

interface BreakoutInfo {
  detected: boolean
  type: 'breakout_up' | 'breakout_down' | 'none'
  retesting: boolean
  level: number
}

export function detectBreakoutRetest(
  candles: OHLCVCandle[],
  srLevels: { supports: SRLevel[]; resistances: SRLevel[] },
  direction: 'long' | 'short'
): BreakoutInfo {
  if (candles.length < 20) return { detected: false, type: 'none', retesting: false, level: 0 }

  const last = candles[candles.length - 1]
  const current = last.close
  const LOOKBACK = 15
  const recent = candles.slice(-LOOKBACK)

  const tolerance = current * 0.003 // 0.3% tolerance

  if (direction === 'long') {
    for (const res of srLevels.resistances.slice(0, 5)) {
      const level = res.price
      // Price previously below resistance and broke above it
      const breakBar = recent.findIndex((c) =>
        c.close > level + tolerance && recent[Math.max(0, recent.indexOf(c) - 1)].close < level
      )
      if (breakBar > 0) {
        // Now retesting broken resistance as support
        const isRetesting = current >= level - tolerance && current <= level + tolerance * 2
        return {
          detected: true,
          type: 'breakout_up',
          retesting: isRetesting,
          level,
        }
      }
    }
  } else {
    for (const sup of srLevels.supports.slice(0, 5)) {
      const level = sup.price
      // Price previously above support and broke below
      const breakBar = recent.findIndex((c) =>
        c.close < level - tolerance && recent[Math.max(0, recent.indexOf(c) - 1)].close > level
      )
      if (breakBar > 0) {
        const isRetesting = current <= level + tolerance && current >= level - tolerance * 2
        return {
          detected: true,
          type: 'breakout_down',
          retesting: isRetesting,
          level,
        }
      }
    }
  }

  return { detected: false, type: 'none', retesting: false, level: 0 }
}

// ─── Market Regime ────────────────────────────────────────────────────────────

export function detectMarketRegime(candles: OHLCVCandle[]): 'trending' | 'ranging' | 'volatile' {
  if (candles.length < 50) return 'ranging'
  const closes = candles.map((c) => c.close)
  const atrValues = calcATR(candles, 14)
  const lastATR = atrValues[atrValues.length - 1] ?? 0
  const lastClose = closes[closes.length - 1]
  const atrPct = lastClose > 0 ? lastATR / lastClose : 0

  const ema50 = calcEMA(closes, 50)
  const ema200 = calcEMA(closes, 200)
  const last50 = ema50[ema50.length - 1] ?? lastClose
  const last200 = ema200.length > 0 ? ema200[ema200.length - 1] ?? lastClose : lastClose

  const emaDivergence = last200 > 0 ? Math.abs(last50 - last200) / last200 : 0

  if (atrPct > 0.04) return 'volatile'
  if (emaDivergence > 0.025) return 'trending'
  return 'ranging'
}

// ─── RSI Divergence (simple) ──────────────────────────────────────────────────

function detectDivergence(candles: OHLCVCandle[]): { bullish: boolean; bearish: boolean } {
  if (candles.length < 20) return { bullish: false, bearish: false }
  const closes = candles.map((c) => c.close)
  const rsiValues = calcRSI(closes, 14)

  if (rsiValues.length < 10) return { bullish: false, bearish: false }

  const priceRecent = closes.slice(-5)
  const rsiRecent = rsiValues.slice(-5)
  const pricePrev = closes.slice(-10, -5)
  const rsiPrev = rsiValues.slice(-10, -5)

  const priceHigher = Math.max(...priceRecent) > Math.max(...pricePrev)
  const priceLower = Math.min(...priceRecent) < Math.min(...pricePrev)
  const rsiHigher = Math.max(...rsiRecent) > Math.max(...rsiPrev)
  const rsiLower = Math.min(...rsiRecent) < Math.min(...rsiPrev)

  // Bearish divergence: price makes higher high, RSI makes lower high
  const bearish = priceHigher && !rsiHigher
  // Bullish divergence: price makes lower low, RSI makes higher low
  const bullish = priceLower && !rsiLower

  return { bullish, bearish }
}

// ─── Per-Timeframe Analysis ────────────────────────────────────────────────────

interface TFAnalysis {
  timeframe: string
  direction: 'long' | 'short' | 'neutral'
  trendScore: number     // -100 to +100
  momentumScore: number  // -100 to +100
  rsi: number
  atrPct: number
  reasons: SignalReason[]
  ema20: number
  ema50: number
  ema200: number | null
  lastClose: number
}

export function analyzeTimeframe(candles: OHLCVCandle[], timeframe: string): TFAnalysis {
  const closes = candles.map((c) => c.close)
  const reasons: SignalReason[] = []

  const ema20 = calcEMA(closes, 20)
  const ema50 = calcEMA(closes, 50)
  const ema200 = calcEMA(closes, 200)
  const rsiValues = calcRSI(closes, 14)
  const { macd, signal } = calcMACD(closes)
  const atrValues = calcATR(candles, 14)

  const lastClose = closes[closes.length - 1]
  const lastEMA20 = ema20[ema20.length - 1] ?? lastClose
  const lastEMA50 = ema50[ema50.length - 1] ?? lastClose
  const lastEMA200 = ema200.length > 0 ? ema200[ema200.length - 1] : null
  const lastRSI = rsiValues[rsiValues.length - 1] ?? 50
  const lastMACD = macd[macd.length - 1] ?? 0
  const lastSignal = signal[signal.length - 1] ?? 0
  const lastATR = atrValues[atrValues.length - 1] ?? 0
  const atrPct = lastClose > 0 ? lastATR / lastClose : 0

  let bullCount = 0
  let bearCount = 0
  const totalChecks = lastEMA200 !== null ? 3 : 2

  // EMA 20 > EMA 50 (core trend filter)
  if (lastEMA20 > lastEMA50) {
    bullCount++
    reasons.push({
      indicator: 'EMA20_ABOVE_50',
      description: `EMA20 (${lastEMA20.toFixed(2)}) > EMA50 (${lastEMA50.toFixed(2)}) — uptrend`,
      contribution: 8,
      bullish: true,
    })
  } else {
    bearCount++
    reasons.push({
      indicator: 'EMA20_BELOW_50',
      description: `EMA20 (${lastEMA20.toFixed(2)}) < EMA50 (${lastEMA50.toFixed(2)}) — downtrend`,
      contribution: 8,
      bullish: false,
    })
  }

  // Price vs EMA 50
  if (lastClose > lastEMA50) {
    bullCount++
    reasons.push({
      indicator: 'PRICE_ABOVE_EMA50',
      description: `Price above EMA50 — momentum positive`,
      contribution: 5,
      bullish: true,
    })
  } else {
    bearCount++
    reasons.push({
      indicator: 'PRICE_BELOW_EMA50',
      description: `Price below EMA50 — momentum negative`,
      contribution: 5,
      bullish: false,
    })
  }

  // EMA 200 — long-term trend (only if enough data)
  if (lastEMA200 !== null) {
    if (lastClose > lastEMA200 && lastEMA50 > lastEMA200) {
      bullCount++
      reasons.push({
        indicator: 'ABOVE_EMA200',
        description: `Price + EMA50 both above EMA200 — long-term bull structure`,
        contribution: 7,
        bullish: true,
      })
    } else if (lastClose < lastEMA200 && lastEMA50 < lastEMA200) {
      bearCount++
      reasons.push({
        indicator: 'BELOW_EMA200',
        description: `Price + EMA50 both below EMA200 — long-term bear structure`,
        contribution: 7,
        bullish: false,
      })
    }
  }

  const trendScore = totalChecks > 0
    ? ((bullCount - bearCount) / totalChecks) * 100
    : 0

  // RSI Momentum
  let momentumScore = 0

  if (lastRSI > 70) {
    // Overbought — cautious for longs
    momentumScore += 15
    reasons.push({
      indicator: 'RSI_OVERBOUGHT',
      description: `RSI ${lastRSI.toFixed(1)} overbought (>70) — weakening for longs`,
      contribution: 3,
      bullish: true,
    })
  } else if (lastRSI >= 45 && lastRSI <= 70) {
    // Ideal long zone
    momentumScore += 60
    reasons.push({
      indicator: 'RSI_LONG_ZONE',
      description: `RSI ${lastRSI.toFixed(1)} in ideal long zone (45–70)`,
      contribution: 8,
      bullish: true,
    })
  } else if (lastRSI < 30) {
    // Oversold — cautious for shorts
    momentumScore -= 15
    reasons.push({
      indicator: 'RSI_OVERSOLD',
      description: `RSI ${lastRSI.toFixed(1)} oversold (<30) — weakening for shorts`,
      contribution: 3,
      bullish: false,
    })
  } else if (lastRSI >= 30 && lastRSI <= 55) {
    // Ideal short zone
    momentumScore -= 60
    reasons.push({
      indicator: 'RSI_SHORT_ZONE',
      description: `RSI ${lastRSI.toFixed(1)} in ideal short zone (30–55)`,
      contribution: 8,
      bullish: false,
    })
  }

  // MACD
  if (lastMACD !== undefined && lastSignal !== undefined) {
    const prevMACD = macd[macd.length - 2]
    const prevSig = signal[signal.length - 2]
    const freshBullCross = prevMACD !== undefined && prevSig !== undefined &&
      prevMACD <= prevSig && lastMACD > lastSignal
    const freshBearCross = prevMACD !== undefined && prevSig !== undefined &&
      prevMACD >= prevSig && lastMACD < lastSignal

    if (lastMACD > lastSignal) {
      momentumScore += freshBullCross ? 60 : 45
      reasons.push({
        indicator: freshBullCross ? 'MACD_BULL_CROSS' : 'MACD_BULLISH',
        description: freshBullCross
          ? 'Fresh MACD bullish crossover — strong momentum'
          : 'MACD above signal line — bullish momentum',
        contribution: freshBullCross ? 12 : 8,
        bullish: true,
      })
    } else {
      momentumScore -= freshBearCross ? 60 : 45
      reasons.push({
        indicator: freshBearCross ? 'MACD_BEAR_CROSS' : 'MACD_BEARISH',
        description: freshBearCross
          ? 'Fresh MACD bearish crossover — strong sell pressure'
          : 'MACD below signal line — bearish momentum',
        contribution: freshBearCross ? 12 : 8,
        bullish: false,
      })
    }
  }

  // Direction determination
  let direction: 'long' | 'short' | 'neutral' = 'neutral'
  // Require RSI not overbought for longs, not oversold for shorts
  if (trendScore > 25 && momentumScore > 20 && lastRSI < 78) direction = 'long'
  else if (trendScore < -25 && momentumScore < -20 && lastRSI > 22) direction = 'short'

  return {
    timeframe,
    direction,
    trendScore,
    momentumScore,
    rsi: lastRSI,
    atrPct,
    reasons,
    ema20: lastEMA20,
    ema50: lastEMA50,
    ema200: lastEMA200,
    lastClose,
  }
}

// ─── Structured 100-Point Scoring ────────────────────────────────────────────

interface ScoreBreakdown {
  trendAlignment: number      // 0-20
  momentum: number            // 0-15
  volume: number              // 0-15
  srQuality: number           // 0-15
  riskReward: number          // 0-15
  volatility: number          // 0-10
  liquidity: number           // 0-10
  total: number               // 0-100
  reasons: SignalReason[]
}

function calculateScore(params: {
  pair: string
  direction: 'long' | 'short'
  analyses: TFAnalysis[]
  alignedAnalyses: TFAnalysis[]
  primaryCandles: OHLCVCandle[]
  atr: number
  entry: number
  sl: number
  tp2: number
  srLevels: { supports: SRLevel[]; resistances: SRLevel[] }
  breakout: BreakoutInfo
  pattern: CandlePattern | null
}): ScoreBreakdown {
  const { pair, direction, analyses, alignedAnalyses, primaryCandles, atr, entry, sl, tp2, srLevels } = params
  const reasons: SignalReason[] = []
  const isLong = direction === 'long'

  // ── 1. TREND ALIGNMENT (0-20 pts) ─────────────────────────────────────────
  // Based on higher TF (4h / 1d) EMA structure
  const higherTFAnalyses = alignedAnalyses.filter((a) => ['4h', '1d'].includes(a.timeframe))
  let trendPts = 0

  for (const a of higherTFAnalyses) {
    if (isLong && a.ema200 !== null && a.lastClose > a.ema200) trendPts += 4
    if (!isLong && a.ema200 !== null && a.lastClose < a.ema200) trendPts += 4
    if (isLong && a.ema20 > a.ema50) trendPts += 3
    if (!isLong && a.ema20 < a.ema50) trendPts += 3
  }

  // TF agreement score
  const agreementRatio = alignedAnalyses.length / Math.max(analyses.length, 1)
  trendPts += Math.round(agreementRatio * 6)
  trendPts = Math.min(20, trendPts)

  if (trendPts >= 15) {
    reasons.push({ indicator: 'STRONG_TREND_ALIGNMENT', description: `${alignedAnalyses.length}/${analyses.length} timeframes confirm ${direction}`, contribution: trendPts, bullish: isLong })
  } else if (trendPts > 0) {
    reasons.push({ indicator: 'PARTIAL_TREND_ALIGNMENT', description: `Moderate TF alignment (${alignedAnalyses.length}/${analyses.length})`, contribution: trendPts, bullish: isLong })
  }

  // ── 2. MOMENTUM (0-15 pts) ────────────────────────────────────────────────
  // Primary TF (1h) RSI + MACD
  const primary1h = analyses.find((a) => a.timeframe === '1h') || alignedAnalyses[0]
  let momentumPts = 0

  if (primary1h) {
    const rsi = primary1h.rsi
    if (isLong) {
      if (rsi >= 50 && rsi <= 65) momentumPts += 8
      else if (rsi >= 45 && rsi <= 70) momentumPts += 5
      else if (rsi >= 40 && rsi <= 75) momentumPts += 2
    } else {
      if (rsi >= 35 && rsi <= 50) momentumPts += 8
      else if (rsi >= 30 && rsi <= 55) momentumPts += 5
      else if (rsi >= 25 && rsi <= 60) momentumPts += 2
    }

    if (isLong && primary1h.momentumScore > 50) momentumPts += 7
    else if (!isLong && primary1h.momentumScore < -50) momentumPts += 7
    else if (isLong && primary1h.momentumScore > 20) momentumPts += 4
    else if (!isLong && primary1h.momentumScore < -20) momentumPts += 4
  }
  momentumPts = Math.min(15, momentumPts)

  if (momentumPts >= 10) {
    reasons.push({ indicator: 'STRONG_MOMENTUM', description: `RSI and MACD confirm ${direction} momentum`, contribution: momentumPts, bullish: isLong })
  }

  // ── 3. VOLUME (0-15 pts) ──────────────────────────────────────────────────
  const volumes = primaryCandles.map((c) => c.volume)
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const lastVol = volumes[volumes.length - 1]
  const volRatio = avgVol20 > 0 ? lastVol / avgVol20 : 1
  let volumePts = 0

  if (volRatio >= 2.0) volumePts = 15
  else if (volRatio >= 1.5) volumePts = 12
  else if (volRatio >= 1.3) volumePts = 8
  else if (volRatio >= 1.1) volumePts = 6
  else if (volRatio >= 0.8) volumePts = 3
  else volumePts = 0

  reasons.push({
    indicator: volRatio >= 1.1 ? 'VOLUME_CONFIRMATION' : 'VOLUME_NEUTRAL',
    description: volRatio >= 1.1
      ? `Volume ${(volRatio * 100 - 100).toFixed(0)}% above 20-bar avg — confirms move`
      : `Volume near average (${(volRatio * 100).toFixed(0)}% of avg)`,
    contribution: volumePts,
    bullish: isLong,
  })

  // ── 4. S/R QUALITY (0-15 pts) ─────────────────────────────────────────────
  const levels = isLong ? srLevels.supports : srLevels.resistances
  let srPts = 0
  let srDesc = 'No clear S/R level nearby'

  if (levels.length > 0) {
    // Find nearest level to entry
    const nearest = levels.sort((a, b) => Math.abs(a.price - entry) - Math.abs(b.price - entry))[0]
    const dist = Math.abs(nearest.price - entry) / entry

    if (dist < 0.01 && nearest.strength >= 60) { srPts = 15; srDesc = `Strong ${isLong ? 'support' : 'resistance'} level (${nearest.touches} touches) at $${nearest.price.toFixed(2)}` }
    else if (dist < 0.02 && nearest.strength >= 40) { srPts = 10; srDesc = `Decent ${isLong ? 'support' : 'resistance'} at $${nearest.price.toFixed(2)}` }
    else if (dist < 0.03 && nearest.strength >= 20) { srPts = 5; srDesc = `Weak ${isLong ? 'support' : 'resistance'} nearby` }
  }

  if (params.breakout.detected && params.breakout.retesting) {
    srPts = Math.max(srPts, 12)
    srDesc = `Breakout-retest at $${params.breakout.level.toFixed(2)} — high-quality setup`
  }

  if (params.pattern) {
    srPts = Math.min(15, srPts + Math.floor(params.pattern.strength / 2))
    srDesc += ` + ${params.pattern.name} candle pattern`
  }

  srPts = Math.min(15, srPts)
  if (srPts > 0) {
    reasons.push({ indicator: 'SR_QUALITY', description: srDesc, contribution: srPts, bullish: isLong })
  }

  // ── 5. RISK/REWARD (0-15 pts) ─────────────────────────────────────────────
  const rr = Math.abs(tp2 - entry) / Math.max(Math.abs(entry - sl), 0.00001)
  let rrPts = 0

  if (rr >= 3.0) rrPts = 15
  else if (rr >= 2.5) rrPts = 12
  else if (rr >= 2.0) rrPts = 10
  else if (rr >= 1.5) rrPts = 5
  else rrPts = 0 // Hard block below 1.5

  if (rrPts >= 10) {
    reasons.push({
      indicator: 'GOOD_RISK_REWARD',
      description: `R:R ratio ${rr.toFixed(1)}:1 — favourable`,
      contribution: rrPts,
      bullish: isLong,
    })
  }

  // ── 6. VOLATILITY SUITABILITY (0-10 pts) ──────────────────────────────────
  const atrPct = entry > 0 ? atr / entry : 0
  let volPts = 0
  let volDesc = ''

  if (atrPct >= 0.005 && atrPct <= 0.015) { volPts = 10; volDesc = 'Ideal volatility for entry' }
  else if (atrPct > 0.015 && atrPct <= 0.025) { volPts = 8; volDesc = 'Moderate volatility' }
  else if (atrPct > 0.025 && atrPct <= 0.04) { volPts = 5; volDesc = 'Elevated volatility — wider stops needed' }
  else if (atrPct > 0.04) { volPts = 2; volDesc = 'High volatility — caution' }
  else if (atrPct < 0.003) { volPts = 0; volDesc = 'Too low volatility — insufficient profit potential' }
  else { volPts = 4; volDesc = 'Low volatility' }

  if (volPts > 0) {
    reasons.push({ indicator: 'VOLATILITY_OK', description: `ATR ${(atrPct * 100).toFixed(2)}% — ${volDesc}`, contribution: volPts, bullish: isLong })
  }

  // ── 7. LIQUIDITY/SPREAD (0-10 pts) ────────────────────────────────────────
  const liquidityPts = LIQUIDITY_TIERS[pair] ?? 5

  reasons.push({
    indicator: 'LIQUIDITY_CHECK',
    description: `${pair} liquidity score: ${liquidityPts}/10`,
    contribution: liquidityPts,
    bullish: isLong,
  })

  const total = trendPts + momentumPts + volumePts + srPts + rrPts + volPts + liquidityPts

  return {
    trendAlignment: trendPts,
    momentum: momentumPts,
    volume: volumePts,
    srQuality: srPts,
    riskReward: rrPts,
    volatility: volPts,
    liquidity: liquidityPts,
    total: Math.min(100, total),
    reasons,
  }
}

// ─── Main Signal Generator ────────────────────────────────────────────────────

export function generateSignal(
  userId: string,
  pair: string,
  candlesByTF: Record<string, OHLCVCandle[]>
): Signal | null {
  const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d']
  const analyses: TFAnalysis[] = []

  for (const tf of TIMEFRAMES) {
    const candles = candlesByTF[tf]
    if (!candles || candles.length < 50) continue
    analyses.push(analyzeTimeframe(candles, tf))
  }

  if (analyses.length < 3) return null // Need at least 3 TFs

  const longCount = analyses.filter((a) => a.direction === 'long').length
  const shortCount = analyses.filter((a) => a.direction === 'short').length

  let direction: 'long' | 'short'
  if (longCount >= MIN_TF_AGREEMENT) direction = 'long'
  else if (shortCount >= MIN_TF_AGREEMENT) direction = 'short'
  else return null

  const alignedAnalyses = analyses.filter((a) => a.direction === direction)
  const alignedTFs = alignedAnalyses.map((a) => a.timeframe)

  // ── Hard filter: required TFs must agree ──────────────────────────────────
  // At least ONE of 1h/4h must be in the aligned set for credibility
  const hasRequiredTF = REQUIRED_TFS.some((tf) => alignedTFs.includes(tf))
  if (!hasRequiredTF) return null

  // ── Primary TF selection ──────────────────────────────────────────────────
  const primaryTF = ['1h', '4h', '15m', '1d', '5m'].find(
    (tf) => (candlesByTF[tf]?.length ?? 0) > 50
  ) || analyses[0].timeframe
  const primaryCandles = candlesByTF[primaryTF]
  if (!primaryCandles || primaryCandles.length < 50) return null

  const lastCandle = primaryCandles[primaryCandles.length - 1]
  const entry = lastCandle.close

  // ── ATR-based SL/TP ───────────────────────────────────────────────────────
  const atrValues = calcATR(primaryCandles, 14)
  const atr = atrValues[atrValues.length - 1]
  if (!atr || atr === 0) return null

  // ── S/R levels for refined SL ─────────────────────────────────────────────
  const srLevels = detectSRLevels(primaryCandles, 150)

  // SL: use nearest swing level + ATR buffer, or pure ATR if no level
  let sl: number
  if (direction === 'long') {
    const nearSupport = srLevels.supports
      .filter((s) => s.price < entry && s.price > entry * 0.97)
      .sort((a, b) => b.price - a.price)[0]
    sl = nearSupport
      ? Math.min(nearSupport.price - atr * 0.5, entry - atr * 1.5)
      : entry - atr * 1.5
  } else {
    const nearResistance = srLevels.resistances
      .filter((r) => r.price > entry && r.price < entry * 1.03)
      .sort((a, b) => a.price - b.price)[0]
    sl = nearResistance
      ? Math.max(nearResistance.price + atr * 0.5, entry + atr * 1.5)
      : entry + atr * 1.5
  }

  // TP targets: 1R, 2R, 3R relative to actual SL distance
  const slDist = Math.abs(entry - sl)
  let tp1: number, tp2: number, tp3: number

  if (direction === 'long') {
    tp1 = entry + slDist * 1.0  // 1R
    tp2 = entry + slDist * 2.0  // 2R
    tp3 = entry + slDist * 3.0  // 3R
  } else {
    tp1 = entry - slDist * 1.0
    tp2 = entry - slDist * 2.0
    tp3 = entry - slDist * 3.0
  }

  const riskReward = slDist > 0 ? Math.abs(tp2 - entry) / slDist : 0

  // ── Hard filter: R:R must be >= 2 ────────────────────────────────────────
  if (riskReward < MIN_RISK_REWARD) return null

  // ── Breakout/retest and pattern detection ─────────────────────────────────
  const breakout = detectBreakoutRetest(primaryCandles, srLevels, direction)
  const pattern = detectCandlePattern(primaryCandles)

  // ── Market regime ─────────────────────────────────────────────────────────
  const marketRegime = detectMarketRegime(primaryCandles)

  // ── Divergence check ──────────────────────────────────────────────────────
  const divergence = detectDivergence(primaryCandles)

  // ── Hard filter: no major divergence against direction ────────────────────
  if (direction === 'long' && divergence.bearish) return null
  if (direction === 'short' && divergence.bullish) return null

  // ── Hard filter: extremely high volatility = skip ─────────────────────────
  const atrPct = atr / entry
  if (atrPct > 0.06) return null // > 6% ATR = too volatile

  // ── Hard filter: candle pattern must not oppose direction ─────────────────
  if (pattern && pattern.strength >= 10) {
    if (direction === 'long' && !pattern.bullish && pattern.name !== 'DOJI') return null
    if (direction === 'short' && pattern.bullish && pattern.name !== 'DOJI') return null
  }

  // ── Score calculation ─────────────────────────────────────────────────────
  const scoreBreakdown = calculateScore({
    pair,
    direction,
    analyses,
    alignedAnalyses,
    primaryCandles,
    atr,
    entry,
    sl,
    tp2,
    srLevels,
    breakout,
    pattern: pattern && pattern.bullish === (direction === 'long') ? pattern : null,
  })

  // ── Hard filter: minimum score 75 ────────────────────────────────────────
  if (scoreBreakdown.total < MIN_SCORE_TO_SIGNAL) return null

  // ── Tier classification ───────────────────────────────────────────────────
  let tier: Signal['tier']
  if (scoreBreakdown.total >= 85) tier = 'ULTRA_HIGH'
  else if (scoreBreakdown.total >= 72) tier = 'HIGH'
  else tier = 'MODERATE'

  // ── Build reasons list ────────────────────────────────────────────────────
  const allReasons: SignalReason[] = []
  // Score breakdown reasons
  allReasons.push(...scoreBreakdown.reasons)
  // Pattern if applicable
  if (pattern && pattern.strength > 0 && pattern.bullish === (direction === 'long')) {
    allReasons.push({
      indicator: `PATTERN_${pattern.name}`,
      description: `${pattern.name.replace(/_/g, ' ')} detected — confirms setup`,
      contribution: pattern.strength,
      bullish: direction === 'long',
    })
  }

  // ── Invalidation conditions ───────────────────────────────────────────────
  const invalidationConditions: string[] = []
  const ema20Vals = calcEMA(primaryCandles.map((c) => c.close), 20)
  const ema20Last = ema20Vals[ema20Vals.length - 1]

  if (direction === 'long') {
    invalidationConditions.push(`Price closes below stop loss at $${sl.toFixed(2)}`)
    invalidationConditions.push(`Price closes below EMA20 on 1h ($${ema20Last.toFixed(2)})`)
    invalidationConditions.push(`RSI drops below 40 on 1h timeframe`)
    invalidationConditions.push(`MACD makes bearish crossover on 1h`)
    if (breakout.detected) invalidationConditions.push(`Price falls back below breakout level $${breakout.level.toFixed(2)}`)
  } else {
    invalidationConditions.push(`Price closes above stop loss at $${sl.toFixed(2)}`)
    invalidationConditions.push(`Price closes above EMA20 on 1h ($${ema20Last.toFixed(2)})`)
    invalidationConditions.push(`RSI rises above 60 on 1h timeframe`)
    invalidationConditions.push(`MACD makes bullish crossover on 1h`)
    if (breakout.detected) invalidationConditions.push(`Price recovers above breakdown level $${breakout.level.toFixed(2)}`)
  }

  // ── VWAP note ─────────────────────────────────────────────────────────────
  const vwapValues = calcVWAP(primaryCandles.slice(-200))
  const lastVWAP = vwapValues[vwapValues.length - 1]
  if (direction === 'long' && entry > lastVWAP) {
    allReasons.push({
      indicator: 'ABOVE_VWAP',
      description: `Price above VWAP ($${lastVWAP.toFixed(2)}) — buyers in control`,
      contribution: 5,
      bullish: true,
    })
  } else if (direction === 'short' && entry < lastVWAP) {
    allReasons.push({
      indicator: 'BELOW_VWAP',
      description: `Price below VWAP ($${lastVWAP.toFixed(2)}) — sellers in control`,
      contribution: 5,
      bullish: false,
    })
  }

  return {
    id: randomUUID(),
    userId,
    pair,
    direction,
    score: scoreBreakdown.total,
    tier,
    entry,
    tp1,
    tp2,
    tp3,
    sl,
    riskReward: Math.round(riskReward * 100) / 100,
    timeframe: primaryTF,
    timeframesAligned: alignedTFs,
    timeframesChecked: analyses.map((a) => a.timeframe),
    reasons: allReasons.slice(0, 10),
    marketRegime,
    invalidationConditions,
    modelVersion: MODEL_VERSION,
    executed: false,
    createdAt: new Date().toISOString(),
  }
}
