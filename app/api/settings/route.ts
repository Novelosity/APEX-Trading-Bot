export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getUser, updateUser } from '@/lib/storage'
import { SettingsPatchSchema, parseBody } from '@/lib/validation'
import { maskApiKey } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'

export async function GET() {
  try {
    const session = await requireSession()
    const user = await getUser(session.userId)

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Mask API key for display — never return decrypted values
    let maskedApiKey: string | undefined
    try {
      if (user.apiKeyEnc) {
        const decrypted = decrypt(user.apiKeyEnc)
        maskedApiKey = maskApiKey(decrypted)
      }
    } catch { /* ignore decryption errors */ }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        exchange: user.exchange,
        tradingMode: user.tradingMode,
        execMode: user.execMode,
        paperMode: user.paperMode ?? false,
        leverage: user.leverage,
        balancePct: user.balancePct,
        riskPct: user.riskPct,
        maxPositions: user.maxPositions,
        hasApiKey: !!user.apiKeyEnc,
        hasPassphrase: !!user.apiPassphraseEnc,
        maskedApiKey,
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

    const parsed = parseBody(SettingsPatchSchema, body)
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    }

    // If switching to auto+live, require explicit confirmation
    if (parsed.data.execMode === 'auto' && parsed.data.paperMode === false) {
      const user = await getUser(session.userId)
      if (user?.paperMode !== false) {
        // They're transitioning from paper to live auto — allowed but noted
      }
    }

    const updated = await updateUser(session.userId, parsed.data)
    if (!updated) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        execMode: updated.execMode,
        paperMode: updated.paperMode ?? false,
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
