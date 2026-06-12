import { getIronSession, IronSession, SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'
import { createHash } from 'crypto'
import type { SessionData } from './types'

// Iron-session requires the password to be at least 32 characters.
// Hash the secret so any length value works (SHA-256 hex = 64 chars).
function getSessionPassword(): string {
  const raw = process.env.SESSION_SECRET || 'fallback-dev-secret-32-chars-ok!'
  if (raw.length >= 32) return raw
  return createHash('sha256').update(raw).digest('hex')
}

export const sessionOptions: SessionOptions = {
  password: getSessionPassword(),
  cookieName: 'apex_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
  return session
}

export async function requireSession(): Promise<IronSession<SessionData>> {
  const session = await getSession()
  if (!session.isSetup || !session.userId) {
    throw new Error('Not authenticated')
  }
  return session
}
