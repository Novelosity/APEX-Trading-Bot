import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from './firebase'
import type {
  User, Trade, Signal, BotState,
  CongressionalDisclosure, MirrorPosition,
  CongressionalModuleConfig, SignalSource, ExternalSignal,
} from './types'

// ─── Users ────────────────────────────────────────────────────────────────────

export async function saveUser(user: User): Promise<void> {
  await getDb().collection('users').doc(user.id).set(user)
}

export async function getUser(userId: string): Promise<User | null> {
  const doc = await getDb().collection('users').doc(userId).get()
  return doc.exists ? (doc.data() as User) : null
}

export async function getAllUsers(): Promise<User[]> {
  const snapshot = await getDb().collection('users').get()
  return snapshot.docs.map((d) => d.data() as User)
}

export async function updateUser(userId: string, update: Partial<User>): Promise<User | null> {
  const ref = getDb().collection('users').doc(userId)
  const doc = await ref.get()
  if (!doc.exists) return null
  const updated = { ...doc.data() as User, ...update, updatedAt: new Date().toISOString() }
  await ref.set(updated)
  return updated
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const snapshot = await getDb().collection('users')
    .where('email', '==', email.toLowerCase())
    .limit(1)
    .get()
  return snapshot.empty ? null : (snapshot.docs[0].data() as User)
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export async function saveTrade(trade: Trade): Promise<void> {
  await getDb().collection('trades').doc(trade.id).set(trade)
}

export async function updateTrade(id: string, _userId: string, update: Partial<Trade>): Promise<Trade | null> {
  const ref = getDb().collection('trades').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return null
  const updated = { ...doc.data() as Trade, ...update }
  await ref.set(updated)
  return updated
}

export async function getTrade(id: string): Promise<Trade | null> {
  const doc = await getDb().collection('trades').doc(id).get()
  return doc.exists ? (doc.data() as Trade) : null
}

export async function getOpenTrades(userId: string): Promise<Trade[]> {
  const snapshot = await getDb().collection('trades').where('userId', '==', userId).get()
  return snapshot.docs
    .map((d) => d.data() as Trade)
    .filter((t) => t.status === 'open')
}

export async function getAllOpenTrades(): Promise<Trade[]> {
  const snapshot = await getDb().collection('trades').where('status', '==', 'open').get()
  return snapshot.docs.map((d) => d.data() as Trade)
}

export async function getTrades(userId: string, limit = 50): Promise<Trade[]> {
  const snapshot = await getDb().collection('trades').where('userId', '==', userId).get()
  return snapshot.docs
    .map((d) => d.data() as Trade)
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .slice(0, limit)
}

// ─── Signals ──────────────────────────────────────────────────────────────────

export async function saveSignal(signal: Signal): Promise<void> {
  await getDb().collection('signals').doc(signal.id).set(signal)
}

export async function getSignal(id: string): Promise<Signal | null> {
  const doc = await getDb().collection('signals').doc(id).get()
  return doc.exists ? (doc.data() as Signal) : null
}

export async function getSignals(userId: string, limit = 20): Promise<Signal[]> {
  const snapshot = await getDb().collection('signals').where('userId', '==', userId).get()
  return snapshot.docs
    .map((d) => d.data() as Signal)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}

export async function markSignalExecuted(id: string, tradeId: string): Promise<void> {
  await getDb().collection('signals').doc(id).update({
    executed: true,
    executedTradeId: tradeId,
  })
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
  const doc = await getDb().collection('botstate').doc(userId).get()
  return doc.exists ? (doc.data() as BotState) : defaultBotState(userId)
}

export async function updateBotState(userId: string, update: Partial<BotState>): Promise<BotState> {
  const current = await getBotState(userId)
  const updated = { ...current, ...update }
  await getDb().collection('botstate').doc(userId).set(updated)
  return updated
}

// ─── Risk Tracking Helpers ────────────────────────────────────────────────────

export async function getDailyTradeCount(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const doc = await getDb().collection('dailytrades').doc(`${userId}_${today}`).get()
  return doc.exists ? ((doc.data()?.count as number) || 0) : 0
}

export async function incrementDailyTradeCount(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  await getDb().collection('dailytrades').doc(`${userId}_${today}`).set(
    { count: FieldValue.increment(1) },
    { merge: true }
  )
}

export async function getLastLossAt(userId: string): Promise<string | null> {
  const doc = await getDb().collection('lastloss').doc(userId).get()
  return doc.exists ? ((doc.data()?.value as string) || null) : null
}

export async function setLastLossAt(userId: string, iso: string): Promise<void> {
  await getDb().collection('lastloss').doc(userId).set({ value: iso })
}

export async function savePendingApproval(userId: string, signalId: string): Promise<void> {
  await getDb().collection('pending_approvals').doc(userId).set(
    { signalIds: FieldValue.arrayUnion(signalId) },
    { merge: true }
  )
}

export async function getPendingApprovals(userId: string): Promise<string[]> {
  const doc = await getDb().collection('pending_approvals').doc(userId).get()
  return doc.exists ? ((doc.data()?.signalIds as string[]) || []) : []
}

export async function removePendingApproval(userId: string, signalId: string): Promise<void> {
  await getDb().collection('pending_approvals').doc(userId).set(
    { signalIds: FieldValue.arrayRemove(signalId) },
    { merge: true }
  )
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
  const doc = await getDb().collection('congress_config').doc(userId).get()
  return doc.exists ? (doc.data() as CongressionalModuleConfig) : defaultCongressConfig(userId)
}

export async function saveCongressConfig(config: CongressionalModuleConfig): Promise<void> {
  await getDb().collection('congress_config').doc(config.userId).set(config)
}

export async function saveDisclosure(disclosure: CongressionalDisclosure): Promise<void> {
  await getDb().collection('disclosures').doc(disclosure.id).set(disclosure)
}

export async function getDisclosure(id: string): Promise<CongressionalDisclosure | null> {
  const doc = await getDb().collection('disclosures').doc(id).get()
  return doc.exists ? (doc.data() as CongressionalDisclosure) : null
}

export async function getRecentDisclosures(limit = 50): Promise<CongressionalDisclosure[]> {
  const snapshot = await getDb().collection('disclosures').get()
  return snapshot.docs
    .map((d) => d.data() as CongressionalDisclosure)
    .sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())
    .slice(0, limit)
}

