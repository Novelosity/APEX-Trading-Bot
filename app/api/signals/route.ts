export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getSignals } from '@/lib/storage'

export async function GET() {
  try {
    const session = await requireSession()
    const signals = await getSignals(session.userId, 10)

    return NextResponse.json({
      success: true,
      data: signals,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch signals'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
