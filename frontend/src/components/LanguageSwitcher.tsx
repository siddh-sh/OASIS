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
    <label className="flex items-center gap-2 text-sm text-ocean-300">
      <span className="hidden text-[10px] font-medium tracking-[0.16em] text-mist uppercase xl:inline">{t('header.language')}</span>
      {/* Each option is written in its own script so a reader can find their
          language whatever the current one is — deliberately not translated. */}
      <select
        translate="no"
        value={language}
        onChange={(e) => setLanguage(e.target.value as LanguageCode)}
        className="glass-select"
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
