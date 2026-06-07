export const runtime = 'nodejs'

import { decrypt } from './crypto'
import type { User } from './types'

export interface OHLCVCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OrderResult {
  id: string
  symbol: string
  side: string
  type: string
  amount: number
  price?: number
  status: string
}

export class ExchangeClient {
  private exchange: any | null = null
  private userId: string
  private exchangeId: string
  private apiKey: string
  private apiSecret: string
  private apiPassphrase: string
  private tradingMode: 'spot' | 'futures'

  constructor(user: User) {
    this.userId = user.id
    this.exchangeId = user.exchange
    this.tradingMode = user.tradingMode
    try {
      this.apiKey = decrypt(user.apiKeyEnc)
      this.apiSecret = decrypt(user.apiSecretEnc)
      this.apiPassphrase = user.apiPassphraseEnc ? decrypt(user.apiPassphraseEnc) : ''
    } catch {
      this.apiKey = ''
      this.apiSecret = ''
      this.apiPassphrase = ''
    }
  }

  private async getExchange() {
    if (this.exchange) return this.exchange

    const ccxt = await import('ccxt')
    const ExchangeClass = (ccxt as any)[this.exchangeId] as (new (config: Record<string, unknown>) => any) | undefined

    if (!ExchangeClass) {
      throw new Error(`Exchange ${this.exchangeId} not supported`)
    }

    const config: Record<string, unknown> = {
      apiKey: this.apiKey,
      secret: this.apiSecret,
      enableRateLimit: true,
      ...(this.apiPassphrase ? { password: this.apiPassphrase } : {}),
    }

    if (this.tradingMode === 'futures') {
      config.options = { defaultType: 'future' }
    }

    this.exchange = new ExchangeClass(config)
    return this.exchange
  }

  async fetchBalance(): Promise<{ free: number; total: number; used: number }> {
    const ex = await this.getExchange()
    const balance = await ex.fetchBalance()
    const usdt = balance['USDT'] || balance['USD'] || { free: 0, total: 0, used: 0 }
    return {
      free: parseFloat(String(usdt.free || 0)),
      total: parseFloat(String(usdt.total || 0)),
      used: parseFloat(String(usdt.used || 0)),
    }
  }

  async fetchTicker(symbol: string): Promise<{ last: number; bid: number; ask: number; change: number; percentage: number }> {
    const ex = await this.getExchange()
    const ticker = await ex.fetchTicker(symbol)
    return {
      last: ticker.last || 0,
      bid: ticker.bid || 0,
      ask: ticker.ask || 0,
      change: ticker.change || 0,
      percentage: ticker.percentage || 0,
    }
  }

  async fetchOHLCV(symbol: string, timeframe = '1h', limit = 100): Promise<OHLCVCandle[]> {
    const ex = await this.getExchange()
    const ohlcv = await ex.fetchOHLCV(symbol, timeframe, undefined, limit)
    return ohlcv.map((c: any[]) => ({
      timestamp: c[0] as number,
      open: c[1] as number,
      high: c[2] as number,
      low: c[3] as number,
      close: c[4] as number,
      volume: c[5] as number,
    }))
  }

  async createMarketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    amount: number
  ): Promise<OrderResult> {
    const ex = await this.getExchange()
    const order = await ex.createMarketOrder(symbol, side, amount)
    return {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      amount: order.amount,
      price: order.price || undefined,
      status: order.status || 'unknown',
    }
  }

  async createStopOrder(
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    stopPrice: number
  ): Promise<OrderResult> {
    const ex = await this.getExchange()
    const order = await ex.createOrder(symbol, 'stop_market', side, amount, stopPrice, {
      stopPrice,
      triggerPrice: stopPrice,
    })
    return {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      amount: order.amount,
      price: stopPrice,
      status: order.status || 'unknown',
    }
  }

  async cancelAllOrders(symbol: string): Promise<void> {
    const ex = await this.getExchange()
    await ex.cancelAllOrders(symbol)
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    const ex = await this.getExchange()
    if (ex.has['setLeverage']) {
      await ex.setLeverage(leverage, symbol)
    }
  }
}

// Static method to create from user object
export async function createExchangeClient(user: User): Promise<ExchangeClient> {
  return new ExchangeClient(user)
}
