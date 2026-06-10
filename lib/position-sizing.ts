/**
 * APEX Position Sizing Engine
 *
 * Calculates position size based on:
 * - Account balance and risk percentage
 * - Stop loss distance (ATR-based or S/R-based)
 * - Confidence score (75-84 = reduced risk, 85+ = normal risk)
 * - Exchange fees and slippage estimate
 * - Futures leverage and liquidation price check
 * - Exchange minimum order size
 *
 * Formula: position size = risk_amount / stop_loss_distance_pct
 */

import type { User, TradeSpec } from './types'

// Typical round-trip fee (0.1% entry + 0.1% exit = 0.2% for market orders)
// Limit orders: 0.08% maker + 0.08% = 0.16%
const MARKET_FEE_PCT = 0.001  // 0.1% per side
const LIMIT_FEE_PCT  = 0.0008 // 0.08% per side (maker)

// Slippage estimate by pair liquidity
const SLIPPAGE_BY_TIER: Record<string, number> = {
  'BTC/USDT': 0.0002,  // 0.02%
  'ETH/USDT': 0.0002,
  'BNB/USDT': 0.0003,
  'SOL/USDT': 0.0003,
  'XRP/USDT': 0.0003,
  'ADA/USDT': 0.0004,
  'AVAX/USDT': 0.0004,
  'DOT/USDT': 0.0004,
  'LINK/USDT': 0.0004,
  'LTC/USDT': 0.0005,
  'MATIC/USDT': 0.0005,
  'ATOM/USDT': 0.0005,
  'ARB/USDT': 0.0006,
  'OP/USDT': 0.0006,
}
const DEFAULT_SLIPPAGE = 0.0008 // 0.08% default

// Exchange minimum order sizes in USDT
const MIN_ORDER_USD = 10 // $10 minimum on most exchanges

/**
 * Calculate risk-adjusted risk percentage based on confidence score.
 * Score 85+: normal risk
 * Score 75-84: 60% of normal risk
 * Score < 75: not tradeable (caller should block)
 */
export function getScoreAdjustedRiskPct(riskPct: number, score: number): number {
  if (score >= 85) return riskPct
  if (score >= 75) return riskPct * 0.6
  return 0 // Should not happen — signals below 75 are blocked
}

/**
 * Calculate futures maintenance margin rate (approximate)
 */
function getMaintenanceMarginRate(leverage: number): number {
  if (leverage <= 3) return 0.005
  if (leverage <= 5) return 0.0065
  if (leverage <= 10) return 0.01
  if (leverage <= 20) return 0.0125
  return 0.015
}

/**
 * Calculate liquidation price for futures position.
 * Uses simplified formula for cross-margin.
 */
export function calcLiquidationPrice(
  entry: number,
  leverage: number,
  direction: 'long' | 'short',
  maintenanceMarginRate: number
): number {
  if (leverage <= 1) return 0 // Spot has no liquidation

  if (direction === 'long') {
    // Liquidation price = entry * (1 - 1/leverage + maintenanceMarginRate)
    return entry * (1 - 1 / leverage + maintenanceMarginRate)
  } else {
    // Liquidation price = entry * (1 + 1/leverage - maintenanceMarginRate)
    return entry * (1 + 1 / leverage - maintenanceMarginRate)
  }
}

/**
 * Validate that liquidation price is well beyond the stop loss.
 * Returns an error string if the liquidation risk is too high.
 */
export function checkLiquidationRisk(
  entry: number,
  sl: number,
  liquidationPrice: number,
  direction: 'long' | 'short'
): string | null {
  if (!liquidationPrice || liquidationPrice === 0) return null

  const slDistance = Math.abs(entry - sl)
  const liqDistance = Math.abs(entry - liquidationPrice)

  // Liquidation must be at least 2x further than stop loss
  if (liqDistance < slDistance * 2) {
    return `Liquidation price ($${liquidationPrice.toFixed(2)}) is too close to stop loss ($${sl.toFixed(2)}). Reduce leverage.`
  }

  // Ensure liquidation price doesn't sit between entry and stop loss
  if (direction === 'long' && liquidationPrice > sl) {
    return `Liquidation price ($${liquidationPrice.toFixed(2)}) is above stop loss ($${sl.toFixed(2)}). This would liquidate before SL hits.`
  }
  if (direction === 'short' && liquidationPrice < sl) {
    return `Liquidation price ($${liquidationPrice.toFixed(2)}) is below stop loss ($${sl.toFixed(2)}). This would liquidate before SL hits.`
  }

  return null
}

/**
 * Main position sizing function — returns a full TradeSpec.
 *
 * @param balance     Available USDT balance
 * @param user        User settings (riskPct, leverage, tradingMode, etc.)
 * @param entry       Entry price
 * @param sl          Stop loss price
 * @param tp2         Take profit 2 (used for R:R calculation)
 * @param direction   Trade direction
 * @param pair        Trading pair (for slippage/liquidity lookup)
 * @param score       Signal confidence score (affects risk sizing)
 * @param consecutiveLosses  Consecutive losses (further reduces size)
 * @param useLimit    Whether to use limit orders (lower fee)
 */
