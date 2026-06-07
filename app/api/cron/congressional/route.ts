export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { decrypt } from '@/lib/crypto'
import {
  getAllUsers,
  getCongressConfig,
  saveDisclosure,
  getRecentDisclosures,
  saveMirrorPosition,
  getOpenMirrorPositions,
  updateMirrorPosition,
} from '@/lib/storage'
import type { CongressionalDisclosure, MirrorPosition } from '@/lib/types'

// High-value committee keywords
const HIGH_VALUE_COMMITTEES = [
  'appropriations',
  'armed services',
  'energy',
  'financial services',
  'technology',
  'science',
  'intelligence',
  'commerce',
]

interface CapitolTradeItem {
  id?: string
  txDate?: string
  disclosureDate?: string
  politician?: { name?: string; party?: string; state?: string }
  committees?: string[]
  asset?: { assetTicker?: string; assetName?: string; assetType?: string }
  txType?: string
  amount?: { min?: number; max?: number }
}

// ─── Fetch Disclosures ────────────────────────────────────────────────────────

async function fetchCapitolTrades(): Promise<CongressionalDisclosure[]> {
  try {
    const url = 'https://www.capitoltrades.com/api/trades?pageSize=50&txType=purchase'
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; APEX-Bot/1.0)',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) throw new Error(`Capitol Trades returned ${res.status}`)
    const json = await res.json()
    const items: CapitolTradeItem[] = json.data || json.trades || []

    const now = new Date()
    const disclosures: CongressionalDisclosure[] = []

    for (const item of items) {
      const ticker = item.asset?.assetTicker?.trim().toUpperCase()
      const assetType = item.asset?.assetType?.toLowerCase() || ''

      // Skip ETFs, index funds, non-stocks
      if (!ticker || assetType.includes('etf') || assetType.includes('fund')) continue

      const tradeDate = item.txDate ? new Date(item.txDate) : null
      const discDate = item.disclosureDate ? new Date(item.disclosureDate) : null
      if (!tradeDate || !discDate) continue

      const disclosureDelay = Math.round(
        (discDate.getTime() - tradeDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const daysSinceFetch = Math.round(
        (now.getTime() - discDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Only within last 30 days
      if (daysSinceFetch > 30) continue

      const tradeType = (item.txType || '').toLowerCase().includes('purchase') ? 'buy' : 'sell'
      const committees = (item.committees || []).map((c: string) => c.toLowerCase())
      const _valueMin = item.amount?.min || 0

      // Compute signal strength
      const hasHighValueCommittee = committees.some((c) =>
        HIGH_VALUE_COMMITTEES.some((hv) => c.includes(hv))
      )
      let strength: 1 | 2 | 3 | 4 | 5 = 2
      if (disclosureDelay <= 20 && hasHighValueCommittee) strength = 5
      else if (disclosureDelay <= 30 && hasHighValueCommittee) strength = 4
      else if (hasHighValueCommittee) strength = 4
      else if (disclosureDelay <= 20) strength = 3
      else strength = 2

      disclosures.push({
        id: item.id || randomUUID(),
        politician: item.politician?.name || 'Unknown',
        party: item.politician?.party?.charAt(0) || 'I',
        state: item.politician?.state || '',
        committees: item.committees || [],
        ticker,
        company: item.asset?.assetName || ticker,
        tradeType,
        tradeDate: item.txDate || '',
        disclosureDate: item.disclosureDate || '',
        disclosureDelay,
        estimatedValueMin: item.amount?.min || 0,
        estimatedValueMax: item.amount?.max || 0,
        signalStrength: strength,
        fetchedAt: now.toISOString(),
      })
    }

    return disclosures
  } catch (err) {
    console.error('[Congressional] Capitol Trades fetch failed:', err)
    return []
  }
}

// ─── Score & Rank Politicians ──────────────────────────────────────────────────

function rankPoliticians(disclosures: CongressionalDisclosure[]) {
  const map = new Map<string, { disclosures: CongressionalDisclosure[]; committees: string[] }>()

  for (const d of disclosures) {
    if (!map.has(d.politician)) {
      map.set(d.politician, { disclosures: [], committees: d.committees })
    }
    map.get(d.politician)!.disclosures.push(d)
  }

  const scores: Array<{ name: string; score: number; buyCount: number; committees: string[] }> = []

  for (const [name, data] of map.entries()) {
    const buys = data.disclosures.filter((d) => d.tradeType === 'buy')
    if (buys.length < 1) continue

    const hasHighCommittee = data.committees.some((c) =>
      HIGH_VALUE_COMMITTEES.some((hv) => c.toLowerCase().includes(hv))
    )

    // Simple score: avg signal strength * 0.5 + frequency rank * 0.3 + committee bonus * 0.2
    const avgStrength = buys.reduce((s, d) => s + d.signalStrength, 0) / buys.length
    const freqScore = Math.min(buys.length / 5, 1) * 100
    const committeeBonus = hasHighCommittee ? 1.25 : 1

    const score = (avgStrength * 20 * 0.5 + freqScore * 0.3) * committeeBonus

    scores.push({ name, score, buyCount: buys.length, committees: data.committees })
  }

  return scores.sort((a, b) => b.score - a.score).slice(0, 10)
}

// ─── Alpaca API ───────────────────────────────────────────────────────────────

interface AlpacaAccount {
  portfolio_value: string
}

interface AlpacaTrade {
  p: number
}

async function getAlpacaAccount(apiKey: string, secret: string, baseUrl: string): Promise<AlpacaAccount> {
  const res = await fetch(`${baseUrl}/v2/account`, {
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secret,
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Alpaca account fetch failed: ${res.status}`)
  return res.json()
}

async function getAlpacaPrice(ticker: string, apiKey: string, secret: string, baseUrl: string): Promise<number> {
  const dataBase = baseUrl.includes('paper')
    ? 'https://data.alpaca.markets'
    : 'https://data.alpaca.markets'

  const res = await fetch(`${dataBase}/v2/stocks/${ticker}/trades/latest`, {
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secret,
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Alpaca price fetch failed for ${ticker}: ${res.status}`)
  const data = await res.json()
  const trade: AlpacaTrade = data.trade
  return trade.p
}

async function submitAlpacaOrder(
  ticker: string,
  qty: number,
  apiKey: string,
  secret: string,
  baseUrl: string
): Promise<string> {
  const res = await fetch(`${baseUrl}/v2/orders`, {
    method: 'POST',
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      symbol: ticker,
      qty: String(qty),
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Alpaca order failed: ${err}`)
  }
  const order = await res.json()
  return order.id
}

async function sendTelegramAlert(botToken: string, chatId: string, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    // Non-fatal
  }
}

// ─── Monitor open positions for stop triggers ─────────────────────────────────

async function monitorMirrorPositions(
  positions: MirrorPosition[],
  apiKey: string,
  secret: string,
  baseUrl: string
) {
  for (const pos of positions) {
    try {
      const currentPrice = await getAlpacaPrice(pos.ticker, apiKey, secret, baseUrl)
      const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
      const pnlUsd = pnlPct * (pos.shares * pos.entryPrice) / 100

      let closeReason: MirrorPosition['closeReason'] | null = null

      // Stop loss check
      if (pnlPct <= -8) closeReason = 'stop_loss'

      // Trailing stop check
      if (!closeReason && pos.trailingStopActivated && pnlPct <= -12) {
        closeReason = 'trailing_stop'
      }

      // Time stop: 45 days
      const daysOpen = (Date.now() - new Date(pos.openedAt).getTime()) / (1000 * 60 * 60 * 24)
      if (!closeReason && daysOpen >= 45) closeReason = 'time_stop'

      const trailingStopActivated = pos.trailingStopActivated || pnlPct >= 15

      await updateMirrorPosition(pos.id, {
        currentPrice,
        pnlPct,
        pnlUsd,
        trailingStopActivated,
        ...(closeReason
          ? { status: 'closed', closedAt: new Date().toISOString(), closeReason }
          : {}),
      })
    } catch {
      // Skip position on error
    }
  }
}

// ─── Main Cron Handler ────────────────────────────────────────────────────────

export async function GET() {
  try {
    // Fetch new disclosures
    const fresh = await fetchCapitolTrades()

    // Save new disclosures
    for (const d of fresh) {
      await saveDisclosure(d)
    }

    // Process each user who has congressional module configured
    const users = await getAllUsers()
    const results: string[] = []

    for (const user of users) {
      const config = await getCongressConfig(user.id)
      if (!config.enabled || !config.alpacaApiKeyEnc || !config.alpacaSecretKeyEnc) continue

      let alpacaApiKey: string
      let alpacaSecret: string
      try {
        alpacaApiKey = decrypt(config.alpacaApiKeyEnc)
        alpacaSecret = decrypt(config.alpacaSecretKeyEnc)
      } catch {
        continue
      }

      const baseUrl =
        config.alpacaMode === 'live'
          ? 'https://api.alpaca.markets'
          : 'https://paper-api.alpaca.markets'

      // Monitor existing positions
      const openPositions = await getOpenMirrorPositions(user.id)
      await monitorMirrorPositions(openPositions, alpacaApiKey, alpacaSecret, baseUrl)

      // Check current allocation
      const currentOpenPositions = await getOpenMirrorPositions(user.id)
      const currentAllocation = currentOpenPositions.reduce((s, p) => s + p.allocationPct, 0)
      const remainingAllocation = config.maxAllocationPct - currentAllocation

      if (remainingAllocation <= 0) {
        results.push(`${user.id}: max allocation reached`)
        continue
      }

      // Get account value
      let portfolioValue: number
      try {
        const acct = await getAlpacaAccount(alpacaApiKey, alpacaSecret, baseUrl)
        portfolioValue = parseFloat(acct.portfolio_value)
      } catch {
        continue
      }

      // Get disclosures from last 24h of fetch
      const allDisclosures = await getRecentDisclosures(50)
      const recentDisclosures = allDisclosures.filter((d) => {
        const hoursAgo = (Date.now() - new Date(d.fetchedAt).getTime()) / 3600000
        return hoursAgo < 24 && d.tradeType === 'buy'
      })

      const topPoliticians = rankPoliticians(allDisclosures)
      const topNames = new Set(topPoliticians.slice(0, 10).map((p) => p.name))

      // Already open tickers
      const openTickers = new Set(currentOpenPositions.map((p) => p.ticker))

      const newTrades: string[] = []

      for (const d of recentDisclosures) {
        if (!topNames.has(d.politician)) continue
        if (d.disclosureDelay > config.maxDisclosureDelayDays) continue
        if (d.estimatedValueMin < config.minTradeValueUsd) continue
        if (openTickers.has(d.ticker)) continue
        if (remainingAllocation <= 0) break

        // Determine position size
        let positionPct = config.positionSizePct

        // Cluster: multiple politicians buying same ticker
        const clusterCount = recentDisclosures.filter(
          (x) => x.ticker === d.ticker && x.tradeType === 'buy'
        ).length
        if (clusterCount >= 3) positionPct = Math.min(positionPct * 1.6, 8)

        // Committee bonus
        const hasHighCommittee = d.committees.some((c) =>
          HIGH_VALUE_COMMITTEES.some((hv) => c.toLowerCase().includes(hv))
        )
        if (hasHighCommittee) positionPct = Math.min(positionPct * 1.5, 10)

        if (positionPct > remainingAllocation) positionPct = remainingAllocation

        try {
          const price = await getAlpacaPrice(d.ticker, alpacaApiKey, alpacaSecret, baseUrl)
          const allocationUsd = portfolioValue * (positionPct / 100)
          const shares = Math.floor(allocationUsd / price)
          if (shares < 1) continue

          const stopLoss = price * (1 - config.stopLossPct / 100)
          let alpacaOrderId: string | undefined

          // Only execute if enabled AND not paper-dry-run (paper mode still executes on paper)
          try {
            alpacaOrderId = await submitAlpacaOrder(d.ticker, shares, alpacaApiKey, alpacaSecret, baseUrl)
          } catch (orderErr) {
            console.error(`[Congressional] Order failed for ${d.ticker}:`, orderErr)
          }

          const position: MirrorPosition = {
            id: randomUUID(),
            userId: user.id,
            ticker: d.ticker,
            company: d.company,
            politician: d.politician,
            committees: d.committees,
            entryPrice: price,
            currentPrice: price,
            shares,
            allocationPct: positionPct,
            status: 'open',
            stopLoss,
            trailingStopActivated: false,
            signalStrength: d.signalStrength,
            disclosureId: d.id,
            alpacaOrderId,
            openedAt: new Date().toISOString(),
          }

          await saveMirrorPosition(position)
          openTickers.add(d.ticker)
          newTrades.push(`${d.ticker} (${shares} shares @ $${price.toFixed(2)})`)
        } catch {
          // Skip on price fetch error
        }
      }

      // Send Telegram daily brief
      if (config.telegramBotToken && config.telegramChatId) {
        const briefDate = new Date().toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        const openAfter = await getOpenMirrorPositions(user.id)

        let message = `📊 <b>APEX Congressional Daily Brief — ${briefDate}</b>\n\n`
        message += `🏛️ New Disclosures Fetched: <b>${fresh.length}</b>\n`
        message += `📈 New Mirror Trades: <b>${newTrades.length}</b>\n`
        if (newTrades.length > 0) {
          message += newTrades.map((t) => `  • ${t}`).join('\n') + '\n'
        }
        message += `\n💼 Active Mirror Positions: <b>${openAfter.length}</b>\n`
        message += `📊 Total Allocation: <b>${openAfter.reduce((s, p) => s + p.allocationPct, 0).toFixed(1)}%</b>\n`
        message += `\n⚡ Mode: <b>${config.alpacaMode.toUpperCase()}</b>`

        await sendTelegramAlert(config.telegramBotToken, config.telegramChatId, message)
      }

      results.push(`${user.id}: ${newTrades.length} new trades`)
    }

    return NextResponse.json({
      success: true,
      data: {
        disclosuresFetched: fresh.length,
        usersProcessed: results.length,
        results,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Congressional cron failed'
    console.error('[Congressional cron]', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
