import { useTranslation } from 'react-i18next'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { ApiError } from '@/api/client'
import { useDatasetsStatus } from '@/hooks/useAdminData'
import { tDynamic } from '@/i18n/dynamic'
import { useFormat } from '@/i18n/format'

export function AdminPage() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const status = useDatasetsStatus()
  const forbidden = status.error instanceof ApiError && [401, 403].includes(status.error.status)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.admin.title')}</h1>
        <p className="text-sm text-ocean-500">{t('pages.admin.subtitle')}</p>
      </div>

      {forbidden ? (
        <div className="rounded-lg border border-coral-500/30 bg-coral-500/5 p-4 text-sm text-coral-500">
          {t('admin.notAuthorized')}
        </div>
      ) : status.isLoading ? (
        <p className="text-sm text-ocean-500">{t('common.loading')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ocean-200 dark:border-ocean-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-ocean-50 text-ocean-600 dark:bg-ocean-900 dark:text-ocean-300">
              <tr>
                <th className="px-3 py-2">{t('admin.columns.source')}</th>
                <th className="px-3 py-2">{t('admin.columns.type')}</th>
                <th className="px-3 py-2">{t('admin.columns.lastSynced')}</th>
                <th className="px-3 py-2">{t('admin.columns.records')}</th>
                <th className="px-3 py-2">{t('admin.columns.license')}</th>
                <th className="px-3 py-2">{t('admin.columns.cleaningNotes')}</th>
              </tr>
            </thead>
            <tbody>
              {status.data?.map((d) => (
                <tr key={d.id} className="border-t border-ocean-100 dark:border-ocean-800">
                  <td className="px-3 py-2">
                    <DataSourceBadge source={d.source_name} />
                  </td>
                  <td className="px-3 py-2">{tDynamic(`admin.datasetType.${d.dataset_type}`, d.dataset_type)}</td>
                  <td className="px-3 py-2">{d.last_synced_at ? fmt.dateTime(d.last_synced_at) : '—'}</td>
                  <td className="px-3 py-2">{d.record_count != null ? fmt.int(d.record_count) : '—'}</td>
                  {/* Licence names (CC-BY 4.0…) are identifiers. */}
                  <td translate="no" className="px-3 py-2">
                    {d.license ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-ocean-500">{d.last_cleaning_notes ?? t('admin.noCleaningNotes')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
