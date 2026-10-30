import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { tDynamic } from '@/i18n/dynamic'
import { useFormat } from '@/i18n/format'
import { REFRESH_CHOICES, useRefreshPreference, type RefreshChoice } from '@/store/refreshPreference'

export function SettingsPage() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const { profile } = useAuth()
  const refreshChoice = useRefreshPreference((s) => s.choice)
  const setRefreshChoice = useRefreshPreference((s) => s.setChoice)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('settings.title')}</h1>
      {profile && (
        <dl className="grid max-w-md grid-cols-2 gap-y-2 rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
          <dt className="text-ocean-500">{t('settings.email')}</dt>
          <dd translate="no">{profile.email}</dd>
          <dt className="text-ocean-500">{t('settings.name')}</dt>
          <dd translate="no">{profile.full_name ?? '—'}</dd>
          <dt className="text-ocean-500">{t('settings.role')}</dt>
          <dd>{tDynamic(`roles.${profile.role}`, profile.role)}</dd>
          <dt className="text-ocean-500">{t('settings.institution')}</dt>
          <dd translate="no">{profile.institution ?? '—'}</dd>
          <dt className="text-ocean-500">{t('settings.memberSince')}</dt>
          <dd>{fmt.date(profile.created_at)}</dd>
        </dl>
      )}
      <label className="flex max-w-md flex-col gap-1 rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
        <span className="font-medium text-ocean-950 dark:text-ocean-50">{t('refresh.setting')}</span>
        <select
          value={refreshChoice}
          onChange={(e) => setRefreshChoice(e.target.value as RefreshChoice)}
          className="rounded-md border border-ocean-300 px-3 py-2 dark:border-ocean-700 dark:bg-ocean-950"
        >
          {REFRESH_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>{t(`refresh.${c.labelKey}`)}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
