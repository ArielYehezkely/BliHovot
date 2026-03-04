import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, TrendingDown, TrendingUp, Plus, Minus } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import {
  getTransactionsBetween,
  getProfile,
  addDebt,
  markPayment,
  calculateNetBalance,
} from '../lib/api'
import type { Transaction, Profile } from '../types'
import { getCurrencySymbol } from '../types'
import { Avatar } from '../components/Avatar'
import { BalanceBadge } from '../components/BalanceBadge'
import { DebtForm } from '../components/DebtForm'

export function UserDetailPage() {
  const { id: otherUserId } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)

  const [otherUser, setOtherUser] = useState<Profile | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showDebtForm, setShowDebtForm] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)

  const isRtl = i18n.language === 'he'
  const BackArrow = isRtl ? ArrowRight : ArrowLeft

  const loadData = useCallback(async () => {
    if (!profile?.id || !otherUserId) return
    setIsLoading(true)
    try {
      const [user, txs] = await Promise.all([
        getProfile(otherUserId),
        getTransactionsBetween(profile.id, otherUserId),
      ])
      setOtherUser(user)
      setTransactions(txs)
    } catch (err) {
      console.error('Failed to load user data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [profile?.id, otherUserId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const netBalances = profile?.id && otherUserId
    ? calculateNetBalance(transactions, profile.id, otherUserId)
    : []

  const hasPositiveBalance = netBalances.some((b) => b.amount > 0)

  const handleAddDebt = async (amount: number, currency: string, description: string) => {
    if (!profile?.id || !otherUserId) return
    // User is adding a debt FROM themselves TO otherUser
    await addDebt(profile.id, otherUserId, amount, currency, description, profile.id)
    await loadData()
  }

  const handleMarkPayment = async (amount: number, currency: string, description: string) => {
    if (!profile?.id || !otherUserId) return
    // User (creditor) marks that the other user (debtor) has paid
    await markPayment(otherUserId, profile.id, amount, currency, description, profile.id)
    await loadData()
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-3 border-coral border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!otherUser) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <p className="text-text-secondary">{t('common.noResults')}</p>
        <button
          onClick={() => navigate('/home')}
          className="mt-4 text-coral font-medium"
        >
          {t('common.back')}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh pb-8 bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-lavender/10 via-background to-mint/10 px-5 pt-6 pb-4">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-1 text-text-secondary mb-4 hover:text-text-primary transition-colors"
        >
          <BackArrow size={18} />
          <span className="text-sm font-medium">{t('common.back')}</span>
        </button>

        <div className="flex items-center gap-3 mb-4">
          <Avatar src={otherUser.avatar_url} name={otherUser.display_name} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-text-primary">{otherUser.display_name}</h1>
            <p className="text-sm text-text-secondary" dir="ltr">{otherUser.phone_number}</p>
          </div>
        </div>

        {/* Net balance card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-5 shadow-sm"
        >
          {netBalances.length === 0 ? (
            <div className="text-center py-2">
              <p className="text-lg font-semibold text-text-primary">{t('userDetail.settled')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {netBalances.map((bal) => (
                <div key={bal.currency} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {bal.amount > 0 ? (
                      <TrendingUp size={18} className="text-mint" />
                    ) : (
                      <TrendingDown size={18} className="text-coral" />
                    )}
                    <span className="text-sm font-medium text-text-secondary">
                      {bal.amount > 0 ? t('userDetail.theyOweYou') : t('userDetail.youOweThem')}
                    </span>
                  </div>
                  <BalanceBadge amount={bal.amount} currency={bal.currency} size="md" />
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Action buttons */}
      <div className="px-5 mt-4 flex gap-3">
        <button
          onClick={() => setShowDebtForm(true)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-coral to-coral-light text-white font-semibold shadow-md shadow-coral/20 active:scale-[0.98] transition-transform"
        >
          <Plus size={18} />
          {t('userDetail.addDebt')}
        </button>

        {hasPositiveBalance && (
          <button
            onClick={() => setShowPaymentForm(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-mint to-mint-light text-white font-semibold shadow-md shadow-mint/20 active:scale-[0.98] transition-transform"
          >
            <Minus size={18} />
            {t('userDetail.markPayment')}
          </button>
        )}
      </div>

      {/* Transaction history */}
      <div className="px-5 mt-6">
        <h2 className="text-base font-semibold text-text-primary mb-3">{t('userDetail.debtHistory')}</h2>
        
        {transactions.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">{t('userDetail.noHistory')}</p>
        ) : (
          <AnimatePresence>
            <div className="space-y-2">
              {transactions.map((tx, i) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`p-3.5 rounded-2xl border ${
                    tx.type === 'debt'
                      ? 'bg-coral/5 border-coral/10'
                      : 'bg-mint/5 border-mint/10'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {tx.type === 'debt' ? (
                          <TrendingDown size={14} className="text-coral shrink-0" />
                        ) : (
                          <TrendingUp size={14} className="text-mint shrink-0" />
                        )}
                        <span className="text-xs font-medium text-text-secondary">
                          {tx.created_by === profile?.id
                            ? tx.type === 'debt'
                              ? t('userDetail.debtAdded')
                              : t('userDetail.paymentMarked')
                            : otherUser.display_name + ' ' + (tx.type === 'debt' ? t('userDetail.debtAdded') : t('userDetail.paymentMarked'))
                          }
                        </span>
                      </div>
                      <p className="text-sm text-text-primary truncate">{tx.description}</p>
                      <p className="text-xs text-text-muted mt-1">
                        {new Date(tx.created_at).toLocaleDateString(i18n.language, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className={`text-base font-bold ${tx.type === 'debt' ? 'text-coral-dark' : 'text-mint-dark'}`}>
                      {tx.type === 'debt' ? '-' : '+'}{getCurrencySymbol(tx.currency)}{tx.amount.toFixed(2)}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* Debt Form Modal */}
      <DebtForm
        isOpen={showDebtForm}
        onClose={() => setShowDebtForm(false)}
        onSubmit={handleAddDebt}
        type="debt"
        defaultCurrency={profile?.preferred_currency}
        contactName={otherUser.display_name}
      />

      {/* Payment Form Modal */}
      <DebtForm
        isOpen={showPaymentForm}
        onClose={() => setShowPaymentForm(false)}
        onSubmit={handleMarkPayment}
        type="payment"
        defaultCurrency={profile?.preferred_currency}
        contactName={otherUser.display_name}
      />
    </div>
  )
}
