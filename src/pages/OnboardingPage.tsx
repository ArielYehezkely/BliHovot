import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { useAuthStore } from '../stores/authStore'
import { createProfile } from '../lib/api'
import { CURRENCIES } from '../types'

type Step = 'phone' | 'profile'

export function OnboardingPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)
  const setProfile = useAuthStore((s) => s.setProfile)

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [formattedPhone, setFormattedPhone] = useState('')
  const [displayName, setDisplayName] = useState(
    session?.user?.user_metadata?.full_name ?? ''
  )
  const [currency, setCurrency] = useState('ILS')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const isHebrew = i18n.language === 'he'

  const handlePhoneSubmit = () => {
    setError('')
    const parsed = parsePhoneNumberFromString(phone, 'IL')
    if (!parsed?.isValid()) {
      setError(isHebrew ? 'נא להזין מספר טלפון תקין' : 'Please enter a valid phone number')
      return
    }
    setFormattedPhone(parsed.format('E.164'))
    setStep('profile')
  }

  const handleComplete = async () => {
    if (!session?.user?.id) return
    setError('')
    setIsLoading(true)
    try {
      const profile = await createProfile({
        id: session.user.id,
        phone_number: formattedPhone,
        display_name: displayName.trim() || 'User',
        avatar_url: session.user.user_metadata?.avatar_url ?? null,
        language: i18n.language as 'he' | 'en',
        preferred_currency: currency,
        push_subscription: null,
      })
      setProfile(profile)
      navigate('/home')
    } catch (err) {
      console.error(err)
      setError(t('common.error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-br from-mint/5 via-background to-lavender/5 p-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm flex flex-col items-center gap-10 bg-white/80 backdrop-blur-sm rounded-3xl p-20 shadow-lg"
      >
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold">{t('onboarding.title')}</h1>
          <p className="text-text-secondary mt-2 text-base">{t('onboarding.subtitle')}</p>
        </div>

        {/* Step indicator */}
        <div className="flex justify-center gap-3 mb-10">
          {(['phone', 'profile'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                step === s ? 'w-8 bg-coral' : i < (['phone', 'profile'] as Step[]).indexOf(step) ? 'w-6 bg-mint' : 'w-6 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Phone step */}
        {step === 'phone' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6 gap-10 flex flex-col items-center p-5"
          >
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('onboarding.phoneLabel')}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('onboarding.phonePlaceholder')}
                className="w-full px-4 py-4 rounded-xl border border-gray-200 focus:border-coral focus:ring-2 focus:ring-coral/20 outline-none text-lg transition-all"
                dir="ltr"
                autoFocus
              />
              <p className="text-xs text-text-muted mt-1.5">{t('onboarding.phoneHint')}</p>
            </div>
            <button
              onClick={handlePhoneSubmit}
              disabled={!phone}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-coral to-coral-light text-white font-semibold text-lg shadow-lg shadow-coral/25 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {t('common.next') || 'Next'}
            </button>
          </motion.div>
        )}

        {/* Profile step */}
        {step === 'profile' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6 gap-10 flex flex-col items-center p-5"
          >
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('onboarding.nameLabel')}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-4 rounded-xl border border-gray-200 focus:border-coral focus:ring-2 focus:ring-coral/20 outline-none text-lg transition-all"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('onboarding.currencyLabel')}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-4 py-4 rounded-xl border border-gray-200 focus:border-coral focus:ring-2 focus:ring-coral/20 outline-none bg-white text-lg transition-all"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {isHebrew ? c.name_he : c.name_en}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleComplete}
              disabled={isLoading || !displayName.trim()}
              className="py-4 rounded-2xl bg-gradient-to-r from-mint to-mint-light text-white font-semibold text-lg shadow-lg shadow-mint/25 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? t('common.loading') : t('onboarding.completeButton')}
            </button>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-coral text-sm font-medium bg-coral/10 px-3 py-2 rounded-xl text-center"
          >
            {error}
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}
