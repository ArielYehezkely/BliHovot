import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import { CURRENCIES } from '../types'

interface DebtFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (amount: number, currency: string, description: string) => Promise<void>
  type: 'debt' | 'payment'
  defaultCurrency?: string
  contactName?: string
}

export function DebtForm({ isOpen, onClose, onSubmit, type, defaultCurrency = 'ILS', contactName }: DebtFormProps) {
  const { t, i18n } = useTranslation()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<string>(defaultCurrency)
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isHebrew = i18n.language === 'he'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (!description.trim() && type === 'debt') {
      setError('Please add a description')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(numAmount, currency, description.trim())
      setAmount('')
      setDescription('')
      onClose()
    } catch {
      setError(t('common.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = type === 'debt'
    ? `${t('debtForm.title')}${contactName ? ` — ${contactName}` : ''}`
    : `${t('debtForm.paymentTitle')}${contactName ? ` — ${contactName}` : ''}`

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            {t('debtForm.amountLabel')}
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('debtForm.amountPlaceholder')}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:border-coral focus:ring-2 focus:ring-coral/20 outline-none text-lg font-semibold transition-all"
              dir="ltr"
              autoFocus
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="px-3 py-3 rounded-xl border border-gray-200 focus:border-coral focus:ring-2 focus:ring-coral/20 outline-none font-medium bg-white transition-all"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {isHebrew ? c.name_he : c.name_en}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            {t('debtForm.descriptionLabel')}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('debtForm.descriptionPlaceholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-coral focus:ring-2 focus:ring-coral/20 outline-none transition-all"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-coral text-sm font-medium bg-coral/10 px-3 py-2 rounded-xl">{error}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3.5 rounded-2xl font-semibold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 ${
            type === 'debt'
              ? 'bg-gradient-to-r from-coral to-coral-light shadow-coral/25'
              : 'bg-gradient-to-r from-mint to-mint-light shadow-mint/25'
          }`}
        >
          {isSubmitting
            ? t('common.loading')
            : type === 'debt'
              ? t('debtForm.submitDebt')
              : t('debtForm.submitPayment')}
        </button>
      </form>
    </Modal>
  )
}
