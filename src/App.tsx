import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import { getProfile, getContactsWithBalances, getNotifications, subscribeToTransactions, subscribeToNotifications } from './lib/api'
import { useAuthStore } from './stores/authStore'
import type { Profile, Notification } from './types'
import { useNotificationStore } from './stores/notificationStore'
import { useContactsStore } from './stores/contactsStore'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { HomePage } from './pages/HomePage'
import { UserDetailPage } from './pages/UserDetailPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AdvancedPage } from './pages/AdvancedPage'
import './locales/i18n'

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

const DEV_PROFILE: Profile = {
  id: 'dev-user-00000000-0000-0000-0000-000000000000',
  phone_number: '+972501234567',
  display_name: 'Dev User',
  avatar_url: null,
  language: 'en',
  preferred_currency: 'ILS',
  push_subscription: null,
  created_at: new Date().toISOString(),
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-3 border-coral border-t-transparent animate-spin" />
          <p className="text-text-secondary text-sm animate-pulse">Loading...</p>
        </div>
      </div>
    )
  }

  // Skip auth on localhost
  if (isLocalhost) {
    return <>{children}</>
  }

  if (!session) {
    return <Navigate to="/" replace />
  }

  if (!profile) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

function RootRedirect() {
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLocalhost) return <Navigate to="/home" replace />

  // While auth is still loading, show a loading spinner instead of the login page
  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-coral to-coral-light shadow-lg shadow-coral/30 flex items-center justify-center">
            <span className="text-3xl">💸</span>
          </div>
          <div className="w-8 h-8 mx-auto rounded-full border-3 border-coral border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  if (session && profile) return <Navigate to="/home" replace />
  if (session && !profile) return <Navigate to="/onboarding" replace />
  return <LoginPage />
}

function App() {
  const { i18n } = useTranslation()
  const setSession = useAuthStore((s) => s.setSession)
  const setProfile = useAuthStore((s) => s.setProfile)
  const setLoading = useAuthStore((s) => s.setLoading)
  const addNotification = useNotificationStore((s) => s.addNotification)
  const setNotifications = useNotificationStore((s) => s.setNotifications)
  const setContacts = useContactsStore((s) => s.setContacts)
  const [isInitialized, setIsInitialized] = useState(false)

  // Set initial direction
  useEffect(() => {
    const lang = i18n.language
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
  }, [i18n.language])

  // Auth listener
  useEffect(() => {
    let txChannel: ReturnType<typeof subscribeToTransactions> | null = null
    let notifChannel: ReturnType<typeof subscribeToNotifications> | null = null

    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Supabase request timed out')), ms)
        ),
      ])

    const initAuth = async () => {
      setLoading(true)
      try {
        // On localhost, set a mock session & profile to skip login
        if (isLocalhost) {
          console.info('Running on localhost – using dev profile, skipping auth')
          setSession({ user: { id: DEV_PROFILE.id } } as any)
          setProfile(DEV_PROFILE)
          return
        }

        if (!isSupabaseConfigured) {
          console.warn('Supabase not configured – skipping auth init')
          setSession(null)
          setProfile(null)
          return
        }
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 10000)
        setSession(session)

        if (session?.user?.id) {
          const profile = await getProfile(session.user.id)
          setProfile(profile)

          // Set up realtime subscriptions
          if (profile) {
            txChannel = subscribeToTransactions(profile.id, async () => {
              // Refresh contacts when a new transaction comes in
              try {
                const contacts = await getContactsWithBalances(profile.id)
                setContacts(contacts)
              } catch (err) {
                console.error('Failed to refresh contacts on realtime update:', err)
              }
            })

            notifChannel = subscribeToNotifications(profile.id, (notif: Notification) => {
              addNotification(notif)
            })

            // Load existing notifications
            try {
              const notifs = await getNotifications(profile.id)
              setNotifications(notifs)
            } catch (err) {
              console.error('Failed to load initial notifications:', err)
            }

            // Apply saved language preference
            if (profile.language && profile.language !== i18n.language) {
              i18n.changeLanguage(profile.language)
            }
          }
        }
      } catch (err) {
        console.error('Auth init failed:', err)
      } finally {
        setLoading(false)
        setIsInitialized(true)
      }
    }

    initAuth()

    // Refresh data when app comes back to foreground
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const { session, profile } = useAuthStore.getState()
        if (session?.user?.id && profile) {
          try {
            const [contacts, notifs] = await Promise.all([
              getContactsWithBalances(profile.id),
              getNotifications(profile.id),
            ])
            setContacts(contacts)
            setNotifications(notifs)
          } catch (err) {
            console.error('Failed to refresh data on visibility change:', err)
          }
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // On localhost we skip the Supabase auth listener entirely
    if (isLocalhost) {
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session?.user?.id && isSupabaseConfigured) {
          try {
            const profile = await getProfile(session.user.id)
            setProfile(profile)
          } catch (err) {
            console.error('Failed to fetch profile on auth change:', err)
            setProfile(null)
          }
        } else {
          setProfile(null)
        }
      }
    )

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      subscription.unsubscribe()
      if (txChannel) supabase.removeChannel(txChannel)
      if (notifChannel) supabase.removeChannel(notifChannel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isInitialized) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-coral to-coral-light shadow-lg shadow-coral/30 flex items-center justify-center">
            <span className="text-3xl">💸</span>
          </div>
          <div className="w-8 h-8 mx-auto rounded-full border-3 border-coral border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route
          path="/home"
          element={
            <AuthGuard>
              <HomePage />
            </AuthGuard>
          }
        />
        <Route
          path="/user/:id"
          element={
            <AuthGuard>
              <UserDetailPage />
            </AuthGuard>
          }
        />
        <Route
          path="/notifications"
          element={
            <AuthGuard>
              <NotificationsPage />
            </AuthGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGuard>
              <SettingsPage />
            </AuthGuard>
          }
        />
        <Route
          path="/advanced"
          element={
            <AuthGuard>
              <AdvancedPage />
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
