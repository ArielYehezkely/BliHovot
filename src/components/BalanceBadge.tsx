import { getCurrencySymbol } from '../types'
import { useTranslation } from 'react-i18next'

interface BalanceBadgeProps {
  amount: number
  currency: string
  size?: 'sm' | 'md' | 'lg'
}

export function BalanceBadge({ amount, currency, size = 'md' }: BalanceBadgeProps) {
  const { t } = useTranslation()
  const symbol = getCurrencySymbol(currency)
  const absAmount = Math.abs(amount).toFixed(2)
  const isPositive = amount > 0
  const isZero = Math.abs(amount) < 0.01

  const sizeClasses = {
    sm: 'text-sm px-2 py-0.5',
    md: 'text-base px-3 py-1',
    lg: 'text-2xl px-4 py-2 font-bold',
  }

  if (isZero) {
    return (
      <span className={`${sizeClasses[size]} rounded-xl bg-gray-100 text-text-secondary font-medium`}>
        {t('contacts.settled')}
      </span>
    )
  }

  return (
    <span
      className={`${sizeClasses[size]} rounded-xl font-semibold ${
        isPositive
          ? 'bg-mint/10 text-mint-dark'
          : 'bg-coral/10 text-coral-dark'
      }`}
    >
      {symbol}{absAmount}
    </span>
  )
}

interface BalanceDirectionProps {
  amount: number
  currency: string
}

export function BalanceDirection({ amount }: BalanceDirectionProps) {
  const { t } = useTranslation()
  const isPositive = amount > 0
  const isZero = Math.abs(amount) < 0.01

  if (isZero) {
    return <span className="text-xs text-text-muted">{t('contacts.settled')}</span>
  }

  return (
    <span className={`text-xs font-medium ${isPositive ? 'text-mint-dark' : 'text-coral-dark'}`}>
      {isPositive ? t('contacts.owesYou') : t('contacts.youOwe')}
    </span>
  )
}
