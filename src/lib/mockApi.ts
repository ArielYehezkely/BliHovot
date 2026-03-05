/**
 * Mock implementation of every export from api.ts.
 * Uses an in-memory store so the app runs fully offline on localhost.
 */
import { mockDb } from './mockData'
import { normalizePhone } from './phoneUtils'
import type { Profile, Transaction, Notification, ContactUser } from '../types'

// ============ AUTH (no-ops on localhost) ============

export async function signInWithGoogle() {
  console.info('[mock] signInWithGoogle – no-op')
}

export async function signInWithMicrosoft() {
  console.info('[mock] signInWithMicrosoft – no-op')
}

export async function signOut() {
  console.info('[mock] signOut – no-op')
}

export async function deleteAccount(userId: string) {
  console.info('[mock] deleteAccount', userId)
  mockDb.notifications = mockDb.notifications.filter((n) => n.user_id !== userId)
  mockDb.transactions = mockDb.transactions.filter(
    (t) => t.debtor_id !== userId && t.creditor_id !== userId
  )
  mockDb.profiles = mockDb.profiles.filter((p) => p.id !== userId)
}

// ============ PROFILES ============

export async function getProfile(userId: string): Promise<Profile | null> {
  return mockDb.profiles.find((p) => p.id === userId) ?? null
}

export async function createProfile(profile: Omit<Profile, 'created_at'>): Promise<Profile> {
  const full: Profile = { ...profile, created_at: new Date().toISOString() }
  mockDb.profiles.push(full)
  return full
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
  const idx = mockDb.profiles.findIndex((p) => p.id === userId)
  if (idx === -1) throw new Error('Profile not found')
  mockDb.profiles[idx] = { ...mockDb.profiles[idx], ...updates }
  return mockDb.profiles[idx]
}

export async function findProfileByPhone(phone: string): Promise<Profile | null> {
  const normalized = normalizePhone(phone)
  return mockDb.profiles.find((p) => normalizePhone(p.phone_number) === normalized) ?? null
}

