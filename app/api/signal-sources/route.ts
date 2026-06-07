export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getAllSignalSources, saveSignalSource } from '@/lib/storage'
import type { SignalSource } from '@/lib/types'

export async function GET() {
  try {
    const sources = await getAllSignalSources()

    if (sources.length === 0) {
      const defaultSources: SignalSource[] = [
        {
          id: 'binance_funding',
          name: 'Binance Funding Rates',
          url: 'https://api.binance.com/fapi/v1/fundingRate',
          type: 'funding_rate',
          enabled: true,
          priority: 1,
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'whale_alert',
          name: 'Whale Alert',
          url: 'https://api.whale-alert.io/v2/transactions',
          type: 'whale',
          enabled: true,
          priority: 2,
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'open_interest',
          name: 'Open Interest',
          url: 'https://api.binance.com/fapi/v1/openInterest',
          type: 'open_interest',
          enabled: true,
          priority: 3,
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'social_sentiment',
          name: 'Social Sentiment',
          url: 'https://api.lunarcrush.com/v2',
          type: 'social',
          enabled: true,
          priority: 4,
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'sentiment',
          name: 'Sentiment Analysis',
          url: 'https://api.lunarcrush.com/v2',
          type: 'sentiment',
          enabled: false,
          priority: 5,
          updatedAt: new Date().toISOString(),
        },
      ]

      for (const source of defaultSources) {
        await saveSignalSource(source)
      }

      return NextResponse.json({
        success: true,
        data: defaultSources,
        initialized: true,
      })
    }

    return NextResponse.json({
      success: true,
      data: sources,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch signal sources'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, url, type, enabled = true, priority = 5 } = body

    if (!name || !url || !type) {
      return NextResponse.json(
        { success: false, error: 'name, url, and type are required' },
        { status: 400 }
      )
    }

    const validTypes = ['api', 'web_scrape', 'websocket', 'funding_rate', 'whale', 'open_interest', 'orderbook', 'social', 'sentiment'] as const
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const source: SignalSource = {
      id: randomUUID(),
      name,
      url,
      type,
      enabled,
      priority,
      updatedAt: new Date().toISOString(),
    }

    await saveSignalSource(source)

    return NextResponse.json({
      success: true,
      data: source,
    }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add signal source'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}