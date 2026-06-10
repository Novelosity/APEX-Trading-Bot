export interface User {
  id: string
  email?: string
  passwordHash?: string
  exchange: string
  apiKeyEnc: string
  apiSecretEnc: string
  apiPassphraseEnc?: string
  tradingMode: 'spot' | 'futures'
  execMode: 'manual' | 'auto' | 'approval'
  paperMode?: boolean
  leverage: number
  balancePct: number
  riskPct: number
  maxPositions: number
  createdAt: string
  updatedAt: string
}

export interface Trade {
  id: string
  userId: string
  pair: string
  direction: 'long' | 'short'
  entryPrice: number
  exitPrice?: number
  positionSize: number
  slPrice: number
  tp1Price: number
  tp2Price: number
  tp3Price: number
  status: 'open' | 'closed' | 'cancelled'
  pnlUsd?: number
  pnlPct?: number
  closeReason?: 'tp1' | 'tp2' | 'tp3' | 'sl' | 'manual' | 'timeout'
  notes?: string
  openedAt: string
  closedAt?: string
  orderId?: string
}

export interface SignalReason {
  indicator: string
  description: string
  contribution: number
  bullish: boolean
}

/** Full position sizing and cost breakdown for a trade */
export interface TradeSpec {
  positionSizeUsd: number      // Total position value in USDT
  quantityBase: number         // Amount in base currency
  riskAmountUsd: number        // USD at risk (from balance * riskPct)
  estimatedFeeUsd: number      // Round-trip fees (entry + exit)
  estimatedSlippageUsd: number // Slippage estimate
  maxLossUsd: number           // riskAmount + fees + slippage
  leverage: number             // 1 for spot, user.leverage for futures
  liquidationPrice?: number    // Futures only
  scoreAdjustedRiskPct: number // Effective risk% after score adjustment
}

/** Backtest result summary */
export interface BacktestResult {
  pair: string
  timeframe: string
  totalTrades: number
  winCount: number
  lossCount: number
  winRate: number
  profitFactor: number | null
  netPnlPct: number
  maxDrawdownPct: number
  sharpeRatio: number | null
  expectancyPct: number
  avgWinPct: number
  avgLossPct: number
  bestTradePct: number
  worstTradePct: number
  consecutiveLossesMax: number
  startDate: string
  endDate: string
  totalBars: number
  signalsGenerated: number
  feePct: number
  slippagePct: number
  passedFilter: boolean
}

export interface Signal {
  id: string
  userId: string
  pair: string
  direction: 'long' | 'short'
  score: number
  tier: 'ULTRA_HIGH' | 'HIGH' | 'MODERATE'
  entry: number
  tp1: number
  tp2: number
  tp3: number
  sl: number
  riskReward?: number
  timeframe: string
  timeframesAligned: string[]
  timeframesChecked?: string[]
  reasons?: SignalReason[]
  marketRegime?: 'trending' | 'ranging' | 'volatile'
  invalidationConditions?: string[]
  modelVersion?: string
  tradeSpec?: TradeSpec
  // Approval workflow
  pendingApproval?: boolean
  approvalExpiresAt?: string
  rejectedAt?: string
  executed: boolean
  executedTradeId?: string
  createdAt: string
}

export interface BotState {
  userId: string
  dailyPnl: number
  weeklyPnl: number
  tradingHalted: boolean
  haltReason?: string
  killSwitchAt?: string
  consecutiveLosses: number
  lastTradeAt?: string
  totalTrades: number
  winCount: number
  lossCount: number
}

export interface ExchangeInfo {
  id: string
  name: string
  emoji: string
  color: string
  description: string
  requiresPassphrase?: boolean
}

export interface SessionData {
  userId: string
  exchange: string
  email?: string
  isSetup: boolean
}

export interface BalanceInfo {
  total: number
  free: number
  used: number
  currency: string
  change24h?: number
  changePct24h?: number
}

export interface ChartDataPoint {
  date: string
  pnl: number
  cumulative: number
}

export interface DashboardData {
  balance: BalanceInfo
  openTrades: Trade[]
  recentSignals: Signal[]
  botState: BotState
  chartData: ChartDataPoint[]
  winRate: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface CongressionalDisclosure {
  id: string
  politician: string
  party: 'D' | 'R' | 'I' | string
  state: string
  committees: string[]
  ticker: string
  company: string
  tradeType: 'buy' | 'sell'
  tradeDate: string
  disclosureDate: string
  disclosureDelay: number
  estimatedValueMin: number
  estimatedValueMax: number
  signalStrength: 1 | 2 | 3 | 4 | 5
  fetchedAt: string
}

export interface CongressMemberScore {
  name: string
  party: 'D' | 'R' | 'I' | string
  state: string
  committees: string[]
  performanceScore: number
  return12m: number
  winRate: number
  tradeCount: number
  isTopPerformer: boolean
}

export interface MirrorPosition {
  id: string
  userId: string
  ticker: string
  company: string
  politician: string
  committees: string[]
  entryPrice: number
  currentPrice: number
  shares: number
  allocationPct: number
  status: 'open' | 'closed'
  stopLoss: number
  trailingStopActivated: boolean
  signalStrength: number
  disclosureId: string
  alpacaOrderId?: string
  openedAt: string
  closedAt?: string
  pnlPct?: number
  pnlUsd?: number
  closeReason?: 'stop_loss' | 'trailing_stop' | 'time_stop' | 'sell_signal' | 'manual'
}

export interface SignalSource {
  id: string
  name: string
  url: string
  type: 'api' | 'web_scrape' | 'websocket' | 'funding_rate' | 'whale' | 'open_interest' | 'orderbook' | 'social' | 'sentiment'
  enabled: boolean
  priority: number
  lastSignal?: {
    pair: string
    direction: 'long' | 'short'
    confidence: number
    timestamp: string
  }
  updatedAt: string
}

export interface ExternalSignal {
  id: string
  sourceId: string
  pair: string
  direction: 'long' | 'short'
  confidence: number
  price: number
  leverage?: number
  metadata?: Record<string, unknown>
  timestamp: string
}

export interface CongressionalModuleConfig {
  userId: string
  enabled: boolean
  alpacaApiKeyEnc?: string
  alpacaSecretKeyEnc?: string
  alpacaMode: 'paper' | 'live'
  telegramBotToken?: string
  telegramChatId?: string
  maxAllocationPct: number
  positionSizePct: number
  stopLossPct: number
  trailingStopPct: number
  trailingStopTriggerPct: number
  maxDisclosureDelayDays: number
  minTradeValueUsd: number
  updatedAt: string
}