import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useContactsStore } from '../stores/contactsStore'
import { getContactsWithBalances } from '../lib/api'
import { getCurrencySymbol } from '../types'
import { Avatar } from '../components/Avatar'
import { BalanceBadge, BalanceDirection } from '../components/BalanceBadge'
import { BottomNav } from '../components/BottomNav'
import { LanguageToggle } from '../components/LanguageToggle'
import { ContactPicker } from '../components/ContactPicker'

export function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const { contacts, setContacts, setLoading, isLoading } = useContactsStore()
  const [showContactPicker, setShowContactPicker] = useState(false)

  const loadContacts = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
      const data = await getContactsWithBalances(profile.id)
      setContacts(data)
    } catch (err) {
      console.error('Failed to load contacts:', err)
    } finally {
      setLoading(false)
    }
  }, [profile?.id, setContacts, setLoading])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  // Refresh contacts when navigating back to this page
  useEffect(() => {
    const handleFocus = () => { loadContacts() }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [loadContacts])

  // Calculate totals grouped by currency
  const totals = contacts.reduce<{ youOwe: Record<string, number>; owedToYou: Record<string, number> }>(
    (acc, contact) => {
      for (const bal of contact.net_balances) {
        if (bal.amount > 0) {
          acc.owedToYou[bal.currency] = (acc.owedToYou[bal.currency] ?? 0) + bal.amount
        } else {
          acc.youOwe[bal.currency] = (acc.youOwe[bal.currency] ?? 0) + Math.abs(bal.amount)
        }
      }
      return acc
    },
    { youOwe: {}, owedToYou: {} }
  )

  const hasDebts = contacts.length > 0

  return (
    <div className="min-h-dvh pb-20 bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-coral/10 via-background to-mint/10 px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-text-primary">
            {t('home.greeting', { name: profile?.display_name?.split(' ')[0] ?? '' })}
          </h1>
          <LanguageToggle />
        </div>

        {/* Summary card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-5 shadow-sm"
        >
          <p className="text-sm text-text-secondary mb-3 font-medium">{t('home.summary')}</p>
          
          <div className="grid grid-cols-2 gap-4">
            {/* You owe */}
            <div className="bg-coral/5 rounded-2xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown size={14} className="text-coral" />
                <span className="text-xs font-medium text-coral-dark">{t('home.youOwe')}</span>
              </div>
              {Object.keys(totals.youOwe).length > 0 ? (
                Object.entries(totals.youOwe).map(([curr, amt]) => (
                  <p key={curr} className="text-lg font-bold text-coral-dark">
                    {getCurrencySymbol(curr)}{amt.toFixed(2)}
                  </p>
                ))
              ) : (
                <p className="text-lg font-bold text-coral-dark">—</p>
              )}
            </div>

            {/* Owed to you */}
            <div className="bg-mint/5 rounded-2xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp size={14} className="text-mint" />
                <span className="text-xs font-medium text-mint-dark">{t('home.owedToYou')}</span>
              </div>
              {Object.keys(totals.owedToYou).length > 0 ? (
                Object.entries(totals.owedToYou).map(([curr, amt]) => (
                  <p key={curr} className="text-lg font-bold text-mint-dark">
                    {getCurrencySymbol(curr)}{amt.toFixed(2)}
                  </p>
                ))
              ) : (
                <p className="text-lg font-bold text-mint-dark">—</p>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Contact list */}
      <div className="px-5 mt-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-3 border-coral border-t-transparent animate-spin" />
          </div>
        ) : !hasDebts ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12"
          >
            <div className="text-5xl mb-4">🎉</div>
            <h3 className="text-lg font-semibold text-text-primary mb-1">{t('home.allSettled')}</h3>
            <p className="text-sm text-text-secondary">{t('home.allSettledDesc')}</p>
          </motion.div>
        ) : (
          <AnimatePresence>
            <div className="space-y-2">
              {contacts.map((contact, i) => (
                <motion.button
                  key={contact.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => navigate(`/user/${contact.id}`)}
                  className="w-full flex items-center gap-3 p-3.5 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-[0.99] text-start"
                >
                  <Avatar src={contact.avatar_url} name={contact.display_name} />
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-primary truncate">{contact.display_name}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {contact.net_balances.map((bal) => (
                        <BalanceDirection key={bal.currency} amount={bal.amount} currency={bal.currency} />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-0.5">
                    {contact.net_balances.map((bal) => (
                      <BalanceBadge key={bal.currency} amount={bal.amount} currency={bal.currency} size="sm" />
                    ))}
                  </div>
                </motion.button>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* FAB */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: 'spring' }}
        onClick={() => setShowContactPicker(true)}
        className="fixed bottom-20 right-5 w-14 h-14 rounded-full bg-gradient-to-br from-coral to-coral-light shadow-lg shadow-coral/30 flex items-center justify-center text-white z-40 active:scale-95 transition-transform"
      >
        <Plus size={26} />
      </motion.button>

      {/* Contact Picker Modal */}
      <ContactPicker
        isOpen={showContactPicker}
        onClose={() => setShowContactPicker(false)}
        onSelectUser={(userId) => {
          setShowContactPicker(false)
          navigate(`/user/${userId}`)
        }}
      />

      <BottomNav />
    </div>
  )
}
