import { useTranslation } from 'react-i18next'
import { VIEW_MODES, useViewModeStore, type ViewMode } from '@/store/viewMode'

/**
 * Audience switcher. Labelled "Viewing as" rather than "Role" on purpose:
 * it changes presentation only, and calling it a role would imply it grants
 * access it does not. Server-side permissions are unaffected.
 */
export function ViewModeSwitcher() {
  const { t } = useTranslation()
  const { mode, setMode } = useViewModeStore()

  return (
    <label className="flex items-center gap-2 text-sm text-ocean-300">
      <span className="hidden text-[10px] font-medium tracking-[0.16em] text-mist uppercase xl:inline">{t('header.viewingAs')}</span>
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as ViewMode)}
        title={t(`viewMode.${mode}.blurb`)}
        className="glass-select"
      >
        {VIEW_MODES.map((m) => (
          <option key={m} value={m}>
            {t(`viewMode.${m}.label`)}
          </option>
        ))}
      </select>
    </label>
  )
}
