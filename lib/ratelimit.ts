// Simple sliding-window rate limiter backed by in-memory map
// Uses KV in production for cross-instance consistency

const memRl = new Map<string, { count: number; windowStart: number }>()

async function rlGet(key: string) {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv')
      return await kv.get<{ count: number; windowStart: number }>(key)
    }
  } catch { /* fall through */ }
  return memRl.get(key) ?? null
}

async function rlSet(key: string, value: { count: number; windowStart: number }, ttlSeconds: number) {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv')
      await kv.set(key, value, { ex: ttlSeconds })
      return
    }
  } catch { /* fall through */ }
  memRl.set(key, value)
  // Clean up after TTL in memory mode
  setTimeout(() => memRl.delete(key), ttlSeconds * 1000)
}

export async function rateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = `rl:${identifier}`
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  const current = await rlGet(key)

  if (!current || now - current.windowStart > windowMs) {
    // New window
    await rlSet(key, { count: 1, windowStart: now }, windowSeconds)
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.windowStart + windowMs }
  }

  await rlSet(key, { count: current.count + 1, windowStart: current.windowStart }, windowSeconds)
  return {
    allowed: true,
    remaining: limit - current.count - 1,
    resetAt: current.windowStart + windowMs,
  }
}
