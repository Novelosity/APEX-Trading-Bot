export const runtime = 'nodejs'
export const preferredRegion = 'fra1'

import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getUser, saveUser } from '@/lib/storage'
import { ExchangeClient } from '@/lib/exchange'

export async function GET() {
  try {
    const session = await requireSession()
    let user = await getUser(session.userId)

    if (!user) {
      if (session.exchange) {
        user = {
          id: session.userId,
          exchange: session.exchange,
          apiKeyEnc: '',
          apiSecretEnc: '',
          tradingMode: session.tradingMode || 'spot',
          execMode: 'manual',
          leverage: session.leverage || 1,
          balancePct: 100,
          riskPct: 1,
          maxPositions: 5,
          paperMode: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await saveUser(user)
      } else {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
      }
    }

    const client = new ExchangeClient(user)
    const balance = await client.fetchBalance()

    return NextResponse.json({
      success: true,
      exchange: session.exchange,
      data: {
        total: balance.total,
        free: balance.free,
        used: balance.used,
        currency: 'USDT',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch balance'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
