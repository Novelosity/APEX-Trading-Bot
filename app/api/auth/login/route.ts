export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/auth'
import { LoginSchema, parseBody } from '@/lib/validation'
import { rateLimit } from '@/lib/ratelimit'
import { getUserByEmail } from '@/lib/storage'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  // Rate limit: 10 attempts per 10 minutes per IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const rl = await rateLimit(`login:${ip}`, 10, 600)
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  try {
    const body = await request.json()
    const parsed = parseBody(LoginSchema, body)
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    }

    const { email, password } = parsed.data

    // Timing-safe delay always runs to prevent user enumeration
    const delay = new Promise((r) => setTimeout(r, 300))

    const user = await getUserByEmail(email)

    await delay

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    const session = await getSession()
    session.userId = user.id
    session.exchange = user.exchange || ''
    session.email = user.email
    session.isSetup = true
    await session.save()

    return NextResponse.json({ success: true, data: { userId: user.id, hasExchange: !!user.exchange } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed'
    console.error('Login error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
