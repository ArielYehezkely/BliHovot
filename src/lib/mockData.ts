/**
 * Mock in-memory database for local development.
 * Provides seed data so the app is usable without Supabase.
 */
import type { Profile, Transaction, Notification, DebtRequest } from '../types'

// ─── Dev user (must match DEV_PROFILE in App.tsx) ───
const DEV_USER_ID = 'dev-user-00000000-0000-0000-0000-000000000000'

// ─── Seed profiles ───
const seedProfiles: Profile[] = [
  {
    id: DEV_USER_ID,
    phone_number: '+972501234567',
    display_name: 'Dev User',
    avatar_url: null,
    language: 'en',
    preferred_currency: 'ILS',
    push_subscription: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'friend-alice-0000-0000-0000-000000000001',
    phone_number: '+972521111111',
    display_name: 'Alice Cohen',
    avatar_url: null,
    language: 'he',
    preferred_currency: 'ILS',
    push_subscription: null,
    created_at: '2026-01-05T00:00:00Z',
  },
  {
    id: 'friend-bob-0000-0000-0000-000000000002',
    phone_number: '+972522222222',
    display_name: 'Bob Levy',
    avatar_url: null,
    language: 'en',
    preferred_currency: 'USD',
    push_subscription: null,
    created_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 'friend-carol-0000-0000-0000-000000000003',
    phone_number: '+972523333333',
    display_name: 'Carol Mizrahi',
    avatar_url: null,
    language: 'he',
    preferred_currency: 'ILS',
    push_subscription: null,
    created_at: '2026-02-01T00:00:00Z',
  },
]

// ─── Seed transactions ───
const seedTransactions: Transaction[] = [
  {
    id: 'tx-0001',
    debtor_id: DEV_USER_ID,
    creditor_id: 'friend-alice-0000-0000-0000-000000000001',
    amount: 120,
    currency: 'ILS',
    description: 'Dinner at Hamalabiya',
    type: 'debt',
    created_by: 'friend-alice-0000-0000-0000-000000000001',
    created_at: '2026-02-10T18:30:00Z',
  },
  {
    id: 'tx-0002',
    debtor_id: DEV_USER_ID,
    creditor_id: 'friend-alice-0000-0000-0000-000000000001',
    amount: 50,
    currency: 'ILS',
    description: 'Partial payment',
    type: 'payment',
    created_by: DEV_USER_ID,
    created_at: '2026-02-15T10:00:00Z',
  },
  {
    id: 'tx-0003',
    debtor_id: 'friend-bob-0000-0000-0000-000000000002',
    creditor_id: DEV_USER_ID,
    amount: 25,
    currency: 'USD',
    description: 'Concert tickets',
    type: 'debt',
    created_by: DEV_USER_ID,
    created_at: '2026-02-20T14:00:00Z',
  },
  {
    id: 'tx-0004',
    debtor_id: DEV_USER_ID,
    creditor_id: 'friend-carol-0000-0000-0000-000000000003',
    amount: 85,
    currency: 'ILS',
    description: 'Groceries',
    type: 'debt',
    created_by: 'friend-carol-0000-0000-0000-000000000003',
    created_at: '2026-03-01T09:00:00Z',
  },
  {
    id: 'tx-0005',
    debtor_id: 'friend-alice-0000-0000-0000-000000000001',
    creditor_id: DEV_USER_ID,
    amount: 200,
    currency: 'ILS',
    description: 'Birthday gift split',
    type: 'debt',
    created_by: DEV_USER_ID,
    created_at: '2026-03-03T12:00:00Z',
  },
  {
    id: 'tx-0006',
    debtor_id: 'friend-carol-0000-0000-0000-000000000003',
    creditor_id: 'friend-alice-0000-0000-0000-000000000001',
    amount: 100,
    currency: 'ILS',
    description: 'Shared vacation expenses',
    type: 'debt',
    created_by: 'friend-alice-0000-0000-0000-000000000001',
    created_at: '2026-03-02T15:00:00Z',
  },
]

// ─── Seed notifications ───
const seedNotifications: Notification[] = [
  {
    id: 'notif-0001',
    user_id: DEV_USER_ID,
    type: 'debt_added',
    data: {
      amount: 85,
      currency: 'ILS',
      from_user_id: 'friend-carol-0000-0000-0000-000000000003',
      from_user_name: 'Carol Mizrahi',
      description: 'Groceries',
    },
    read: false,
    created_at: '2026-03-01T09:00:00Z',
  },
  {
    id: 'notif-0002',
    user_id: DEV_USER_ID,
    type: 'debt_added',
    data: {
      amount: 120,
      currency: 'ILS',
      from_user_id: 'friend-alice-0000-0000-0000-000000000001',
      from_user_name: 'Alice Cohen',
      description: 'Dinner at Hamalabiya',
    },
    read: true,
    created_at: '2026-02-10T18:30:00Z',
  },
]

// ─── Mutable in-memory store (survives only within page session) ───
export const mockDb = {
  profiles: [...seedProfiles],
  transactions: [...seedTransactions],
  notifications: [...seedNotifications],
  debtRequests: [] as DebtRequest[],
  _nextTxId: 100,
  _nextNotifId: 100,
  _nextRequestId: 100,

  generateTxId(): string {
    return `tx-mock-${String(this._nextTxId++).padStart(4, '0')}`
  },

  generateNotifId(): string {
    return `notif-mock-${String(this._nextNotifId++).padStart(4, '0')}`
  },

  generateRequestId(): string {
    return `req-mock-${String(this._nextRequestId++).padStart(4, '0')}`
  },
}
