export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getBotState, updateBotState } from '@/lib/storage'
import { KillSwitchSchema, parseBody } from '@/lib/validation'

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession()
    const body = await request.json()

    const parsed = parseBody(KillSwitchSchema, body)
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    }

    const { action, reason } = parsed.data
    const botState = await getBotState(session.userId)

    if (action === 'halt') {
      await updateBotState(session.userId, {
        tradingHalted: true,
        haltReason: reason || 'Emergency kill switch activated manually',
        killSwitchAt: new Date().toISOString(),
      })
      return NextResponse.json({
        success: true,
        data: { tradingHalted: true, haltReason: reason || 'Emergency kill switch activated manually' },
      })
    }

    if (action === 'resume') {
      await updateBotState(session.userId, {
        tradingHalted: false,
        haltReason: undefined,
      })
      return NextResponse.json({
        success: true,
        data: { tradingHalted: false, haltReason: null },
      })
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kill switch failed'
    console.error('Kill switch error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const session = await requireSession()
    const botState = await getBotState(session.userId)
    return NextResponse.json({
      success: true,
      data: {
        tradingHalted: botState.tradingHalted,
        haltReason: botState.haltReason,
        killSwitchAt: botState.killSwitchAt,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get kill switch state'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
