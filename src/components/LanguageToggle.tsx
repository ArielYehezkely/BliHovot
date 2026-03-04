import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'

export function LanguageToggle() {
  const { i18n } = useTranslation()

  const toggle = () => {
    const newLang = i18n.language === 'he' ? 'en' : 'he'
    i18n.changeLanguage(newLang)
    document.documentElement.lang = newLang
    document.documentElement.dir = newLang === 'he' ? 'rtl' : 'ltr'
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white text-text-secondary text-sm font-medium transition-all shadow-sm"
      aria-label="Toggle language"
    >
      <Languages size={16} />
      <span>{i18n.language === 'he' ? 'EN' : 'עב'}</span>
    </button>
  )
}
