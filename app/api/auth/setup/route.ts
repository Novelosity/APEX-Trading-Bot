export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { encrypt } from '@/lib/crypto'
import { saveUser } from '@/lib/storage'
import { getSession } from '@/lib/session'
import type { User } from '@/lib/types'
import { ExchangeClient } from '@/lib/exchange'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { exchange, apiKey, apiSecret, apiPassphrase, tradingMode, leverage } = body

    if (!exchange || !apiKey || !apiSecret) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const userId = randomUUID()

    // Encrypt API keys
    const apiKeyEnc = encrypt(apiKey)
    const apiSecretEnc = encrypt(apiSecret)
    const apiPassphraseEnc = apiPassphrase ? encrypt(apiPassphrase) : undefined

    // Create temporary user to validate connection
    const tempUser: User = {
      id: userId,
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

    // Validate by fetching balance
    const client = new ExchangeClient(tempUser)
    const balance = await client.fetchBalance()

    if (balance.total < 0) {
      return NextResponse.json({ success: false, error: 'Could not fetch balance — check API keys' }, { status: 400 })
    }

    // Save user
    await saveUser(tempUser)

    // Set session
    const session = await getSession()
    session.userId = userId
    session.exchange = exchange
    session.isSetup = true
    await session.save()

    return NextResponse.json({
      success: true,
      data: {
        userId,
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
