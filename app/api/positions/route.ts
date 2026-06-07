export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getOpenTrades } from '@/lib/storage'

export async function GET() {
  try {
    const session = await requireSession()
    const trades = await getOpenTrades(session.userId)

    return NextResponse.json({
      success: true,
      data: trades,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch positions'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
