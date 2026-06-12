export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getUser, updateUser, saveUser } from '@/lib/storage'
import { SettingsPatchSchema, parseBody } from '@/lib/validation'
import { maskApiKey } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'

export async function GET() {
  try {
    const session = await requireSession()
    let user = await getUser(session.userId)

if (!user) {
       if (session.exchange) {
         // Return defaults without writing to KV — prevents overwriting real settings
         // if KV had a transient read failure. User is created on first PATCH (save).
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
       } else {
         return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
       }
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
      if (user && user.paperMode !== false) {
        // They're transitioning from paper to live auto — allowed but noted
        console.log(`User ${session.userId} transitioning from paper to live auto mode`)
      }
    }

    let updated = await updateUser(session.userId, parsed.data)
    if (!updated) {
      if (session.exchange) {
        // updateUser returned null — either a transient KV read failure or a truly new user.
        // Retry getUser before creating with defaults to avoid resetting real settings.
        const retryUser = await getUser(session.userId)
        if (retryUser) {
          // User exists — transient issue on first read. Merge and save properly.
          const merged = { ...retryUser, ...parsed.data, updatedAt: new Date().toISOString() }
          await saveUser(merged)
          updated = merged
        } else {
          // Truly new user — create with provided values, falling back to safe defaults.
          // Use parsed.data.leverage (not session.leverage) so leverage changes are respected.
          const newUser = {
            id: session.userId,
            exchange: session.exchange,
            apiKeyEnc: '',
            apiSecretEnc: '',
            tradingMode: session.tradingMode || 'spot',
            execMode: parsed.data.execMode ?? 'manual',
            leverage: parsed.data.leverage ?? session.leverage ?? 1,
            balancePct: parsed.data.balancePct ?? 100,
            riskPct: parsed.data.riskPct ?? 1,
            maxPositions: parsed.data.maxPositions ?? 5,
            paperMode: parsed.data.paperMode ?? true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          await saveUser(newUser)
          updated = newUser
        }
      } else {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
      }
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
