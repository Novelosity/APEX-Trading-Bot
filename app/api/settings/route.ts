export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getUser, updateUser } from '@/lib/storage'

export async function GET() {
  try {
    const session = await requireSession()
    const user = await getUser(session.userId)

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Don't return encrypted keys in full
    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        exchange: user.exchange,
        tradingMode: user.tradingMode,
        execMode: user.execMode,
        leverage: user.leverage,
        balancePct: user.balancePct,
        riskPct: user.riskPct,
        maxPositions: user.maxPositions,
        hasApiKey: !!user.apiKeyEnc,
        hasPassphrase: !!user.apiPassphraseEnc,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch settings'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession()
    const body = await request.json()

    const allowedFields = ['execMode', 'leverage', 'balancePct', 'riskPct', 'maxPositions', 'tradingMode']
    const update: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        update[field] = body[field]
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 })
    }

    const updated = await updateUser(session.userId, update)

    if (!updated) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        execMode: updated.execMode,
        leverage: updated.leverage,
        balancePct: updated.balancePct,
        riskPct: updated.riskPct,
        maxPositions: updated.maxPositions,
        tradingMode: updated.tradingMode,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update settings'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