export async function findOrCreateByPhone(
  phone: string,
  displayName: string
): Promise<Profile> {
  const normalized = normalizePhone(phone)
  const existing = mockDb.profiles.find((p) => normalizePhone(p.phone_number) === normalized)
  if (existing) return existing

  const newProfile: Profile = {
    id: `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    phone_number: normalized,
    display_name: displayName,
    avatar_url: null,
    language: 'en',
    preferred_currency: 'ILS',
    push_subscription: null,
    created_at: new Date().toISOString(),
  }
  mockDb.profiles.push(newProfile)
  return newProfile
}

// ============ TRANSACTIONS ============

export async function addDebt(
  debtorId: string,
  creditorId: string,
  amount: number,
  currency: string,
  description: string,
  createdBy: string
): Promise<Transaction> {
  const tx: Transaction = {
    id: mockDb.generateTxId(),
    debtor_id: debtorId,
    creditor_id: creditorId,
    amount,
    currency,
    description,
    type: 'debt',
    created_by: createdBy,
    created_at: new Date().toISOString(),
  }
  mockDb.transactions.push(tx)

  // Also create a notification for the debtor
  const creditor = mockDb.profiles.find((p) => p.id === creditorId)
  if (creditor) {
    mockDb.notifications.push({
      id: mockDb.generateNotifId(),
      user_id: debtorId,
      type: 'debt_added',
      data: {
        amount,
        currency,
        from_user_id: creditorId,
        from_user_name: creditor.display_name,
        description,
      },
      read: false,
      created_at: tx.created_at,
    })
  }

  return tx
}

export async function markPayment(
  debtorId: string,
  creditorId: string,
  amount: number,
  currency: string,
  description: string,
  createdBy: string
): Promise<Transaction> {
  const tx: Transaction = {
    id: mockDb.generateTxId(),
    debtor_id: debtorId,
    creditor_id: creditorId,
    amount,
    currency,
    description,
    type: 'payment',
    created_by: createdBy,
    created_at: new Date().toISOString(),
  }
  mockDb.transactions.push(tx)

  // Notification for the creditor
  const debtor = mockDb.profiles.find((p) => p.id === debtorId)
  if (debtor) {
    mockDb.notifications.push({
      id: mockDb.generateNotifId(),
      user_id: creditorId,
      type: 'debt_reduced',
      data: {
        amount,
        currency,
        from_user_id: debtorId,
        from_user_name: debtor.display_name,
        description,
      },
      read: false,
      created_at: tx.created_at,
    })
  }

  return tx
}

export async function getTransactionsBetween(
  userId: string,
  otherUserId: string,
  limit = 5,
  offset = 0
): Promise<{ transactions: Transaction[]; hasMore: boolean }> {
  const all = mockDb.transactions
    .filter(
      (t) =>
        (t.debtor_id === userId && t.creditor_id === otherUserId) ||
        (t.debtor_id === otherUserId && t.creditor_id === userId)
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return {
    transactions: all.slice(offset, offset + limit),
    hasMore: all.length > offset + limit,
  }
}

// ============ NET BALANCES & CONTACTS ============

export async function getContactsWithBalances(userId: string): Promise<ContactUser[]> {
  const userTxs = mockDb.transactions.filter(
    (t) => t.debtor_id === userId || t.creditor_id === userId
  )

  const balanceMap = new Map<
    string,
    { profile: Profile; balances: Map<string, number> }
  >()

  for (const tx of userTxs) {
    const otherId = tx.debtor_id === userId ? tx.creditor_id : tx.debtor_id
    const otherProfile = mockDb.profiles.find((p) => p.id === otherId)
    if (!otherProfile) continue

    if (!balanceMap.has(otherId)) {
      balanceMap.set(otherId, { profile: otherProfile, balances: new Map() })
    }

    const entry = balanceMap.get(otherId)!
    const current = entry.balances.get(tx.currency) ?? 0

    if (tx.type === 'debt') {
      if (tx.debtor_id === userId) {
        entry.balances.set(tx.currency, current - tx.amount)
      } else {
        entry.balances.set(tx.currency, current + tx.amount)
      }
    } else {
      if (tx.debtor_id === userId) {
        entry.balances.set(tx.currency, current + tx.amount)
      } else {
        entry.balances.set(tx.currency, current - tx.amount)
      }
    }
  }

  const contacts: ContactUser[] = []
  for (const [id, entry] of balanceMap) {
    const net_balances = Array.from(entry.balances.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .filter((b) => Math.abs(b.amount) > 0.01)

    contacts.push({
      id,
      display_name: entry.profile.display_name,
      avatar_url: entry.profile.avatar_url,
      phone_number: entry.profile.phone_number,
      net_balances,
    })
  }

  return contacts.sort((a, b) => {
    const aMax = Math.max(...a.net_balances.map((b) => Math.abs(b.amount)), 0)
    const bMax = Math.max(...b.net_balances.map((b) => Math.abs(b.amount)), 0)
    return bMax - aMax
  })
}

export function calculateNetBalance(
  transactions: Transaction[],
  userId: string,
  _otherUserId?: string
): { currency: string; amount: number }[] {
  const balances = new Map<string, number>()

  for (const tx of transactions) {
    const current = balances.get(tx.currency) ?? 0
    if (tx.type === 'debt') {
      if (tx.debtor_id === userId) {
        balances.set(tx.currency, current - tx.amount)
      } else {
        balances.set(tx.currency, current + tx.amount)
      }
    } else {
      if (tx.debtor_id === userId) {
        balances.set(tx.currency, current + tx.amount)
      } else {
        balances.set(tx.currency, current - tx.amount)
      }
    }
  }

  return Array.from(balances.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .filter((b) => Math.abs(b.amount) > 0.01)
}

/**
 * Get the net balance between two users by computing from all transactions.
 * Mock equivalent of the real API's materialized balances read.
 */
export async function getBalanceWith(
  userId: string,
  otherUserId: string
): Promise<{ currency: string; amount: number }[]> {
  const allTxs = mockDb.transactions.filter(
    (t) =>
      (t.debtor_id === userId && t.creditor_id === otherUserId) ||
      (t.debtor_id === otherUserId && t.creditor_id === userId)
  )
  return calculateNetBalance(allTxs, userId, otherUserId)
}

// ============ NOTIFICATIONS ============

export async function getNotifications(userId: string): Promise<Notification[]> {
  return mockDb.notifications
    .filter((n) => n.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50)
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const n = mockDb.notifications.find((n) => n.id === notificationId)
  if (n) n.read = true
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  for (const n of mockDb.notifications) {
    if (n.user_id === userId) n.read = true
  }
}

// ============ GROUP TRANSACTIONS (for debt simplification) ============

export async function getGroupTransactions(userIds: string[]): Promise<Transaction[]> {
  return mockDb.transactions
    .filter((t) => userIds.includes(t.debtor_id) && userIds.includes(t.creditor_id))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

// ============ GROUP BALANCES (for debt simplification via balances table) ============

export async function getGroupBalances(
  userIds: string[]
): Promise<{ user_id: string; other_user_id: string; currency: string; amount: number }[]> {
  // Compute net balances between all users in the group from transactions
  const txs = mockDb.transactions.filter(
    (t) => userIds.includes(t.debtor_id) && userIds.includes(t.creditor_id)
  )

  const balMap = new Map<string, number>()
  for (const tx of txs) {
    const debtorKey = `${tx.debtor_id}:${tx.creditor_id}:${tx.currency}`
    const creditorKey = `${tx.creditor_id}:${tx.debtor_id}:${tx.currency}`
    const delta = tx.type === 'debt' ? tx.amount : -tx.amount
    balMap.set(debtorKey, (balMap.get(debtorKey) ?? 0) - delta)
    balMap.set(creditorKey, (balMap.get(creditorKey) ?? 0) + delta)
  }

  const results: { user_id: string; other_user_id: string; currency: string; amount: number }[] = []
  for (const [key, amount] of balMap) {
    if (Math.abs(amount) < 0.01) continue
    const [userId, otherUserId, currency] = key.split(':')
    results.push({ user_id: userId, other_user_id: otherUserId, currency, amount })
  }
  return results
}

// ============ DEBT SIMPLIFICATION NOTIFICATIONS ============

export async function notifyDebtSimplification(
  initiatorId: string,
  initiatorName: string,
  cycleUserIds: string[],
  currency: string,
  debtsEliminated: number
): Promise<void> {
  const now = new Date().toISOString()
  for (const userId of cycleUserIds) {
    if (userId === initiatorId) continue // don't notify self
    mockDb.notifications.push({
      id: mockDb.generateNotifId(),
      user_id: userId,
      type: 'debt_simplified',
      data: {
        amount: 0,
        currency,
        from_user_id: initiatorId,
        from_user_name: initiatorName,
        description: 'Circular Debt Simplification',
        involved_users: cycleUserIds,
        debts_eliminated: debtsEliminated,
      },
      read: false,
      created_at: now,
    })
  }
}

// ============ REALTIME (no-ops, return dummy channel objects) ============

const dummyChannel = {
  unsubscribe: () => {},
  subscribe: () => dummyChannel,
  on: () => dummyChannel,
} as any

export function subscribeToTransactions(
  _userId: string,
  _onInsert: (tx: Transaction) => void
) {
  return dummyChannel
}

export function subscribeToNotifications(
  _userId: string,
  _onInsert: (notif: Notification) => void
) {
  return dummyChannel
}
