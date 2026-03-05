import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Lightbulb, ArrowRight, Check, RefreshCw } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useContactsStore } from '../stores/contactsStore'
import { getContactsWithBalances, getGroupTransactions, markPayment, addDebt, notifyDebtSimplification } from '../lib/api'
import { findCircularDebtSuggestions, type CircularDebtSuggestion, type DebtEdge } from '../lib/debtSimplification'
import { getCurrencySymbol } from '../types'
import { Avatar } from '../components/Avatar'
import { BottomNav } from '../components/BottomNav'

export function AdvancedPage() {
  const { t } = useTranslation()
  const profile = useAuthStore((s) => s.profile)
  const { setContacts } = useContactsStore()
  const [suggestions, setSuggestions] = useState<CircularDebtSuggestion[]>([])
  const [userProfiles, setUserProfiles] = useState<Map<string, { name: string; avatar: string | null }>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [appliedIndices, setAppliedIndices] = useState<Set<number>>(new Set())
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null)

  const loadSuggestions = useCallback(async () => {
    if (!profile?.id) return
    setIsLoading(true)

    try {
      // 1. Get contacts with balances to know who user interacts with
      const contactList = await getContactsWithBalances(profile.id)
      setContacts(contactList)

      // 2. Build user ID list (current user + all contacts)
      const allUserIds = [profile.id, ...contactList.map((c) => c.id)]

      // 3. Get all transactions between these users
      const transactions = await getGroupTransactions(allUserIds)

      // 4. Run circular debt detection
      const results = findCircularDebtSuggestions(transactions, allUserIds, profile.id)
      setSuggestions(results)

      // 5. Build profile lookup for display names
      const profileMap = new Map<string, { name: string; avatar: string | null }>()
      profileMap.set(profile.id, { name: profile.display_name, avatar: profile.avatar_url })
      for (const c of contactList) {
        profileMap.set(c.id, { name: c.display_name, avatar: c.avatar_url })
      }
      setUserProfiles(profileMap)
    } catch (err) {
      console.error('Failed to load suggestions:', err)
    } finally {
      setIsLoading(false)
    }
  }, [profile?.id, setContacts])

  useEffect(() => {
    loadSuggestions()
  }, [loadSuggestions])

  const getUserName = (userId: string) => {
    if (userId === profile?.id) return profile?.display_name ?? '?'
    return userProfiles.get(userId)?.name ?? '?'
  }

  const getUserAvatar = (userId: string) => {
    if (userId === profile?.id) return profile?.avatar_url ?? null
    return userProfiles.get(userId)?.avatar ?? null
  }

  const handleApply = async (suggestion: CircularDebtSuggestion, index: number) => {
    if (!profile?.id) return
    setApplyingIndex(index)

    try {
      // For each current debt in the cycle, create a payment to zero it out
      for (const debt of suggestion.currentDebts) {
        await markPayment(
          debt.from,
          debt.to,
          debt.amount,
          debt.currency,
          t('advanced.circularDebt'),
          profile.id
        )
      }

      // For each suggested debt, create a new debt
      for (const debt of suggestion.suggestedDebts) {
        await addDebt(
          debt.from,
          debt.to,
          debt.amount,
          debt.currency,
          t('advanced.circularDebt'),
          profile.id
        )
      }

      setAppliedIndices((prev) => new Set(prev).add(index))

      // Notify all users in the cycle about the simplification
      await notifyDebtSimplification(
        profile.id,
        profile.display_name,
        suggestion.cycleUserIds,
        suggestion.currency,
        suggestion.eliminatedDebts
      )

      // Refresh contacts
      const contactList = await getContactsWithBalances(profile.id)
      setContacts(contactList)
    } catch (err) {
      console.error('Failed to apply suggestion:', err)
    } finally {
      setApplyingIndex(null)
    }
  }

  const renderDebtEdge = (edge: DebtEdge, key: string) => (
    <div key={key} className="flex items-center gap-2 py-1.5">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Avatar src={getUserAvatar(edge.from)} name={getUserName(edge.from)} size="sm" />
        <span className="text-sm font-medium text-text-primary truncate">
          {getUserName(edge.from)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs text-text-secondary">{t('advanced.owes')}</span>
        <ArrowRight size={14} className="text-text-muted" />
      </div>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Avatar src={getUserAvatar(edge.to)} name={getUserName(edge.to)} size="sm" />
        <span className="text-sm font-medium text-text-primary truncate">
          {getUserName(edge.to)}
        </span>
      </div>
      <span className="font-bold text-sm text-coral-dark shrink-0">
        {getCurrencySymbol(edge.currency)}{edge.amount.toFixed(2)}
      </span>
    </div>
  )

  return (
    <div className="min-h-dvh pb-20 bg-background">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Lightbulb size={22} className="text-amber-500" />
          {t('advanced.title')}
        </h1>
        <button
          onClick={loadSuggestions}
          disabled={isLoading}
          className="p-2 rounded-xl text-text-secondary hover:bg-white/80 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="px-5">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-3 border-coral border-t-transparent animate-spin" />
          </div>
        ) : suggestions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12"
          >
            <div className="text-5xl mb-4">💡</div>
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              {t('advanced.noSuggestions')}
            </h3>
            <p className="text-sm text-text-secondary max-w-xs mx-auto">
              {t('advanced.noSuggestionsDesc')}
            </p>
          </motion.div>
        ) : (
          <AnimatePresence>
            <div className="space-y-4">
              {suggestions.map((suggestion, idx) => {
                const isApplied = appliedIndices.has(idx)
                const isApplying = applyingIndex === idx

                return (
                  <motion.div
                    key={`suggestion-${idx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`bg-white rounded-2xl shadow-sm overflow-hidden ${isApplied ? 'opacity-60' : ''}`}
                  >
                    {/* Card header */}
                    <div className="px-4 pt-4 pb-2 flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-text-primary flex items-center gap-2">
                          🔄 {t('advanced.circularDebt')}
                        </h3>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {t('advanced.circularDebtDesc')}
                        </p>
                      </div>
                      <span className="bg-mint/10 text-mint-dark text-xs font-bold px-2 py-1 rounded-full shrink-0">
                        {t('advanced.eliminates', { count: suggestion.eliminatedDebts })}
                      </span>
                    </div>

                    {/* Involved users */}
                    <div className="px-4 py-2">
                      <p className="text-xs text-text-secondary font-medium mb-1.5">
                        {t('advanced.involvedUsers')}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {suggestion.cycleUserIds.map((uid) => (
                          <div key={uid} className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2 py-1">
                            <Avatar src={getUserAvatar(uid)} name={getUserName(uid)} size="sm" />
                            <span className="text-xs font-medium text-text-primary">
                              {getUserName(uid)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Current debts */}
                    <div className="px-4 py-2">
                      <p className="text-xs text-text-secondary font-medium mb-1">
                        {t('advanced.currentDebts')}
                      </p>
                      <div className="bg-coral/5 rounded-xl px-3 py-1 divide-y divide-coral/10">
                        {suggestion.currentDebts.map((debt, i) =>
                          renderDebtEdge(debt, `current-${i}`)
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center py-1">
                      <div className="w-8 h-8 rounded-full bg-mint/10 flex items-center justify-center">
                        <ArrowRight size={16} className="text-mint-dark rotate-90" />
                      </div>
                    </div>

                    {/* Suggested debts */}
                    <div className="px-4 py-2">
                      <p className="text-xs text-text-secondary font-medium mb-1">
                        {t('advanced.suggestedDebts')}
                      </p>
                      <div className="bg-mint/5 rounded-xl px-3 py-1 divide-y divide-mint/10">
                        {suggestion.suggestedDebts.length > 0 ? (
                          suggestion.suggestedDebts.map((debt, i) =>
                            renderDebtEdge(debt, `suggested-${i}`)
                          )
                        ) : (
                          <p className="text-sm text-mint-dark font-medium py-2 text-center">
                            All settled! 🎉
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Apply button */}
                    <div className="px-4 py-3">
                      <button
                        onClick={() => handleApply(suggestion, idx)}
                        disabled={isApplied || isApplying}
                        className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
                          isApplied
                            ? 'bg-mint/10 text-mint-dark'
                            : 'bg-gradient-to-r from-coral to-coral-light text-white shadow-sm shadow-coral/20 active:scale-[0.98]'
                        } disabled:opacity-70`}
                      >
                        {isApplied ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <Check size={16} />
                            {t('advanced.applied')}
                          </span>
                        ) : isApplying ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <RefreshCw size={14} className="animate-spin" />
                            {t('advanced.applying')}
                          </span>
                        ) : (
                          t('advanced.apply')
                        )}
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </AnimatePresence>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
