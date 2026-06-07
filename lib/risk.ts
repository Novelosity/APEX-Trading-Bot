import type { User, Trade } from './types'
import { getBotState } from './storage'

// Maximum daily loss: 5% of balance
const MAX_DAILY_LOSS_PCT = 0.05
// Maximum weekly loss: 10% of balance
const MAX_WEEKLY_LOSS_PCT = 0.10
// Maximum consecutive losses before halting
const MAX_CONSECUTIVE_LOSSES = 4

export function calculatePositionSize(
  balance: number,
  riskPct: number,
  entry: number,
  sl: number,
  consecutiveLosses: number
): number {
  if (entry === 0 || sl === 0 || entry === sl) return 0

  // Scale down after consecutive losses
  let effectiveRisk = riskPct
  if (consecutiveLosses >= 2) {
    effectiveRisk = riskPct * 0.75
  }
  if (consecutiveLosses >= 3) {
    effectiveRisk = riskPct * 0.5
  }

  const riskAmount = balance * (effectiveRisk / 100)
  const stopDistance = Math.abs(entry - sl)
  const stopPct = stopDistance / entry

  if (stopPct === 0) return 0

  // Position size in quote currency (USDT)
  const positionSize = riskAmount / stopPct
  return Math.min(positionSize, balance) // Never risk more than 100% of balance
}

export async function checkCanTrade(
  userId: string,
  pair: string,
  direction: 'long' | 'short',
  openTrades: Trade[],
  user: User,
  balance: number
): Promise<{ allowed: boolean; reason: string }> {
  const botState = await getBotState(userId)

  // Check if trading is halted
  if (botState.tradingHalted) {
    return { allowed: false, reason: botState.haltReason || 'Trading halted by risk manager' }
  }

  // Check consecutive losses
  if (botState.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
    return {
      allowed: false,
      reason: `${MAX_CONSECUTIVE_LOSSES} consecutive losses — trading paused. Reset manually in settings.`,
    }
  }

  // Check daily P&L limit
  const dailyLossLimit = balance * MAX_DAILY_LOSS_PCT
  if (botState.dailyPnl < -dailyLossLimit) {
    return { allowed: false, reason: 'Daily loss limit reached (5% of balance)' }
  }

  // Check weekly P&L limit
  const weeklyLossLimit = balance * MAX_WEEKLY_LOSS_PCT
  if (botState.weeklyPnl < -weeklyLossLimit) {
    return { allowed: false, reason: 'Weekly loss limit reached (10% of balance)' }
  }

  // Check max concurrent positions
  if (openTrades.length >= user.maxPositions) {
    return {
      allowed: false,
      reason: `Max concurrent positions (${user.maxPositions}) reached`,
    }
  }

  // Check for existing position in same pair
  const existingPosition = openTrades.find((t) => t.pair === pair && t.status === 'open')
  if (existingPosition) {
    return { allowed: false, reason: `Already have an open position in ${pair}` }
  }

  return { allowed: true, reason: 'OK' }
}
