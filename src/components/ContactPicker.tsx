import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { Search, UserPlus, Phone } from 'lucide-react'
import { Modal } from './Modal'
import { findProfileByPhone } from '../lib/api'
import { Avatar } from './Avatar'

interface ContactPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelectUser: (userId: string) => void
}

interface FoundUser {
  id: string
  display_name: string
  avatar_url: string | null
  phone_number: string
}

export function ContactPicker({ isOpen, onClose, onSelectUser }: ContactPickerProps) {
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')

  const handleSearch = async () => {
    setError('')
    setFoundUser(null)
    setNotFound(false)

    const parsed = parsePhoneNumberFromString(phone, 'IL')
    if (!parsed?.isValid()) {
      setError('Please enter a valid phone number')
      return
    }

    setIsSearching(true)
    try {
      const profile = await findProfileByPhone(parsed.format('E.164'))
      if (profile) {
        setFoundUser(profile)
      } else {
        setNotFound(true)
      }
    } catch {
      setError(t('common.error'))
    } finally {
      setIsSearching(false)
    }
  }

  const isContactPickerSupported = 'contacts' in navigator && 'ContactsManager' in window

  const handlePickContact = async () => {
    if (isContactPickerSupported) {
      try {
        const contacts = await (navigator as ContactsNavigator).contacts.select(
          ['tel', 'name'],
          { multiple: false }
        )
        if (contacts.length > 0) {
          const contact = contacts[0]
          if (contact.tel && contact.tel.length > 0) {
            setPhone(contact.tel[0])
          }
        }
      } catch {
        // User cancelled
      }
    }
  }

  const handleSelect = (userId: string) => {
    setPhone('')
    setFoundUser(null)
    setNotFound(false)
    onSelectUser(userId)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('contacts.selectContact')}>
      <div className="space-y-4">
        {/* Contact picker button - only shown when browser supports Contact Picker API */}
        {isContactPickerSupported && (
          <>
            <button
              onClick={handlePickContact}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-lavender/10 text-lavender-dark font-medium hover:bg-lavender/20 transition-colors"
            >
              <UserPlus size={18} />
              {t('contacts.pickContact')}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-text-muted font-medium">{t('contacts.enterPhone')}</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          </>
        )}

        {/* Phone search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              id="phone-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+972 50 123 4567"
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 focus:border-coral focus:ring-2 focus:ring-coral/20 outline-none transition-all"
              dir="ltr"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || !phone}
            className="px-4 py-3 rounded-xl bg-coral text-white font-medium hover:bg-coral-dark transition-colors disabled:opacity-50"
          >
            <Search size={18} />
          </button>
        </div>

        {/* Loading */}
        {isSearching && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 rounded-full border-2 border-coral border-t-transparent animate-spin" />
          </div>
        )}

        {/* Found user */}
        {foundUser && (
          <button
            onClick={() => handleSelect(foundUser.id)}
            className="w-full flex items-center gap-3 p-3.5 bg-mint/5 rounded-2xl border border-mint/20 hover:bg-mint/10 transition-colors text-start"
          >
            <Avatar src={foundUser.avatar_url} name={foundUser.display_name} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text-primary">{foundUser.display_name}</p>
              <p className="text-sm text-text-secondary" dir="ltr">{foundUser.phone_number}</p>
            </div>
          </button>
        )}

        {/* Not found */}
        {notFound && (
          <div className="text-center py-4 bg-yellow/5 rounded-2xl border border-yellow/20">
            <p className="text-sm text-text-secondary">{t('contacts.notOnApp')}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-coral text-sm font-medium bg-coral/10 px-3 py-2 rounded-xl text-center">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

// Type declarations for the Contact Picker API
interface ContactInfo {
  name?: string[]
  tel?: string[]
}

interface ContactsManager {
  select(
    properties: string[],
    options?: { multiple?: boolean }
  ): Promise<ContactInfo[]>
}

interface ContactsNavigator extends Navigator {
  contacts: ContactsManager
}
