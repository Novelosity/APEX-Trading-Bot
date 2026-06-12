import { getDb } from './firebase'
import type {
  User, Trade, Signal, BotState,
  CongressionalDisclosure, MirrorPosition,
  CongressionalModuleConfig, SignalSource, ExternalSignal,
} from './types'

// ─── Users ────────────────────────────────────────────────────────────────────

export async function saveUser(user: User): Promise<void> {
  await getDb().ref(`users/${user.id}`).set(user)
}

export async function getUser(userId: string): Promise<User | null> {
  const snap = await getDb().ref(`users/${userId}`).get()
  return snap.exists() ? (snap.val() as User) : null
}

export async function getAllUsers(): Promise<User[]> {
  const snap = await getDb().ref('users').get()
  if (!snap.exists()) return []
  return Object.values(snap.val()) as User[]
}

export async function updateUser(userId: string, update: Partial<User>): Promise<User | null> {
  const ref = getDb().ref(`users/${userId}`)
  const snap = await ref.get()
  if (!snap.exists()) return null
  const updated = { ...snap.val() as User, ...update, updatedAt: new Date().toISOString() }
  await ref.set(updated)
  return updated
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const snap = await getDb().ref('users').get()
  if (!snap.exists()) return null
  const users = Object.values(snap.val()) as User[]
  return users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export async function saveTrade(trade: Trade): Promise<void> {
  await getDb().ref(`trades/${trade.id}`).set(trade)
  if (trade.status === 'open') {
    await getDb().ref(`open_trades/${trade.userId}/${trade.id}`).set(true)
  }
}

export async function updateTrade(id: string, userId: string, update: Partial<Trade>): Promise<Trade | null> {
  const ref = getDb().ref(`trades/${id}`)
  const snap = await ref.get()
  if (!snap.exists()) return null
  const updated = { ...snap.val() as Trade, ...update }
  await ref.set(updated)
  if (update.status && update.status !== 'open') {
    await getDb().ref(`open_trades/${userId}/${id}`).remove()
  }
  return updated
}

export async function getTrade(id: string): Promise<Trade | null> {
  const snap = await getDb().ref(`trades/${id}`).get()
  return snap.exists() ? (snap.val() as Trade) : null
}

export async function getOpenTrades(userId: string): Promise<Trade[]> {
  const snap = await getDb().ref(`open_trades/${userId}`).get()
  if (!snap.exists()) return []
  const ids = Object.keys(snap.val())
  const trades = await Promise.all(ids.map((id) => getTrade(id)))
  return (trades.filter(Boolean) as Trade[]).filter((t) => t.status === 'open')
}

export async function getAllOpenTrades(): Promise<Trade[]> {
  const snap = await getDb().ref('open_trades').get()
  if (!snap.exists()) return []
  const allIds: string[] = []
  snap.forEach((userSnap) => {
    userSnap.forEach((tradeSnap) => { allIds.push(tradeSnap.key!) })
  })
  const trades = await Promise.all(allIds.map((id) => getTrade(id)))
  return (trades.filter(Boolean) as Trade[]).filter((t) => t.status === 'open')
}

export async function getTrades(userId: string, limit = 50): Promise<Trade[]> {
  const snap = await getDb().ref('trades').orderByChild('userId').equalTo(userId).get()
  if (!snap.exists()) return []
  return (Object.values(snap.val()) as Trade[])
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .slice(0, limit)
}

// ─── Signals ──────────────────────────────────────────────────────────────────

export async function saveSignal(signal: Signal): Promise<void> {
  await getDb().ref(`signals/${signal.id}`).set(signal)
}

export async function getSignal(id: string): Promise<Signal | null> {
  const snap = await getDb().ref(`signals/${id}`).get()
  return snap.exists() ? (snap.val() as Signal) : null
}

export async function getSignals(userId: string, limit = 20): Promise<Signal[]> {
  const snap = await getDb().ref('signals').orderByChild('userId').equalTo(userId).get()
  if (!snap.exists()) return []
  return (Object.values(snap.val()) as Signal[])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}

export async function markSignalExecuted(id: string, tradeId: string): Promise<void> {
  await getDb().ref(`signals/${id}`).update({ executed: true, executedTradeId: tradeId })
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
  const snap = await getDb().ref(`botstate/${userId}`).get()
  return snap.exists() ? (snap.val() as BotState) : defaultBotState(userId)
}

export async function updateBotState(userId: string, update: Partial<BotState>): Promise<BotState> {
  const current = await getBotState(userId)
  const updated = { ...current, ...update }
  await getDb().ref(`botstate/${userId}`).set(updated)
  return updated
}

// ─── Risk Tracking Helpers ────────────────────────────────────────────────────

export async function getDailyTradeCount(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const snap = await getDb().ref(`dailytrades/${userId}_${today}`).get()
  return snap.exists() ? (snap.val() as number) : 0
}

export async function incrementDailyTradeCount(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  await getDb().ref(`dailytrades/${userId}_${today}`).transaction((cur) => (cur || 0) + 1)
}

export async function getLastLossAt(userId: string): Promise<string | null> {
  const snap = await getDb().ref(`lastloss/${userId}`).get()
  return snap.exists() ? (snap.val() as string) : null
}

export async function setLastLossAt(userId: string, iso: string): Promise<void> {
  await getDb().ref(`lastloss/${userId}`).set(iso)
}

export async function savePendingApproval(userId: string, signalId: string): Promise<void> {
  await getDb().ref(`pending_approvals/${userId}/${signalId}`).set(true)
}

export async function getPendingApprovals(userId: string): Promise<string[]> {
  const snap = await getDb().ref(`pending_approvals/${userId}`).get()
  return snap.exists() ? Object.keys(snap.val()) : []
}

export async function removePendingApproval(userId: string, signalId: string): Promise<void> {
  await getDb().ref(`pending_approvals/${userId}/${signalId}`).remove()
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
  const snap = await getDb().ref(`congress_config/${userId}`).get()
  return snap.exists() ? (snap.val() as CongressionalModuleConfig) : defaultCongressConfig(userId)
}

export async function saveCongressConfig(config: CongressionalModuleConfig): Promise<void> {
  await getDb().ref(`congress_config/${config.userId}`).set(config)
}

export async function saveDisclosure(disclosure: CongressionalDisclosure): Promise<void> {
  await getDb().ref(`disclosures/${disclosure.id}`).set(disclosure)
}

export async function getDisclosure(id: string): Promise<CongressionalDisclosure | null> {
  const snap = await getDb().ref(`disclosures/${id}`).get()
  return snap.exists() ? (snap.val() as CongressionalDisclosure) : null
}

export async function getRecentDisclosures(limit = 50): Promise<CongressionalDisclosure[]> {
  const snap = await getDb().ref('disclosures').get()
  if (!snap.exists()) return []
  return (Object.values(snap.val()) as CongressionalDisclosure[])
    .sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())
    .slice(0, limit)
}

