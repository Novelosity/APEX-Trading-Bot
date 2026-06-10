export const runtime = 'nodejs'

/**
 * Migration endpoint: lets existing API-key users attach an email+password
 * to their account without losing trade history or settings.
 */

import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/crypto'
import { hashPassword } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import { getAllUsers, updateUser } from '@/lib/storage'
import { getSession } from '@/lib/session'
import { z } from 'zod'
import { parseBody } from '@/lib/validation'

const ClaimSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  exchange: z.string().min(1),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const rl = await rateLimit(`claim:${ip}`, 5, 900)
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Too many attempts.' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const parsed = parseBody(ClaimSchema, body)
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    }

    const { email, password, exchange, apiKey, apiSecret } = parsed.data
    const delay = new Promise((r) => setTimeout(r, 400))

    const users = await getAllUsers()

    let matchedUser = null
    for (const user of users) {
      if (user.exchange !== exchange) continue
      try {
        const decKey = decrypt(user.apiKeyEnc)
        const decSecret = decrypt(user.apiSecretEnc)
        if (decKey === apiKey.trim() && decSecret === apiSecret.trim()) {
          matchedUser = user
          break
        }
      } catch { /* skip */ }
    }

    await delay

    if (!matchedUser) {
      return NextResponse.json(
        { success: false, error: 'No account found with those credentials.' },
        { status: 404 }
      )
    }

    if (matchedUser.passwordHash) {
      return NextResponse.json(
        { success: false, error: 'This account already has a password. Use the login page.' },
        { status: 409 }
      )
    }

    // Check email not already taken
    const emailLower = email.toLowerCase()
    const emailTaken = users.find((u) => u.email?.toLowerCase() === emailLower && u.id !== matchedUser!.id)
    if (emailTaken) {
      return NextResponse.json({ success: false, error: 'Email already in use.' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    await updateUser(matchedUser.id, { email: emailLower, passwordHash })

    const session = await getSession()
    session.userId = matchedUser.id
    session.exchange = matchedUser.exchange
    session.email = emailLower
    session.isSetup = true
    await session.save()

    return NextResponse.json({ success: true, data: { userId: matchedUser.id } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Claim failed'
    console.error('Claim error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
