import type { User, Trade, Signal, BotState, CongressionalDisclosure, MirrorPosition, CongressionalModuleConfig, SignalSource, ExternalSignal } from './types'

// In-memory fallback for local dev when KV is not available
const memStore = new Map<string, string>()

async function kvGet(key: string): Promise<string | null> {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv')
      const val = await kv.get<string>(key)
      return val ?? null
    }
  } catch {
    // fall through to memStore
  }
  return memStore.get(key) ?? null
}

async function kvSet(key: string, value: string): Promise<void> {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv')
      await kv.set(key, value)
      return
    }
  } catch {
    // fall through to memStore
  }
  memStore.set(key, value)
}

async function kvSadd(key: string, member: string): Promise<void> {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv')
      await kv.sadd(key, member)
      return
    }
  } catch {
    // fall through to memStore set simulation
  }
  const existing = memStore.get(key)
  const set: string[] = existing ? JSON.parse(existing) : []
  if (!set.includes(member)) {
    set.push(member)
  }
  memStore.set(key, JSON.stringify(set))
}

async function kvSmembers(key: string): Promise<string[]> {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv')
      const members = await kv.smembers(key)
      return members ?? []
    }
  } catch {
    // fall through
  }
  const existing = memStore.get(key)
  return existing ? JSON.parse(existing) : []
}

async function kvLpush(key: string, value: string): Promise<void> {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv')
      await kv.lpush(key, value)
      return
    }
  } catch {
    // fall through
  }
  const existing = memStore.get(key)
  const list: string[] = existing ? JSON.parse(existing) : []
  list.unshift(value)
  memStore.set(key, JSON.stringify(list))
}

async function kvLrange(key: string, start: number, end: number): Promise<string[]> {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv')
      const items = await kv.lrange<string>(key, start, end)
      return items ?? []
    }
  } catch {
    // fall through
  }
  const existing = memStore.get(key)
  if (!existing) return []
  const list: string[] = JSON.parse(existing)
  const actualEnd = end === -1 ? list.length : end + 1
  return list.slice(start, actualEnd)
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function saveUser(user: User): Promise<void> {
  await kvSet(`user:${user.id}`, JSON.stringify(user))
  await kvSadd('users', user.id)
}

export async function getUser(userId: string): Promise<User | null> {
  const data = await kvGet(`user:${userId}`)
  return data ? JSON.parse(data) : null
}

export async function getAllUsers(): Promise<User[]> {
  const ids = await kvSmembers('users')
  const users = await Promise.all(ids.map((id) => getUser(id)))
  return users.filter(Boolean) as User[]
}

export async function updateUser(userId: string, update: Partial<User>): Promise<User | null> {
  const user = await getUser(userId)
  if (!user) return null
  const updated = { ...user, ...update, updatedAt: new Date().toISOString() }
  await saveUser(updated)
  return updated
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export async function saveTrade(trade: Trade): Promise<void> {
  await kvSet(`trade:${trade.id}`, JSON.stringify(trade))
  await kvLpush(`trades:${trade.userId}`, trade.id)
  if (trade.status === 'open') {
    await kvSadd(`open_trades:${trade.userId}`, trade.id)
  }
  await kvSadd('all_open_trades', `${trade.userId}:${trade.id}`)
}

export async function updateTrade(id: string, userId: string, update: Partial<Trade>): Promise<Trade | null> {
  const data = await kvGet(`trade:${id}`)
  if (!data) return null
  const trade: Trade = JSON.parse(data)
  const updated = { ...trade, ...update }
  await kvSet(`trade:${id}`, JSON.stringify(updated))

  // If closed, we don't need to track in open sets (they'll just not be found)
  return updated
}

export async function getTrade(id: string): Promise<Trade | null> {
  const data = await kvGet(`trade:${id}`)
  return data ? JSON.parse(data) : null
}

export async function getOpenTrades(userId: string): Promise<Trade[]> {
  const ids = await kvSmembers(`open_trades:${userId}`)
  const trades = await Promise.all(ids.map((id) => getTrade(id)))
  return (trades.filter(Boolean) as Trade[]).filter((t) => t.status === 'open')
}

export async function getAllOpenTrades(): Promise<Trade[]> {
  const entries = await kvSmembers('all_open_trades')
  const tradeIds = entries.map((e) => e.split(':')[1]).filter(Boolean)
  const trades = await Promise.all(tradeIds.map((id) => getTrade(id)))
  return (trades.filter(Boolean) as Trade[]).filter((t) => t.status === 'open')
}

export async function getTrades(userId: string, limit = 50): Promise<Trade[]> {
  const ids = await kvLrange(`trades:${userId}`, 0, limit - 1)
  const trades = await Promise.all(ids.map((id) => getTrade(id)))
  return trades.filter(Boolean) as Trade[]
}

// ─── Signals ──────────────────────────────────────────────────────────────────

export async function saveSignal(signal: Signal): Promise<void> {
  await kvSet(`signal:${signal.id}`, JSON.stringify(signal))
  await kvLpush(`signals:${signal.userId}`, signal.id)
}

export async function getSignal(id: string): Promise<Signal | null> {
  const data = await kvGet(`signal:${id}`)
  return data ? JSON.parse(data) : null
}

export async function getSignals(userId: string, limit = 20): Promise<Signal[]> {
  const ids = await kvLrange(`signals:${userId}`, 0, limit - 1)
  const signals = await Promise.all(ids.map((id) => getSignal(id)))
  return signals.filter(Boolean) as Signal[]
}

export async function markSignalExecuted(id: string, tradeId: string): Promise<void> {
  const data = await kvGet(`signal:${id}`)
  if (!data) return
  const signal: Signal = JSON.parse(data)
  signal.executed = true
  signal.executedTradeId = tradeId
  await kvSet(`signal:${id}`, JSON.stringify(signal))
}

// ─── Bot State ────────────────────────────────────────────────────────────────

const defaultBotState = (userId: string): BotState => ({
  userId,
  dailyPnl: 0,
  weeklyPnl: 0,
  tradingHalted: false,
  consecutiveLosses: 0,
  totalTrades: 0,
  winCount: 0,
  lossCount: 0,
})

export async function getBotState(userId: string): Promise<BotState> {
  const data = await kvGet(`botstate:${userId}`)
  return data ? JSON.parse(data) : defaultBotState(userId)
}

export async function updateBotState(userId: string, update: Partial<BotState>): Promise<BotState> {
  const current = await getBotState(userId)
  const updated = { ...current, ...update }
  await kvSet(`botstate:${userId}`, JSON.stringify(updated))
  return updated
}

// ─── Congressional Module ─────────────────────────────────────────────────────

const defaultCongressConfig = (userId: string): CongressionalModuleConfig => ({
  userId,
  enabled: false,
  alpacaMode: 'paper',
  maxAllocationPct: 30,
  positionSizePct: 5,
  stopLossPct: 8,
  trailingStopPct: 12,
  trailingStopTriggerPct: 15,
  maxDisclosureDelayDays: 45,
  minTradeValueUsd: 15000,
  updatedAt: new Date().toISOString(),
})

export async function getCongressConfig(userId: string): Promise<CongressionalModuleConfig> {
  const data = await kvGet(`congress_config:${userId}`)
  return data ? JSON.parse(data) : defaultCongressConfig(userId)
}

export async function saveCongressConfig(config: CongressionalModuleConfig): Promise<void> {
  await kvSet(`congress_config:${config.userId}`, JSON.stringify(config))
}

export async function saveDisclosure(disclosure: CongressionalDisclosure): Promise<void> {
  await kvSet(`disclosure:${disclosure.id}`, JSON.stringify(disclosure))
  await kvSadd('all_disclosures', disclosure.id)
}

export async function getDisclosure(id: string): Promise<CongressionalDisclosure | null> {
  const data = await kvGet(`disclosure:${id}`)
  return data ? JSON.parse(data) : null
}

export async function getRecentDisclosures(limit = 50): Promise<CongressionalDisclosure[]> {
  const ids = await kvSmembers('all_disclosures')
  const all = await Promise.all(ids.map((id) => getDisclosure(id)))
  const valid = all.filter(Boolean) as CongressionalDisclosure[]
  // Sort by fetchedAt desc
  return valid
    .sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())
    .slice(0, limit)
}

