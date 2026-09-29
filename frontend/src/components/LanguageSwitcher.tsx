import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n'
import { useLocaleStore } from '@/store/locale'

/**
 * Always visible regardless of what geolocation auto-detect did (see
 * useGeoLanguage.ts) — picking here always wins and is remembered, so
 * auto-detection can only ever set a *default*, never lock a visitor in.
 */
export function LanguageSwitcher() {
  const { t } = useTranslation()
  const { language, setLanguage } = useLocaleStore()

  return (
    <label className="flex items-center gap-2 text-sm text-ocean-600 dark:text-ocean-300">
      <span className="text-xs uppercase tracking-wide text-ocean-500">{t('header.language')}</span>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as LanguageCode)}
        className="rounded-md border border-ocean-300 px-2 py-1 text-sm text-ocean-800 dark:border-ocean-700 dark:bg-ocean-900 dark:text-ocean-100"
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}
