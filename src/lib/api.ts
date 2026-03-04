import { supabase } from './supabase'
import type { Profile, Transaction, Notification, ContactUser } from '../types'

// ============ AUTH ============

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/home',
    },
  })
  if (error) throw error
}

export async function signInWithMicrosoft() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: window.location.origin + '/home',
      scopes: 'openid profile email',
    },
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// ============ PROFILES ============

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function createProfile(profile: Omit<Profile, 'created_at'>): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert(profile)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function findProfileByPhone(phone: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('phone_number', phone)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
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
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      debtor_id: debtorId,
      creditor_id: creditorId,
      amount,
      currency,
      description,
      type: 'debt',
      created_by: createdBy,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function markPayment(
  debtorId: string,
  creditorId: string,
  amount: number,
  currency: string,
  description: string,
  createdBy: string
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      debtor_id: debtorId,
      creditor_id: creditorId,
      amount,
      currency,
      description,
      type: 'payment',
      created_by: createdBy,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getTransactionsBetween(
  userId: string,
  otherUserId: string
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .or(
      `and(debtor_id.eq.${userId},creditor_id.eq.${otherUserId}),and(debtor_id.eq.${otherUserId},creditor_id.eq.${userId})`
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// ============ NET BALANCES & CONTACTS ============

export async function getContactsWithBalances(userId: string): Promise<ContactUser[]> {
  // Get all transactions involving the user
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*, debtor:profiles!debtor_id(*), creditor:profiles!creditor_id(*)')
    .or(`debtor_id.eq.${userId},creditor_id.eq.${userId}`)

  if (error) throw error
  if (!transactions || transactions.length === 0) return []

  // Build a map of other users -> balance per currency
  const balanceMap = new Map<string, {
    profile: Profile
    balances: Map<string, number>
  }>()

  for (const tx of transactions) {
    const otherId = tx.debtor_id === userId ? tx.creditor_id : tx.debtor_id
    const otherProfile = tx.debtor_id === userId ? tx.creditor : tx.debtor

    if (!balanceMap.has(otherId)) {
      balanceMap.set(otherId, {
        profile: otherProfile,
        balances: new Map(),
      })
    }

    const entry = balanceMap.get(otherId)!
    const currentBalance = entry.balances.get(tx.currency) ?? 0

    if (tx.type === 'debt') {
      // debt: debtor owes creditor
      if (tx.debtor_id === userId) {
        // user owes other → negative
        entry.balances.set(tx.currency, currentBalance - tx.amount)
      } else {
        // other owes user → positive
        entry.balances.set(tx.currency, currentBalance + tx.amount)
      }
    } else {
      // payment: reduces debt, reverse the effect
      if (tx.debtor_id === userId) {
        // payment on user's debt to other → positive (reduces what user owes)
        entry.balances.set(tx.currency, currentBalance + tx.amount)
      } else {
        // payment on other's debt to user → negative (reduces what other owes)
        entry.balances.set(tx.currency, currentBalance - tx.amount)
      }
    }
  }

  // Convert map to contact list
  const contacts: ContactUser[] = []
  for (const [id, entry] of balanceMap) {
    const net_balances = Array.from(entry.balances.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .filter(b => Math.abs(b.amount) > 0.01) // filter out near-zero

    contacts.push({
      id,
      display_name: entry.profile.display_name,
      avatar_url: entry.profile.avatar_url,
      phone_number: entry.profile.phone_number,
      net_balances,
    })
  }

  return contacts.sort((a, b) => {
    const aMax = Math.max(...a.net_balances.map(b => Math.abs(b.amount)), 0)
    const bMax = Math.max(...b.net_balances.map(b => Math.abs(b.amount)), 0)
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
    .filter(b => Math.abs(b.amount) > 0.01)
}

// ============ NOTIFICATIONS ============

export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return data ?? []
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)

  if (error) throw error
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)

  if (error) throw error
}

// ============ REALTIME ============

export function subscribeToTransactions(
  userId: string,
  onInsert: (tx: Transaction) => void
) {
  return supabase
    .channel('user-transactions')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'transactions',
        filter: `debtor_id=eq.${userId}`,
      },
      (payload) => onInsert(payload.new as Transaction)
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'transactions',
        filter: `creditor_id=eq.${userId}`,
      },
      (payload) => onInsert(payload.new as Transaction)
    )
    .subscribe()
}

export function subscribeToNotifications(
  userId: string,
  onInsert: (notif: Notification) => void
) {
  return supabase
    .channel('user-notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onInsert(payload.new as Notification)
    )
    .subscribe()
}
