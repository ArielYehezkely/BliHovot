import { supabase } from './supabase'
import { normalizePhone } from './phoneUtils'
import type { Profile, Transaction, Notification, ContactUser, DebtRequest } from '../types'

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

export async function deleteAccount(userId: string) {
  // Delete notifications
  await supabase.from('notifications').delete().eq('user_id', userId)
  // Delete transactions where user is debtor or creditor
  await supabase.from('transactions').delete().or(`debtor_id.eq.${userId},creditor_id.eq.${userId}`)
  // Delete profile
  const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId)
  if (profileError) throw profileError
  // Sign out (this also invalidates the session)
  await supabase.auth.signOut()
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
  const normalized = normalizePhone(phone)
  // Try E.164 format first, then also try local format
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('phone_number', normalized)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function findOrCreateByPhone(
  phone: string,
  displayName: string
): Promise<Profile> {
  const normalized = normalizePhone(phone)
  const existing = await findProfileByPhone(normalized)
  if (existing) return existing

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: crypto.randomUUID(),
      phone_number: normalized,
      display_name: displayName,
      language: 'en',
      preferred_currency: 'ILS',
    })
    .select()
    .single()

  if (error) throw error
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
  otherUserId: string,
  limit = 5,
  offset = 0
): Promise<{ transactions: Transaction[]; hasMore: boolean }> {
  const { data, error, count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .or(
      `and(debtor_id.eq.${userId},creditor_id.eq.${otherUserId}),and(debtor_id.eq.${otherUserId},creditor_id.eq.${userId})`
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error
  return {
    transactions: data ?? [],
    hasMore: (count ?? 0) > offset + limit,
  }
}

// ============ NET BALANCES & CONTACTS ============

export async function getContactsWithBalances(userId: string): Promise<ContactUser[]> {
  // Read from the materialized balances table instead of summing all transactions
  const { data: rows, error } = await supabase
    .from('balances')
    .select('other_user_id, currency, amount')
    .eq('user_id', userId)

  if (error) throw error
  if (!rows || rows.length === 0) return []

  // Group by other_user_id
  const otherIds = [...new Set(rows.map((r) => r.other_user_id))]

  // Fetch profiles for all other users in one query
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .in('id', otherIds)

  if (profilesError) throw profilesError

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  // Build contact list
  const contactMap = new Map<string, ContactUser>()
  for (const row of rows) {
    if (Math.abs(row.amount) < 0.01) continue
    const p = profileMap.get(row.other_user_id)
    if (!p) continue

    if (!contactMap.has(row.other_user_id)) {
      contactMap.set(row.other_user_id, {
        id: row.other_user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        phone_number: p.phone_number,
        net_balances: [],
      })
    }
    contactMap.get(row.other_user_id)!.net_balances.push({
      currency: row.currency,
      amount: row.amount,
    })
  }

  return [...contactMap.values()].sort((a, b) => {
    const aMax = Math.max(...a.net_balances.map((bl) => Math.abs(bl.amount)), 0)
    const bMax = Math.max(...b.net_balances.map((bl) => Math.abs(bl.amount)), 0)
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

/**
 * Get the net balance between two users from the materialized balances table.
 * Returns the balance from userId's perspective.
 */
export async function getBalanceWith(
  userId: string,
  otherUserId: string
): Promise<{ currency: string; amount: number }[]> {
  const { data, error } = await supabase
    .from('balances')
    .select('currency, amount')
    .eq('user_id', userId)
    .eq('other_user_id', otherUserId)

  if (error) throw error
  return (data ?? [])
    .map((r) => ({ currency: r.currency, amount: Number(r.amount) }))
    .filter((b) => Math.abs(b.amount) > 0.01)
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

// ============ GROUP TRANSACTIONS (for debt simplification) ============

export async function getGroupTransactions(userIds: string[]): Promise<Transaction[]> {
  // Fetch all transactions where both debtor and creditor are in the group
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .in('debtor_id', userIds)
    .in('creditor_id', userIds)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// ============ GROUP BALANCES (for debt simplification via balances table) ============

export async function getGroupBalances(
  userIds: string[]
): Promise<{ user_id: string; other_user_id: string; currency: string; amount: number }[]> {
  const { data, error } = await supabase.rpc('get_group_balances', {
    p_user_ids: userIds,
  })

  if (error) throw error
  return (data ?? []).map((r: { user_id: string; other_user_id: string; currency: string; amount: number }) => ({
    user_id: r.user_id,
    other_user_id: r.other_user_id,
    currency: r.currency,
    amount: Number(r.amount),
  }))
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
  const notifications = cycleUserIds
    .filter((uid) => uid !== initiatorId)
    .map((userId) => ({
      user_id: userId,
      type: 'debt_simplified' as const,
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
    }))

  if (notifications.length === 0) return

  const { error } = await supabase.from('notifications').insert(notifications)
  if (error) throw error
}

// ============ DEBT REQUESTS ============

export async function createDebtRequest(
  creditorId: string,
  debtorId: string,
  amount: number,
  currency: string,
  description: string
): Promise<DebtRequest> {
  const { data, error } = await supabase
    .from('debt_requests')
    .insert({
      creditor_id: creditorId,
      debtor_id: debtorId,
      amount,
      currency,
      description,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw error

  // Get creditor name for notification
  const creditor = await getProfile(creditorId)

  // Notify the debtor about the request
  await supabase.from('notifications').insert({
    user_id: debtorId,
    type: 'debt_request',
    data: {
      amount,
      currency,
      from_user_id: creditorId,
      from_user_name: creditor?.display_name ?? 'User',
      description,
      request_id: data.id,
    },
    read: false,
  })

  return data
}

export async function getPendingDebtRequests(userId: string): Promise<DebtRequest[]> {
  const { data, error } = await supabase
    .from('debt_requests')
    .select('*')
    .eq('debtor_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function approveDebtRequest(requestId: string, userId: string): Promise<void> {
  // Fetch the request
  const { data: request, error: fetchError } = await supabase
    .from('debt_requests')
    .select('*')
    .eq('id', requestId)
    .eq('debtor_id', userId)
    .eq('status', 'pending')
    .single()

  if (fetchError || !request) throw fetchError ?? new Error('Request not found')

  // Update status to approved
  const { error: updateError } = await supabase
    .from('debt_requests')
    .update({ status: 'approved', resolved_at: new Date().toISOString() })
    .eq('id', requestId)

  if (updateError) throw updateError

  // Create the actual transaction (debtor approves, so created_by = debtor)
  await addDebt(request.debtor_id, request.creditor_id, request.amount, request.currency, request.description, userId)

  // Notify the creditor that the request was approved
  const debtor = await getProfile(userId)
  await supabase.from('notifications').insert({
    user_id: request.creditor_id,
    type: 'debt_request_approved',
    data: {
      amount: request.amount,
      currency: request.currency,
      from_user_id: userId,
      from_user_name: debtor?.display_name ?? 'User',
      description: request.description,
      request_id: requestId,
    },
    read: false,
  })
}

export async function rejectDebtRequest(requestId: string, userId: string): Promise<void> {
  // Fetch the request
  const { data: request, error: fetchError } = await supabase
    .from('debt_requests')
    .select('*')
    .eq('id', requestId)
    .eq('debtor_id', userId)
    .eq('status', 'pending')
    .single()

  if (fetchError || !request) throw fetchError ?? new Error('Request not found')

  // Update status to rejected
  const { error: updateError } = await supabase
    .from('debt_requests')
    .update({ status: 'rejected', resolved_at: new Date().toISOString() })
    .eq('id', requestId)

  if (updateError) throw updateError

  // Notify the creditor that the request was rejected
  const debtor = await getProfile(userId)
  await supabase.from('notifications').insert({
    user_id: request.creditor_id,
    type: 'debt_request_rejected',
    data: {
      amount: request.amount,
      currency: request.currency,
      from_user_id: userId,
      from_user_name: debtor?.display_name ?? 'User',
      description: request.description,
      request_id: requestId,
    },
    read: false,
  })
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