export function calculateTradeSpec(params: {
  balance: number
  user: User
  entry: number
  sl: number
  tp2: number
  direction: 'long' | 'short'
  pair: string
  score: number
  consecutiveLosses: number
  useLimit?: boolean
}): TradeSpec & { isValid: boolean; invalidReason?: string } {
  const { balance, user, entry, sl, tp2, direction, pair, score, consecutiveLosses, useLimit = false } = params

  // ── Validation ──────────────────────────────────────────────────────────
  if (balance <= 0) return invalid('Insufficient balance')
  if (entry <= 0 || sl <= 0) return invalid('Invalid price levels')
  if (entry === sl) return invalid('Entry equals stop loss')
  if (direction === 'long' && sl >= entry) return invalid('Stop loss must be below entry for long')
  if (direction === 'short' && sl <= entry) return invalid('Stop loss must be above entry for short')

  // ── Score-adjusted risk percentage ────────────────────────────────────────
  let effectiveRiskPct = getScoreAdjustedRiskPct(user.riskPct, score)

  // Scale down further on consecutive losses
  if (consecutiveLosses >= 2) effectiveRiskPct *= 0.75
  if (consecutiveLosses >= 3) effectiveRiskPct *= 0.5

  // Cap at 1% maximum per trade (capital protection)
  effectiveRiskPct = Math.min(effectiveRiskPct, 1.0)

  // ── Risk amount ───────────────────────────────────────────────────────────
  const riskAmountUsd = balance * (effectiveRiskPct / 100)

  // ── Stop loss distance ────────────────────────────────────────────────────
  const slDistance = Math.abs(entry - sl)
  const slDistancePct = slDistance / entry

  if (slDistancePct <= 0) return invalid('Invalid stop loss distance')
  if (slDistancePct > 0.15) return invalid('Stop loss distance too wide (>15%) — reduce leverage or widen balance pct')

  // ── Position size ─────────────────────────────────────────────────────────
  // Formula: position_size = risk_amount / sl_distance_pct
  const leverage = user.tradingMode === 'futures' ? user.leverage : 1
  let positionSizeUsd = riskAmountUsd / slDistancePct

  // Cap at user's balancePct allocation
  const maxPositionUsd = balance * (user.balancePct / 100) * leverage
  positionSizeUsd = Math.min(positionSizeUsd, maxPositionUsd)

  // Enforce minimum order size
  if (positionSizeUsd < MIN_ORDER_USD) return invalid(`Position too small ($${positionSizeUsd.toFixed(2)} < $${MIN_ORDER_USD} minimum)`)

  // ── Fee estimation ────────────────────────────────────────────────────────
  const feePct = useLimit ? LIMIT_FEE_PCT : MARKET_FEE_PCT
  const estimatedFeeUsd = positionSizeUsd * feePct * 2 // entry + exit

  // ── Slippage estimation ───────────────────────────────────────────────────
  const slippagePct = SLIPPAGE_BY_TIER[pair] ?? DEFAULT_SLIPPAGE
  const estimatedSlippageUsd = useLimit ? 0 : positionSizeUsd * slippagePct

  // ── Max loss (risk + costs) ───────────────────────────────────────────────
  const maxLossUsd = riskAmountUsd + estimatedFeeUsd + estimatedSlippageUsd

  // ── Quantity in base currency ─────────────────────────────────────────────
  const quantityBase = positionSizeUsd / entry

  // ── Futures: liquidation price ───────────────────────────────────────────
  let liquidationPrice: number | undefined
  if (user.tradingMode === 'futures' && leverage > 1) {
    const mmRate = getMaintenanceMarginRate(leverage)
    liquidationPrice = calcLiquidationPrice(entry, leverage, direction, mmRate)

    const liqError = checkLiquidationRisk(entry, sl, liquidationPrice, direction)
    if (liqError) return invalid(liqError)
  }

  // ── R:R ratio ─────────────────────────────────────────────────────────────
  const riskReward = slDistance > 0 ? Math.abs(tp2 - entry) / slDistance : 0
  if (riskReward < 2.0) return invalid(`R:R ratio ${riskReward.toFixed(2)} is below minimum 2.0`)

  return {
    positionSizeUsd: Math.round(positionSizeUsd * 100) / 100,
    quantityBase: Math.round(quantityBase * 100000) / 100000,
    riskAmountUsd: Math.round(riskAmountUsd * 100) / 100,
    estimatedFeeUsd: Math.round(estimatedFeeUsd * 100) / 100,
    estimatedSlippageUsd: Math.round(estimatedSlippageUsd * 100) / 100,
    maxLossUsd: Math.round(maxLossUsd * 100) / 100,
    leverage,
    liquidationPrice: liquidationPrice ? Math.round(liquidationPrice * 100) / 100 : undefined,
    scoreAdjustedRiskPct: Math.round(effectiveRiskPct * 100) / 100,
    isValid: true,
  }
}

function invalid(reason: string): TradeSpec & { isValid: false; invalidReason: string } {
  return {
    positionSizeUsd: 0,
    quantityBase: 0,
    riskAmountUsd: 0,
    estimatedFeeUsd: 0,
    estimatedSlippageUsd: 0,
    maxLossUsd: 0,
    leverage: 1,
    liquidationPrice: undefined,
    scoreAdjustedRiskPct: 0,
    isValid: false,
    invalidReason: reason,
  }
}
