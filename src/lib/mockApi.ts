/**
 * Mock implementation of every export from api.ts.
 * Uses an in-memory store so the app runs fully offline on localhost.
 */
import { mockDb } from './mockData'
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
  return mockDb.profiles.find((p) => p.phone_number === phone) ?? null
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
  otherUserId: string
): Promise<Transaction[]> {
  return mockDb.transactions
    .filter(
      (t) =>
        (t.debtor_id === userId && t.creditor_id === otherUserId) ||
        (t.debtor_id === otherUserId && t.creditor_id === userId)
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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
