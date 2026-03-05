import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../lib/api'
import { getCurrencySymbol } from '../types'
import { BottomNav } from '../components/BottomNav'

export function NotificationsPage() {
  const { t, i18n } = useTranslation()
  const profile = useAuthStore((s) => s.profile)
  const {
    notifications,
    setNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore()

  const loadNotifications = useCallback(async () => {
    if (!profile?.id) return
    try {
      const data = await getNotifications(profile.id)
      setNotifications(data)
    } catch (err) {
      console.error('Failed to load notifications:', err)
    }
  }, [profile?.id, setNotifications])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  // Refresh when page becomes visible again
  useEffect(() => {
    const handleFocus = () => { loadNotifications() }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [loadNotifications])

  const handleMarkRead = async (id: string) => {
    markAsRead(id)
    try {
      await markNotificationRead(id)
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const handleMarkAllRead = async () => {
    if (!profile?.id) return
    markAllAsRead()
    try {
      await markAllNotificationsRead(profile.id)
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
    }
  }

  return (
    <div className="min-h-dvh pb-20 bg-background">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Bell size={22} />
            {t('notifications.title')}
          </h1>
          {notifications.some((n) => !n.read) && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-mint/10 text-mint-dark text-sm font-medium hover:bg-mint/20 transition-colors"
            >
              <CheckCheck size={14} />
              {t('notifications.markAllRead')}
            </button>
          )}
        </div>
      </div>

      {/* Notifications list */}
      <div className="px-5">
        {notifications.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">🔔</div>
            <p className="text-text-secondary">{t('notifications.empty')}</p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="space-y-2">
              {notifications.map((notif, i) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => !notif.read && handleMarkRead(notif.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    notif.read
                      ? 'bg-white border-gray-100'
                      : 'bg-yellow/5 border-yellow/20 shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      notif.type === 'debt_added' ? 'bg-coral/10' : 'bg-mint/10'
                    }`}>
                      {notif.type === 'debt_added' ? (
                        <span className="text-sm">💸</span>
                      ) : (
                        <span className="text-sm">✅</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">
                        {notif.type === 'debt_added'
                          ? t('notifications.debtAdded', {
                              name: notif.data.from_user_name,
                              amount: notif.data.amount.toFixed(2),
                              currency: getCurrencySymbol(notif.data.currency),
                            })
                          : t('notifications.debtReduced', {
                              name: notif.data.from_user_name,
                              amount: notif.data.amount.toFixed(2),
                              currency: getCurrencySymbol(notif.data.currency),
                            })
                        }
                      </p>
                      {notif.data.description && (
                        <p className="text-xs text-text-muted mt-0.5 truncate">
                          {notif.data.description}
                        </p>
                      )}
                      <p className="text-xs text-text-muted mt-1">
                        {new Date(notif.created_at).toLocaleDateString(i18n.language, {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    {!notif.read && (
                      <div className="w-5 h-5 rounded-full bg-coral/10 flex items-center justify-center shrink-0">
                        <Check size={12} className="text-coral" />
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