export async function saveMirrorPosition(pos: MirrorPosition): Promise<void> {
  await getDb().collection('mirror_positions').doc(pos.id).set(pos)
}

export async function getMirrorPosition(id: string): Promise<MirrorPosition | null> {
  const doc = await getDb().collection('mirror_positions').doc(id).get()
  return doc.exists ? (doc.data() as MirrorPosition) : null
}

export async function updateMirrorPosition(id: string, update: Partial<MirrorPosition>): Promise<MirrorPosition | null> {
  const ref = getDb().collection('mirror_positions').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return null
  const updated = { ...doc.data() as MirrorPosition, ...update }
  await ref.set(updated)
  return updated
}

export async function getOpenMirrorPositions(userId: string): Promise<MirrorPosition[]> {
  const snapshot = await getDb().collection('mirror_positions').where('userId', '==', userId).get()
  return snapshot.docs
    .map((d) => d.data() as MirrorPosition)
    .filter((p) => p.status === 'open')
}

export async function getAllMirrorPositions(userId: string, limit = 50): Promise<MirrorPosition[]> {
  const snapshot = await getDb().collection('mirror_positions').where('userId', '==', userId).get()
  return snapshot.docs
    .map((d) => d.data() as MirrorPosition)
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
    .slice(0, limit)
}

// ─── Signal Sources ───────────────────────────────────────────────────────────

export async function saveSignalSource(source: SignalSource): Promise<void> {
  await getDb().collection('signal_sources').doc(source.id).set(source)
}

export async function getSignalSource(id: string): Promise<SignalSource | null> {
  const doc = await getDb().collection('signal_sources').doc(id).get()
  return doc.exists ? (doc.data() as SignalSource) : null
}

export async function getActiveSignalSources(): Promise<SignalSource[]> {
  const snapshot = await getDb().collection('signal_sources').where('enabled', '==', true).get()
  return snapshot.docs.map((d) => d.data() as SignalSource)
}

export async function getAllSignalSources(): Promise<SignalSource[]> {
  const snapshot = await getDb().collection('signal_sources').get()
  return snapshot.docs.map((d) => d.data() as SignalSource)
}

export async function saveExternalSignal(signal: ExternalSignal): Promise<void> {
  await getDb().collection('external_signals').doc(signal.id).set(signal)
}
