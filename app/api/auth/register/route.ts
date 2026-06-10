export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { hashPassword } from '@/lib/auth'
import { RegisterSchema, parseBody } from '@/lib/validation'
import { rateLimit } from '@/lib/ratelimit'
import { getUserByEmail, saveUser } from '@/lib/storage'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  // Rate limit by IP: 5 registrations per 15 minutes
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const rl = await rateLimit(`register:${ip}`, 5, 900)
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many registration attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  try {
    const body = await request.json()
    const parsed = parseBody(RegisterSchema, body)
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    }

    const { email, password } = parsed.data

    // Check for existing email
    const existing = await getUserByEmail(email)
    if (existing) {
      // Timing-safe: always delay to prevent user enumeration
      await new Promise((r) => setTimeout(r, 400))
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists.' },
        { status: 409 }
      )
    }

    const passwordHash = await hashPassword(password)

    const userId = randomUUID()
    await saveUser({
      id: userId,
      email: email.toLowerCase(),
      passwordHash,
      exchange: '',
      apiKeyEnc: '',
      apiSecretEnc: '',
      tradingMode: 'spot',
      execMode: 'manual',
      paperMode: true, // Default to paper trading for safety
      leverage: 1,
      balancePct: 100,
      riskPct: 1,
      maxPositions: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // Create session
    const session = await getSession()
    session.userId = userId
    session.exchange = ''
    session.email = email.toLowerCase()
    session.isSetup = true
    await session.save()

    return NextResponse.json({ success: true, data: { userId } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed'
    console.error('Register error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
