export interface Profile {
  id: string
  phone_number: string
  display_name: string
  avatar_url: string | null
  language: 'he' | 'en'
  preferred_currency: string
  push_subscription: object | null
  created_at: string
}

export interface Transaction {
  id: string
  debtor_id: string
  creditor_id: string
  amount: number
  currency: string
  description: string
  type: 'debt' | 'payment'
  created_by: string
  created_at: string
}

export interface TransactionWithProfiles extends Transaction {
  debtor: Profile
  creditor: Profile
}

export interface Notification {
  id: string
  user_id: string
  type: 'debt_added' | 'debt_reduced' | 'debt_simplified'
  data: {
    amount: number
    currency: string
    from_user_id: string
    from_user_name: string
    description?: string
    /** debt_simplified specific fields */
    involved_users?: string[]
    debts_eliminated?: number
  }
  read: boolean
  created_at: string
}

export interface NetBalance {
  user_id: string
  other_user_id: string
  currency: string
  net_amount: number // positive = other owes user, negative = user owes other
}

export interface ContactUser {
  id: string
  display_name: string
  avatar_url: string | null
  phone_number: string
  net_balances: { currency: string; amount: number }[]
}

export type Currency = 'ILS' | 'USD' | 'EUR' | 'GBP'

export const CURRENCIES: { code: Currency; symbol: string; name_en: string; name_he: string }[] = [
  { code: 'ILS', symbol: '₪', name_en: 'Israeli Shekel', name_he: 'שקל' },
  { code: 'USD', symbol: '$', name_en: 'US Dollar', name_he: 'דולר' },
  { code: 'EUR', symbol: '€', name_en: 'Euro', name_he: 'אירו' },
  { code: 'GBP', symbol: '£', name_en: 'British Pound', name_he: 'לירה שטרלינג' },
]

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? code
}