export async function saveMirrorPosition(pos: MirrorPosition): Promise<void> {
  await kvSet(`mirror:${pos.id}`, JSON.stringify(pos))
  await kvSadd(`user_mirrors:${pos.userId}`, pos.id)
  if (pos.status === 'open') {
    await kvSadd(`open_mirrors:${pos.userId}`, pos.id)
  }
}

export async function getMirrorPosition(id: string): Promise<MirrorPosition | null> {
  const data = await kvGet(`mirror:${id}`)
  return data ? JSON.parse(data) : null
}

export async function updateMirrorPosition(id: string, update: Partial<MirrorPosition>): Promise<MirrorPosition | null> {
  const data = await kvGet(`mirror:${id}`)
  if (!data) return null
  const pos: MirrorPosition = JSON.parse(data)
  const updated = { ...pos, ...update }
  await kvSet(`mirror:${id}`, JSON.stringify(updated))
  return updated
}

export async function getOpenMirrorPositions(userId: string): Promise<MirrorPosition[]> {
  const ids = await kvSmembers(`open_mirrors:${userId}`)
  const all = await Promise.all(ids.map((id) => getMirrorPosition(id)))
  return (all.filter(Boolean) as MirrorPosition[]).filter((p) => p.status === 'open')
}

export async function getAllMirrorPositions(userId: string, limit = 50): Promise<MirrorPosition[]> {
  const ids = await kvSmembers(`user_mirrors:${userId}`)
  const all = await Promise.all(ids.map((id) => getMirrorPosition(id)))
  return (all.filter(Boolean) as MirrorPosition[])
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .slice(0, limit)
}

// ─── Signal Sources ───────────────────────────────────────────────────────────

export async function saveSignalSource(source: SignalSource): Promise<void> {
  await kvSet(`signal_source:${source.id}`, JSON.stringify(source))
  await kvSadd('all_signal_sources', source.id)
  if (source.enabled) {
    await kvSadd('active_signal_sources', source.id)
  }
}

export async function getSignalSource(id: string): Promise<SignalSource | null> {
  const data = await kvGet(`signal_source:${id}`)
  return data ? JSON.parse(data) : null
}

export async function getActiveSignalSources(): Promise<SignalSource[]> {
  const ids = await kvSmembers('active_signal_sources')
  const sources = await Promise.all(ids.map((id) => getSignalSource(id)))
  return sources.filter(Boolean) as SignalSource[]
}

export async function getAllSignalSources(): Promise<SignalSource[]> {
  const ids = await kvSmembers('all_signal_sources')
  const sources = await Promise.all(ids.map((id) => getSignalSource(id)))
  return sources.filter(Boolean) as SignalSource[]
}

export async function saveExternalSignal(signal: ExternalSignal): Promise<void> {
  await kvSet(`external_signal:${signal.id}`, JSON.stringify(signal))
  await kvLpush(`signals_ext:${signal.sourceId}`, signal.id)
}
