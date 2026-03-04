import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { signInWithGoogle, signInWithMicrosoft } from '../lib/api'
import { LanguageToggle } from '../components/LanguageToggle'

export function LoginPage() {
  const { t } = useTranslation()

  const handleGoogle = async () => {
    try {
      await signInWithGoogle()
    } catch (err) {
      console.error('Google sign-in failed:', err)
    }
  }

  const handleMicrosoft = async () => {
    try {
      await signInWithMicrosoft()
    } catch (err) {
      console.error('Microsoft sign-in failed:', err)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-gradient-to-br from-coral/5 via-background to-mint/5">
      {/* Language toggle */}
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-sm text-center"
      >
        {/* Logo / Brand */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="mb-8"
        >
          <div className="w-24 h-24 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-coral to-coral-light shadow-lg shadow-coral/30 flex items-center justify-center">
            <span className="text-4xl">💸</span>
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            {t('auth.title')}
          </h1>
          <p className="text-text-secondary text-base">
            {t('auth.subtitle')}
          </p>
        </motion.div>

        {/* Sign-in buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-3"
        >
          {/* Google */}
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-white shadow-md hover:shadow-lg border border-gray-100 font-medium text-text-primary transition-all active:scale-[0.98]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t('auth.signInGoogle')}
          </button>

          {/* Microsoft */}
          <button
            onClick={handleMicrosoft}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-white shadow-md hover:shadow-lg border border-gray-100 font-medium text-text-primary transition-all active:scale-[0.98]"
          >
            <svg width="20" height="20" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            {t('auth.signInMicrosoft')}
          </button>
        </motion.div>

        {/* Decorative footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 text-xs text-text-muted"
        >
          Track debts • Stay fair • Keep it fun ✌️
        </motion.p>
      </motion.div>
    </div>
  )
}
