import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Settings, Bell, Lightbulb } from 'lucide-react'
import { useNotificationStore } from '../stores/notificationStore'

export function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const unreadCount = useNotificationStore((s) => s.unreadCount)

  const tabs = [
    { path: '/home', icon: Home, label: t('home.totalBalance') },
    { path: '/advanced', icon: Lightbulb, label: t('advanced.title') },
    { path: '/notifications', icon: Bell, label: t('notifications.title'), badge: unreadCount },
    { path: '/settings', icon: Settings, label: t('settings.title') },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-100 z-50 safe-area-bottom">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path
          const Icon = tab.icon
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all ${
                isActive
                  ? 'text-coral scale-105'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {tab.badge ? (
                  <span className="absolute -top-1.5 -right-2 bg-coral text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
