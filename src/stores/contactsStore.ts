import { create } from 'zustand'
import type { ContactUser } from '../types'

interface ContactsState {
  contacts: ContactUser[]
  isLoading: boolean
  setContacts: (contacts: ContactUser[]) => void
  setLoading: (loading: boolean) => void
  updateContact: (contact: ContactUser) => void
}

export const useContactsStore = create<ContactsState>((set) => ({
  contacts: [],
  isLoading: false,
  setContacts: (contacts) => set({ contacts }),
  setLoading: (isLoading) => set({ isLoading }),
  updateContact: (contact) =>
    set((state) => ({
      contacts: state.contacts.map((c) =>
        c.id === contact.id ? contact : c
      ),
    })),
}))
