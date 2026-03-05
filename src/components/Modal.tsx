import { type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: -100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -100, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-0 left-0 right-0 z-[60] max-h-[90dvh] overflow-auto px-4"
          >
            <div className="bg-white rounded-b-3xl shadow-xl p-5 pb-8 max-w-lg mx-auto w-full overflow-hidden">
              {/* Handle bar */}
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

              {/* Header */}
              <div className="flex items-center justify-between mb-6 gap-2">
                <h2 className="text-lg font-bold text-text-primary truncate min-w-0">{title}</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <X size={20} className="text-text-secondary" />
                </button>
              </div>

              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
