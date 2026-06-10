import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import type { SessionData } from '@/lib/types'

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'fallback-dev-secret-32-chars-ok!',
  cookieName: 'apex_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
  },
}

const PROTECTED_PATHS = ['/dashboard', '/trades', '/settings', '/congressional', '/deposit']
const AUTH_PATHS = ['/onboard', '/login', '/register', '/claim']
const PUBLIC_PATHS = [
  '/',
  '/api/auth/setup',
  '/api/auth/logout',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/claim',
]

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Allow cron, static assets and public paths
  if (
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    PUBLIC_PATHS.includes(pathname)
  ) {
    return NextResponse.next()
  }

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))
  const isApiProtected = pathname.startsWith('/api/') && !PUBLIC_PATHS.includes(pathname)

  if (isProtected || isApiProtected) {
    try {
      const response = NextResponse.next()
      const session = await getIronSession<SessionData>(request, response, sessionOptions)

      if (!session.isSetup || !session.userId) {
        if (isProtected) {
          return NextResponse.redirect(new URL('/login', request.url))
        }
        return NextResponse.next()
      }
    } catch {
      if (isProtected) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }
  }

  // Redirect authenticated users away from auth pages
  if (AUTH_PATHS.includes(pathname)) {
    try {
      const response = NextResponse.next()
      const session = await getIronSession<SessionData>(request, response, sessionOptions)
      if (session.isSetup && session.userId) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    } catch { /* allow through */ }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
