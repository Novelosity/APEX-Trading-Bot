export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function POST() {
  try {
    const session = await getSession()
    session.destroy()
    await session.save()
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Logout failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
