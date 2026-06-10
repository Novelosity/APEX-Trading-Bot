/**
 * APEX Risk Management Engine v2.0
 *
 * Capital protection rules (strict):
 * - Max 1% risk per trade (enforced in position sizing)
 * - Max 3% daily loss
 * - Max 7% weekly loss
 * - Max 3 consecutive losses → mandatory pause
 * - Max 5 trades per day
 * - 30-minute cooldown after any loss
 * - Max 3 concurrent open positions (default)
 * - No duplicate positions in same pair
 * - Futures: liquidation price must be far from SL
 *
 * These rules exist to prevent account blow-up. They cannot be disabled.
 */

import type { User, Trade } from './types'
import { getBotState } from './storage'

// Capital protection constants — do not loosen without careful review
const MAX_DAILY_LOSS_PCT     = 0.03  // 3% max daily loss
const MAX_WEEKLY_LOSS_PCT    = 0.07  // 7% max weekly loss
const MAX_CONSECUTIVE_LOSSES = 3     // Stop after 3 in a row
const MAX_TRADES_PER_DAY     = 5     // Daily trade limit
const LOSS_COOLDOWN_MINUTES  = 30    // Cool down after a loss
const MAX_FUTURES_LEVERAGE   = 3     // Hard cap on futures leverage

export interface RiskCheckResult {
  allowed: boolean
  reason: string
  riskLevel: 'ok' | 'warning' | 'blocked'
  details?: {
    dailyPnl?: number
    weeklyPnl?: number
    consecutiveLosses?: number
    openPositions?: number
    tradesToday?: number
    minutesSinceLastLoss?: number
  }
}

/**
 * Legacy position sizing — kept for compatibility with existing code.
 * Use calculateTradeSpec() from position-sizing.ts for new code.
 */
export function calculatePositionSize(
  balance: number,
  riskPct: number,
  entry: number,
  sl: number,
  consecutiveLosses: number
): number {
  if (entry === 0 || sl === 0 || entry === sl) return 0

  let effectiveRisk = Math.min(riskPct, 1.0) // Hard cap at 1%
  if (consecutiveLosses >= 2) effectiveRisk *= 0.75
  if (consecutiveLosses >= 3) effectiveRisk *= 0.5

  const riskAmount = balance * (effectiveRisk / 100)
  const stopDistance = Math.abs(entry - sl)
  const stopPct = stopDistance / entry

  if (stopPct === 0) return 0

  const positionSize = riskAmount / stopPct
  return Math.min(positionSize, balance * 0.5) // Never more than 50% of balance
}

/**
 * Primary gate — checks all risk rules before allowing a trade.
 */
