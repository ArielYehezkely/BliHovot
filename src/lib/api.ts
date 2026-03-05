/**
 * API barrel – uses mock data on localhost, real Supabase elsewhere.
 * All consumers import from this file; the switch is transparent.
 */
import * as realApi from './api.real'
import * as mockApi from './mockApi'

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

const impl = isLocalhost ? mockApi : realApi

// ── Auth ──
export const signInWithGoogle = impl.signInWithGoogle
export const signInWithMicrosoft = impl.signInWithMicrosoft
export const signOut = impl.signOut
export const deleteAccount = impl.deleteAccount

// ── Profiles ──
export const getProfile = impl.getProfile
export const createProfile = impl.createProfile
export const updateProfile = impl.updateProfile
export const findProfileByPhone = impl.findProfileByPhone
export const findOrCreateByPhone = impl.findOrCreateByPhone

// ── Transactions ──
export const addDebt = impl.addDebt
export const markPayment = impl.markPayment
export const getTransactionsBetween = impl.getTransactionsBetween

// ── Contacts / Balances ──
export const getContactsWithBalances = impl.getContactsWithBalances
export const calculateNetBalance = impl.calculateNetBalance

// ── Notifications ──
export const getNotifications = impl.getNotifications
export const markNotificationRead = impl.markNotificationRead
export const markAllNotificationsRead = impl.markAllNotificationsRead

// ── Realtime ──
export const subscribeToTransactions = impl.subscribeToTransactions
export const subscribeToNotifications = impl.subscribeToNotifications
