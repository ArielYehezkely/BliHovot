import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Settings, Globe, Coins, LogOut, Info, Trash2 } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { signOut, updateProfile, deleteAccount } from '../lib/api'
import { CURRENCIES } from '../types'
import { BottomNav } from '../components/BottomNav'
import { Avatar } from '../components/Avatar'
import { Modal } from '../components/Modal'

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)
  const authSignOut = useAuthStore((s) => s.signOut)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isHebrew = i18n.language === 'he'

  const handleLanguageChange = async (lang: 'he' | 'en') => {
    i18n.changeLanguage(lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'

    if (profile?.id) {
      try {
        const updated = await updateProfile(profile.id, { language: lang })
        setProfile(updated)
      } catch (err) {
        console.error('Failed to update language:', err)
      }
    }
  }

  const handleCurrencyChange = async (currency: string) => {
    if (!profile?.id) return
    setIsSaving(true)
    try {
      const updated = await updateProfile(profile.id, { preferred_currency: currency })
      setProfile(updated)
    } catch (err) {
      console.error('Failed to update currency:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      authSignOut()
      window.location.href = '/'
    } catch (err) {
      console.error('Sign out failed:', err)
    }
  }

  const handleDeleteAccount = async () => {
    if (!profile?.id) return
    setIsDeleting(true)
    try {
      await deleteAccount(profile.id)
      authSignOut()
      window.location.href = '/'
    } catch (err) {
      console.error('Delete account failed:', err)
      setIsDeleting(false)
    }
  }

  return (
    <div className="min-h-dvh pb-20 bg-background">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Settings size={22} />
          {t('settings.title')}
        </h1>
      </div>

      {/* Profile card */}
      {profile && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-5 mb-4 p-4 bg-white rounded-2xl shadow-sm flex items-center gap-3"
        >
          <Avatar src={profile.avatar_url} name={profile.display_name} size="lg" />
          <div>
            <h2 className="font-semibold text-text-primary">{profile.display_name}</h2>
            <p className="text-sm text-text-secondary" dir="ltr">{profile.phone_number}</p>
          </div>
        </motion.div>
      )}

      {/* Settings sections */}
      <div className="px-5 space-y-3">
        {/* Language */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <Globe size={18} className="text-lavender" />
            <span className="font-medium text-text-primary">{t('settings.language')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleLanguageChange('en')}
              className={`py-2.5 rounded-xl font-medium text-sm transition-all ${
                !isHebrew
                  ? 'bg-coral text-white shadow-md shadow-coral/20'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
              }`}
            >
              English
            </button>
            <button
              onClick={() => handleLanguageChange('he')}
              className={`py-2.5 rounded-xl font-medium text-sm transition-all ${
                isHebrew
                  ? 'bg-coral text-white shadow-md shadow-coral/20'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
              }`}
            >
              עברית
            </button>
          </div>
        </motion.div>

        {/* Currency */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <Coins size={18} className="text-yellow-dark" />
            <span className="font-medium text-text-primary">{t('settings.currency')}</span>
            {isSaving && <span className="text-xs text-text-muted animate-pulse">{t('common.loading')}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                onClick={() => handleCurrencyChange(c.code)}
                className={`py-2.5 rounded-xl font-medium text-sm transition-all ${
                  profile?.preferred_currency === c.code
                    ? 'bg-mint text-white shadow-md shadow-mint/20'
                    : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
                }`}
              >
                {c.symbol} {isHebrew ? c.name_he : c.name_en}
              </button>
            ))}
          </div>
        </motion.div>

        {/* About */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <Info size={18} className="text-mint" />
            <span className="font-medium text-text-primary">{t('settings.about')}</span>
          </div>
          <p className="text-sm text-text-muted mt-2">
            BliHovot v1.0.0 — {t('settings.version')}
          </p>
        </motion.div>

        {/* Sign out */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-coral/10 text-coral font-semibold hover:bg-coral/20 transition-colors"
        >
          <LogOut size={18} />
          {t('auth.signOut')}
        </motion.button>

        {/* Delete account */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-50 text-red-500 font-semibold hover:bg-red-100 transition-colors"
        >
          <Trash2 size={18} />
          {t('settings.deleteAccount')}
        </motion.button>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t('settings.deleteConfirmTitle')}
      >
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            {t('settings.deleteConfirmMessage')}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-3 rounded-2xl bg-gray-100 text-text-primary font-medium hover:bg-gray-200 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {isDeleting ? t('common.loading') : t('settings.deleteConfirmButton')}
            </button>
          </div>
        </div>
      </Modal>

      <BottomNav />
    </div>
  )
}
