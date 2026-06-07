import { chromium, type Browser, type Page } from 'playwright'
import type { Trade, Signal } from './types'

export interface PlatformCredentials {
  apiKey: string
  apiSecret: string
  passphrase?: string
  email?: string
  password?: string
}

export interface PlatformConfig {
  id: string
  name: string
  loginUrl: string
  tradingUrl: string
  selectors: {
    email?: string
    password?: string
    apiKey?: string
    apiSecret?: string
    passphrase?: string
    submit?: string
    pairInput?: string
    amountInput?: string
    buyBtn?: string
    sellBtn?: string
    leverageSelect?: string
    confirmBtn?: string
  }
}

export const PLATFORMS: PlatformConfig[] = [
  {
    id: 'binance',
    name: 'Binance',
    loginUrl: 'https://www.binance.com/en/login',
    tradingUrl: 'https://www.binance.com/en/futures/trade',
    selectors: {
      email: 'input[placeholder*="Email"]',
      password: 'input[placeholder*="Password"]',
      submit: 'button:has-text("Log In")',
      pairInput: 'input[placeholder*="Search"]',
      amountInput: 'input[placeholder*="Amount"]',
      buyBtn: 'button:has-text("Buy")',
      sellBtn: 'button:has-text("Sell")',
      leverageSelect: '.lev-select',
      confirmBtn: 'button:has-text("Confirm")',
    }
  },
  {
    id: 'bybit',
    name: 'Bybit',
    loginUrl: 'https://www.bybit.com/en/login',
    tradingUrl: 'https://www.bybit.com/en/derivatives/spot',
    selectors: {
      email: 'input[name="email"]',
      password: 'input[name="password"]',
      submit: 'button[type="submit"]',
      pairInput: 'input[placeholder*="Search"]',
      amountInput: 'input[placeholder*="Amount"]',
      buyBtn: 'button:has-text("Buy")',
      sellBtn: 'button:has-text("Sell")',
      confirmBtn: 'button:has-text("Confirm")',
    }
  },
  {
    id: 'okx',
    name: 'OKX',
    loginUrl: 'https://www.okx.com/login',
    tradingUrl: 'https://www.okx.com/trade-spot',
    selectors: {
      email: 'input[name="email"]',
      password: 'input[type="password"]',
      submit: 'button:has-text("Login")',
      pairInput: 'input[placeholder*="Search"]',
      amountInput: 'input[placeholder*="Amount"]',
      buyBtn: '.buy-btn',
      sellBtn: '.sell-btn',
      confirmBtn: 'button:has-text("Trade")',
    }
  },
]

export class PlaywrightTrader {
  private browser: Browser | null = null
  private page: Page | null = null
  private platform: PlatformConfig
  
  constructor(platformId: string) {
    const config = PLATFORMS.find(p => p.id === platformId)
    if (!config) throw new Error(`Platform ${platformId} not supported`)
    this.platform = config
  }
  
  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    })
    this.page = await this.browser.newPage()
    await this.page.setViewportSize({ width: 1920, height: 1080 })
  }
  
  async login(credentials: PlatformCredentials): Promise<boolean> {
    if (!this.page) throw new Error('Browser not initialized')
    
    await this.page.goto(this.platform.loginUrl)
    await this.page.waitForLoadState('networkidle')
    
    const s = this.platform.selectors
    
    if (s.email && s.password) {
      await this.page.fill(s.email, credentials.email || '')
      await this.page.fill(s.password, credentials.password || '')
      await this.page.click(s.submit!)
      await this.page.waitForTimeout(3000)
      
      const isLoggedIn = !(await this.page.isVisible(s.email))
      return isLoggedIn
    }
    
    return false
  }
  
  async executeTrade(
    signal: Signal,
    _credentials: PlatformCredentials
  ): Promise<{ success: boolean; orderId?: string; error?: string }> {
    if (!this.page) throw new Error('Browser not initialized')
    
    try {
      await this.page.goto(this.platform.tradingUrl)
      await this.page.waitForLoadState('networkidle')
      
      const s = this.platform.selectors
      
      await this.page.fill(s.pairInput!, signal.pair)
      await this.page.keyboard.press('Enter')
      await this.page.waitForTimeout(1000)
      
      const amount = (signal.entry * 0.01).toFixed(4)
      await this.page.fill(s.amountInput!, amount)
      
      if (s.leverageSelect && signal.tp1 && signal.sl) {
        const leverage = Math.min(50, Math.max(1, Math.floor((signal.tp1 - signal.entry) / (signal.entry - signal.sl) * 10)))
        try {
          await this.page.selectOption(s.leverageSelect, String(leverage))
        } catch {}
      }
      
      const btn = signal.direction === 'long' ? s.buyBtn : s.sellBtn
      await this.page.click(btn!)
      await this.page.waitForTimeout(500)
      
      await this.page.click(s.confirmBtn!)
      await this.page.waitForTimeout(2000)
      
      return { success: true, orderId: `pw_${Date.now()}` }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
  
  async closePosition(trade: Trade): Promise<{ success: boolean; error?: string }> {
    if (!this.page) throw new Error('Browser not initialized')
    
    try {
      await this.page.goto(this.platform.tradingUrl)
      await this.page.waitForLoadState('networkidle')
      
      const s = this.platform.selectors
      const closeBtn = trade.direction === 'long' ? s.sellBtn : s.buyBtn
      
      await this.page.click(closeBtn!)
      await this.page.waitForTimeout(500)
      await this.page.click(s.confirmBtn!)
      await this.page.waitForTimeout(2000)
      
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
  
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }
  }
}

export async function autoSetupPlatform(platformId: string, _userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'): Promise<PlaywrightTrader> {
  const trader = new PlaywrightTrader(platformId)
  await trader.initialize()
  return trader
}

export default PlaywrightTrader