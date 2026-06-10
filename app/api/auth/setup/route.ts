export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { encrypt } from '@/lib/crypto'
import { updateUser } from '@/lib/storage'
import { getSession, requireSession } from '@/lib/session'
import { ExchangeClient } from '@/lib/exchange'
import type { User } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    // Require existing session (account must exist before connecting exchange)
    const session = await requireSession()

    const body = await request.json()
    const { exchange, apiKey, apiSecret, apiPassphrase, tradingMode, leverage } = body

    if (!exchange || !apiKey || !apiSecret) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    if (typeof apiKey !== 'string' || apiKey.length > 512) {
      return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 400 })
    }
    if (typeof apiSecret !== 'string' || apiSecret.length > 512) {
      return NextResponse.json({ success: false, error: 'Invalid API secret' }, { status: 400 })
    }

    const apiKeyEnc = encrypt(apiKey.trim())
    const apiSecretEnc = encrypt(apiSecret.trim())
    const apiPassphraseEnc = apiPassphrase ? encrypt(apiPassphrase.trim()) : undefined

    // Validate by fetching balance using a temp user object
    const tempUser: User = {
      id: session.userId,
      exchange,
      apiKeyEnc,
      apiSecretEnc,
      ...(apiPassphraseEnc ? { apiPassphraseEnc } : {}),
      tradingMode: tradingMode || 'spot',
      execMode: 'manual',
      leverage: leverage || 1,
      balancePct: 100,
      riskPct: 1,
      maxPositions: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const client = new ExchangeClient(tempUser)
    const balance = await client.fetchBalance()

    if (balance.total < 0) {
      return NextResponse.json(
        { success: false, error: 'Could not fetch balance — check your API keys and permissions.' },
        { status: 400 }
      )
    }

    // Update the existing user with exchange credentials
    await updateUser(session.userId, {
      exchange,
      apiKeyEnc,
      apiSecretEnc,
      ...(apiPassphraseEnc ? { apiPassphraseEnc } : {}),
      tradingMode: tradingMode || 'spot',
      leverage: leverage || 1,
    })

    // Update session exchange
    const updatedSession = await getSession()
    updatedSession.exchange = exchange
    await updatedSession.save()

    return NextResponse.json({
      success: true,
      data: {
        exchange,
        balance: balance.free,
        currency: 'USDT',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Setup failed'
    console.error('Setup error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
