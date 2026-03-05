import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, UserPlus, Phone, Plus } from 'lucide-react'
import { Modal } from './Modal'
import { findProfileByPhone, findOrCreateByPhone } from '../lib/api'
import { normalizePhone } from '../lib/phoneUtils'
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

// Safer detection: check for the actual select method rather than ContactsManager class
function checkContactPickerSupport(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      navigator.contacts != null &&
      typeof (navigator as any).contacts.select === 'function'
    )
  } catch {
    return false
  }
}

export function ContactPicker({ isOpen, onClose, onSelectUser }: ContactPickerProps) {
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [pickerName, setPickerName] = useState('')
  const [pickerNotSupported, setPickerNotSupported] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [searchedPhone, setSearchedPhone] = useState('')

  const reset = () => {
    setPhone('')
    setFoundUser(null)
    setNotFound(false)
    setError('')
    setPickerName('')
    setPickerNotSupported(false)
    setNewContactName('')
    setIsCreating(false)
    setSearchedPhone('')
  }

  const searchPhone = useCallback(async (rawPhone: string) => {
    setError('')
    setFoundUser(null)
    setNotFound(false)
    setNewContactName('')

    const e164 = normalizePhone(rawPhone)
    // Basic validation: must look like a phone number after normalization
    if (!e164.startsWith('+') || e164.length < 10) {
      setError(t('contacts.invalidPhone', 'Please enter a valid phone number'))
      return
    }

    setSearchedPhone(e164)
    setIsSearching(true)
    try {
      const profile = await findProfileByPhone(e164)
      if (profile) {
        setFoundUser(profile)
      } else {
        setNotFound(true)
        // Pre-fill name if we got it from the native contact picker
        if (pickerName) setNewContactName(pickerName)
      }
    } catch {
      setError(t('common.error'))
    } finally {
      setIsSearching(false)
    }
  }, [t, pickerName])

  // Must be called from a user gesture (click/tap) — cannot auto-launch
  const handlePickContact = useCallback(async () => {
    if (!checkContactPickerSupport()) {
      setPickerNotSupported(true)
      return
    }
    try {
      const contacts = await (navigator as any).contacts.select(
        ['tel', 'name'],
        { multiple: false }
      )
      if (contacts.length > 0) {
        const contact = contacts[0] as { name?: string[]; tel?: string[] }
        if (contact.name?.[0]) setPickerName(contact.name[0])
        if (contact.tel && contact.tel.length > 0) {
          const tel = contact.tel[0]
          setPhone(tel)
          await searchPhone(tel)
        }
      }
    } catch {
      // User cancelled or API failed
      setPickerNotSupported(true)
    }
  }, [searchPhone])

  const handleSearch = () => searchPhone(phone)

  const handleSelect = (userId: string) => {
    reset()
    onSelectUser(userId)
  }

  const handleAddNewContact = async () => {
    if (!newContactName.trim() || !searchedPhone) return
    setIsCreating(true)
    setError('')
    try {
      const profile = await findOrCreateByPhone(searchedPhone, newContactName.trim())
      reset()
      onSelectUser(profile.id)
    } catch {
      setError(t('common.error'))
    } finally {
      setIsCreating(false)
    }
  }

  // Reset state when modal opens/closes
  const handleClose = () => {
    reset()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('contacts.selectContact')}>
      <div className="space-y-4">
        {/* Pick from phone contacts — always shown as primary action */}
        <button
          onClick={handlePickContact}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-coral to-coral-light text-white font-semibold shadow-lg shadow-coral/25 hover:shadow-xl active:scale-[0.98] transition-all"
        >
          <UserPlus size={20} />
          {t('contacts.pickContact')}
        </button>

        {/* Show hint if picker is not supported on this device */}
        {pickerNotSupported && (
          <p className="text-xs text-text-muted text-center bg-gray-50 rounded-xl px-3 py-2">
            {t('contacts.pickerNotSupported', 'Contact picker is not supported on this device. Please enter a phone number below.')}
          </p>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-text-muted font-medium">
            {t('contacts.orEnterPhone', 'or enter phone number')}
          </span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

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

        {/* Not found — offer to create a new contact */}
        {notFound && (
          <div className="space-y-3 p-4 bg-gray-50 rounded-2xl border border-gray-200">
            <p className="text-sm text-text-secondary text-center">
              {pickerName
                ? t('contacts.notOnAppNamed', '{{name}} is not on the app yet', { name: pickerName })
                : t('contacts.notOnApp')}
            </p>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                {t('contacts.contactName')}
              </label>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder={t('contacts.contactNamePlaceholder', 'Enter their name')}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-coral focus:ring-2 focus:ring-coral/20 outline-none transition-all"
                onKeyDown={(e) => e.key === 'Enter' && handleAddNewContact()}
                autoFocus
              />
            </div>

            <button
              onClick={handleAddNewContact}
              disabled={!newContactName.trim() || isCreating}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-mint to-mint-light text-white font-semibold shadow-lg shadow-mint/25 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isCreating ? (
                <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>
                  <Plus size={18} />
                  {t('contacts.addNewContact')}
                </>
              )}
            </button>
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
