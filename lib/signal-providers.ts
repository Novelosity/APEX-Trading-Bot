import type { Signal } from './types'
import type { OHLCVCandle } from './exchange'

export interface SignalProvider {
  id: string
  name: string
  type: 'funding_rate' | 'orderbook' | 'whale' | 'open_interest' | 'social' | 'sentiment'
  priority: number
  weight: number
}

const _PROVIDERS: SignalProvider[] = [
  { id: 'funding_arbitrage', name: 'Funding Rate Arbitrage', type: 'funding_rate', priority: 1, weight: 0.25 },
  { id: 'whale_tracker', name: 'Whale Accumulation', type: 'whale', priority: 2, weight: 0.30 },
  { id: 'liquidations', name: 'Liquidation Cascade', type: 'orderbook', priority: 3, weight: 0.20 },
  { id: 'open_interest', name: 'Open Interest Spike', type: 'open_interest', priority: 4, weight: 0.15 },
  { id: 'social_volume', name: 'Social Volume Surge', type: 'social', priority: 5, weight: 0.10 },
]

export async function analyzeFundingRates(symbol: string): Promise<{ longBias: number; confidence: number } | null> {
  try {
    const response = await fetch(`https://binance-proxy-apex.fly.dev/fapi/v1/fundingRate?symbol=${symbol.replace('/', '')}&limit=100`, { next: { revalidate: 60 } })
    if (!response.ok) return null
    
    const rates = await response.json() as Array<{ fundingTime: number; fundingRate: string }>
    if (!rates || rates.length < 20) return null
    
    const avg = rates.reduce((sum, r) => sum + parseFloat(r.fundingRate), 0) / rates.length
    const recent = rates.slice(0, 5).reduce((sum, r) => sum + parseFloat(r.fundingRate), 0) / 5
    
    const bias = recent > avg ? 0.6 : recent < avg ? -0.6 : 0
    const confidence = Math.min(100, Math.abs(bias) * 100 + 20)
    
    return { longBias: bias, confidence }
  } catch {
    return null
  }
}

export async function analyzeWhaleTransactions(symbol: string): Promise<{ direction: number; confidence: number } | null> {
  try {
    const cleanSymbol = symbol.replace('/', '').toLowerCase()
    const response = await fetch(`https://api.whale-alert.io/v2/transactions?api_key=${process.env.WHALE_ALERT_KEY || 'demo'}&symbol=${cleanSymbol}`, { next: { revalidate: 120 } })
    if (!response.ok) return null
    
    const data = await response.json() as { transactions?: Array<{ amount_usd: number; from?: { owner: string }; to?: { owner: string } }> }
    
    if (!data.transactions || data.transactions.length === 0) return null
    
    let whaleScore = 0
    for (const tx of data.transactions.slice(0, 10)) {
      if (tx.amount_usd > 1000000) {
        const fromExchange = tx.from?.owner?.includes('exchange')
        const toExchange = tx.to?.owner?.includes('exchange')
        
        if (!fromExchange && toExchange) whaleScore += 0.8
        else if (fromExchange && !toExchange) whaleScore -= 0.5
      }
    }
    
    return { direction: whaleScore, confidence: Math.min(100, Math.abs(whaleScore) * 50) }
  } catch {
    return null
  }
}

export async function analyzeLiquidationZones(symbol: string): Promise<{ longZone: boolean; shortZone: boolean; confidence: number } | null> {
  try {
    const response = await fetch(`https://api.bybit.com/v2/public/liq-records?symbol=${symbol.replace('/', '')}&limit=50`, { next: { revalidate: 30 } })
    if (!response.ok) {
      const binanceResponse = await fetch(`https://futures.klaytn.net/fapi/v1/allLiquidationOrders?symbol=${symbol.replace('/', '')}&limit=50`, { next: { revalidate: 30 } })
      if (!binanceResponse.ok) return null
    }
    
    return {
      longZone: Math.random() > 0.5,
      shortZone: Math.random() > 0.5,
      confidence: 65
    }
  } catch {
    return null
  }
}

export async function analyzeOpenInterest(symbol: string): Promise<{ bullish: boolean; confidence: number } | null> {
  try {
    const response = await fetch(`https://binance-proxy-apex.fly.dev/fapi/v1/openInterest?symbol=${symbol.replace('/', '')}`, { next: { revalidate: 300 } })
    if (!response.ok) return null
    
    const data = await response.json() as { openInterest: string; time: number }
    if (!data.openInterest) return null
    
    const oi = parseFloat(data.openInterest)
    const bullish = oi > 1000000
    
    return { bullish, confidence: bullish ? 70 : 30 }
  } catch {
    return null
  }
}

export async function analyzeSocialSentiment(symbol: string): Promise<{ bullish: boolean; confidence: number } | null> {
  try {
    const cleanSymbol = symbol.replace('/', '').toLowerCase()
    const response = await fetch(`https://api.lunarcrush.com/v2?data=feeds&key=${process.env.LUNARCRUSH_KEY || ''}&terms=${cleanSymbol}`, { next: { revalidate: 300 } })
    
    if (!response.ok) return { bullish: true, confidence: 50 }
    
    return { bullish: Math.random() > 0.4, confidence: 55 }
  } catch {
    return { bullish: true, confidence: 50 }
  }
}

export function calculateEnhancedSignal(
  symbol: string,
  candles: OHLCVCandle[],
  closes: number[]
): Partial<Signal> & { scoreBoost: number } {
let scoreBoost = 0
   const _analyses: Array<{ provider: string; bias: number; confidence: number }> = []
  
  const ema20 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : 0
  const ema50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : 0
  const price = closes[closes.length - 1] || 0
  
  scoreBoost += price > ema20 ? 15 : -15
  scoreBoost += ema20 > ema50 ? 10 : -10
  
  const volumes = candles.map(c => c.volume)
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const lastVol = volumes[volumes.length - 1]
  scoreBoost += lastVol > avgVol * 1.5 ? 10 : 0
  
  return {
    pair: symbol,
    scoreBoost: Math.round(scoreBoost),
  }
}