export async function saveMirrorPosition(pos: MirrorPosition): Promise<void> {
  await getDb().ref(`mirror_positions/${pos.id}`).set(pos)
  if (pos.status === 'open') {
    await getDb().ref(`open_mirrors/${pos.userId}/${pos.id}`).set(true)
  }
}

export async function getMirrorPosition(id: string): Promise<MirrorPosition | null> {
  const snap = await getDb().ref(`mirror_positions/${id}`).get()
  return snap.exists() ? (snap.val() as MirrorPosition) : null
}

export async function updateMirrorPosition(id: string, update: Partial<MirrorPosition>): Promise<MirrorPosition | null> {
  const ref = getDb().ref(`mirror_positions/${id}`)
  const snap = await ref.get()
  if (!snap.exists()) return null
  const updated = { ...snap.val() as MirrorPosition, ...update }
  await ref.set(updated)
  return updated
}

export async function getOpenMirrorPositions(userId: string): Promise<MirrorPosition[]> {
  const snap = await getDb().ref(`open_mirrors/${userId}`).get()
  if (!snap.exists()) return []
  const ids = Object.keys(snap.val())
  const positions = await Promise.all(ids.map((id) => getMirrorPosition(id)))
  return (positions.filter(Boolean) as MirrorPosition[]).filter((p) => p.status === 'open')
}

export async function getAllMirrorPositions(userId: string, limit = 50): Promise<MirrorPosition[]> {
  const snap = await getDb().ref('mirror_positions').orderByChild('userId').equalTo(userId).get()
  if (!snap.exists()) return []
  return (Object.values(snap.val()) as MirrorPosition[])
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .slice(0, limit)
}

// ─── Signal Sources ───────────────────────────────────────────────────────────

export async function saveSignalSource(source: SignalSource): Promise<void> {
  await getDb().ref(`signal_sources/${source.id}`).set(source)
}

export async function getSignalSource(id: string): Promise<SignalSource | null> {
  const snap = await getDb().ref(`signal_sources/${id}`).get()
  return snap.exists() ? (snap.val() as SignalSource) : null
}

export async function getActiveSignalSources(): Promise<SignalSource[]> {
  const snap = await getDb().ref('signal_sources').get()
  if (!snap.exists()) return []
  return (Object.values(snap.val()) as SignalSource[]).filter((s) => s.enabled)
}

export async function getAllSignalSources(): Promise<SignalSource[]> {
  const snap = await getDb().ref('signal_sources').get()
  if (!snap.exists()) return []
  return Object.values(snap.val()) as SignalSource[]
}

export async function saveExternalSignal(signal: ExternalSignal): Promise<void> {
  await getDb().ref(`external_signals/${signal.id}`).set(signal)
}
