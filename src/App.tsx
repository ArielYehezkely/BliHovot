import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import { getProfile, subscribeToTransactions, subscribeToNotifications } from './lib/api'
import { useAuthStore } from './stores/authStore'
import type { Profile, Notification } from './types'
import { useNotificationStore } from './stores/notificationStore'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { HomePage } from './pages/HomePage'
import { UserDetailPage } from './pages/UserDetailPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { SettingsPage } from './pages/SettingsPage'
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

function App() {
  const { i18n } = useTranslation()
  const setSession = useAuthStore((s) => s.setSession)
  const setProfile = useAuthStore((s) => s.setProfile)
  const setLoading = useAuthStore((s) => s.setLoading)
  const addNotification = useNotificationStore((s) => s.addNotification)
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
            txChannel = subscribeToTransactions(profile.id, () => {
              // Refresh contacts when a new transaction comes in
              // The HomePage will handle this via its own effect
            })

            notifChannel = subscribeToNotifications(profile.id, (notif: Notification) => {
              addNotification(notif)
            })

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

    // On localhost we skip the Supabase auth listener entirely
    if (isLocalhost) {
      return () => {}
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
        <Route path="/" element={isLocalhost ? <Navigate to="/home" replace /> : <LoginPage />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