export async function checkCanTrade(
  userId: string,
  pair: string,
  direction: 'long' | 'short',
  openTrades: Trade[],
  user: User,
  balance: number,
  tradesToday = 0,
  lastLossAt?: string
): Promise<RiskCheckResult> {
  const botState = await getBotState(userId)

  const details = {
    dailyPnl: botState.dailyPnl,
    weeklyPnl: botState.weeklyPnl,
    consecutiveLosses: botState.consecutiveLosses,
    openPositions: openTrades.length,
    tradesToday,
  }

  // ── Kill switch / manual halt ─────────────────────────────────────────────
  if (botState.tradingHalted) {
    return {
      allowed: false,
      reason: botState.haltReason || 'Trading halted — restart manually from dashboard',
      riskLevel: 'blocked',
      details,
    }
  }

  // ── Consecutive loss protection ───────────────────────────────────────────
  if (botState.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
    return {
      allowed: false,
      reason: `${MAX_CONSECUTIVE_LOSSES} consecutive losses — mandatory pause. Review strategy before resuming.`,
      riskLevel: 'blocked',
      details,
    }
  }

  // ── Daily loss limit (3%) ─────────────────────────────────────────────────
  const dailyLossLimit = balance * MAX_DAILY_LOSS_PCT
  if (botState.dailyPnl < -dailyLossLimit) {
    return {
      allowed: false,
      reason: `Daily loss limit reached (${(MAX_DAILY_LOSS_PCT * 100).toFixed(0)}% = $${dailyLossLimit.toFixed(2)}). Resumes tomorrow.`,
      riskLevel: 'blocked',
      details,
    }
  }

  // ── Weekly loss limit (7%) ────────────────────────────────────────────────
  const weeklyLossLimit = balance * MAX_WEEKLY_LOSS_PCT
  if (botState.weeklyPnl < -weeklyLossLimit) {
    return {
      allowed: false,
      reason: `Weekly loss limit reached (${(MAX_WEEKLY_LOSS_PCT * 100).toFixed(0)}% = $${weeklyLossLimit.toFixed(2)}). Resumes next week.`,
      riskLevel: 'blocked',
      details,
    }
  }

  // ── Daily trade count limit ───────────────────────────────────────────────
  if (tradesToday >= MAX_TRADES_PER_DAY) {
    return {
      allowed: false,
      reason: `Daily trade limit (${MAX_TRADES_PER_DAY}) reached. Resumes tomorrow.`,
      riskLevel: 'blocked',
      details: { ...details, tradesToday },
    }
  }

  // ── Loss cooldown (30 min after any loss) ─────────────────────────────────
  if (lastLossAt && botState.consecutiveLosses > 0) {
    const msSinceLoss = Date.now() - new Date(lastLossAt).getTime()
    const minutesSinceLoss = msSinceLoss / 60000
    if (minutesSinceLoss < LOSS_COOLDOWN_MINUTES) {
      const remaining = Math.ceil(LOSS_COOLDOWN_MINUTES - minutesSinceLoss)
      return {
        allowed: false,
        reason: `Loss cooldown active — ${remaining} minutes remaining before next trade.`,
        riskLevel: 'warning',
        details: { ...details, minutesSinceLastLoss: Math.floor(minutesSinceLoss) },
      }
    }
  }

  // ── Max concurrent positions ──────────────────────────────────────────────
  if (openTrades.length >= user.maxPositions) {
    return {
      allowed: false,
      reason: `Max open positions (${user.maxPositions}) reached`,
      riskLevel: 'warning',
      details,
    }
  }

  // ── No duplicate pair ─────────────────────────────────────────────────────
  const existing = openTrades.find((t) => t.pair === pair && t.status === 'open')
  if (existing) {
    return {
      allowed: false,
      reason: `Already have an open ${existing.direction} position in ${pair}`,
      riskLevel: 'warning',
      details,
    }
  }

  // ── Futures leverage cap ──────────────────────────────────────────────────
  if (user.tradingMode === 'futures' && user.leverage > MAX_FUTURES_LEVERAGE) {
    return {
      allowed: false,
      reason: `Leverage ${user.leverage}x exceeds max safe leverage (${MAX_FUTURES_LEVERAGE}x). Update settings.`,
      riskLevel: 'blocked',
      details,
    }
  }

  // ── Minimum balance check ─────────────────────────────────────────────────
  if (balance < 20) {
    return {
      allowed: false,
      reason: `Balance too low ($${balance.toFixed(2)} < $20 minimum). Please deposit funds.`,
      riskLevel: 'blocked',
      details,
    }
  }

  return { allowed: true, reason: 'OK', riskLevel: 'ok', details }
}

/**
 * Validate futures-specific risk before placing order.
 * Returns error string or null if safe.
 */
export function checkFuturesRisk(params: {
  entry: number
  sl: number
  liquidationPrice: number
  direction: 'long' | 'short'
  leverage: number
}): string | null {
  const { entry, sl, liquidationPrice, direction, leverage } = params

  if (leverage > MAX_FUTURES_LEVERAGE) {
    return `Leverage ${leverage}x exceeds maximum safe limit (${MAX_FUTURES_LEVERAGE}x)`
  }

  if (!liquidationPrice || liquidationPrice === 0) return null

  const slDist = Math.abs(entry - sl)
  const liqDist = Math.abs(entry - liquidationPrice)

  if (liqDist < slDist * 1.5) {
    return `Liquidation ($${liquidationPrice.toFixed(2)}) is too close to SL ($${sl.toFixed(2)}). Reduce leverage.`
  }

  // Check liquidation is on the correct side of SL
  if (direction === 'long' && liquidationPrice > sl) {
    return `Liquidation above stop loss — would liquidate before SL is hit.`
  }
  if (direction === 'short' && liquidationPrice < sl) {
    return `Liquidation below stop loss — would liquidate before SL is hit.`
  }

  return null
}

/**
 * Quick summary of current risk exposure for dashboard.
 */
export async function getRiskSummary(userId: string, balance: number): Promise<{
  dailyLossUsed: number
  weeklyLossUsed: number
  dailyLimitUsd: number
  weeklyLimitUsd: number
  canTrade: boolean
  consecutiveLosses: number
}> {
  const state = await getBotState(userId)
  const dailyLimit = balance * MAX_DAILY_LOSS_PCT
  const weeklyLimit = balance * MAX_WEEKLY_LOSS_PCT
  const dailyLossUsed = state.dailyPnl < 0 ? Math.abs(state.dailyPnl) / dailyLimit : 0
  const weeklyLossUsed = state.weeklyPnl < 0 ? Math.abs(state.weeklyPnl) / weeklyLimit : 0

  return {
    dailyLossUsed: Math.min(1, dailyLossUsed),
    weeklyLossUsed: Math.min(1, weeklyLossUsed),
    dailyLimitUsd: dailyLimit,
    weeklyLimitUsd: weeklyLimit,
    canTrade: !state.tradingHalted && state.consecutiveLosses < MAX_CONSECUTIVE_LOSSES &&
      dailyLossUsed < 1 && weeklyLossUsed < 1,
    consecutiveLosses: state.consecutiveLosses,
  }
}
