import { useTranslation } from 'react-i18next'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { ApiError } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'
import { useDatasetsStatus } from '@/hooks/useAdminData'

export function AdminPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const status = useDatasetsStatus()
  const forbidden = status.error instanceof ApiError && [401, 403].includes(status.error.status)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.admin.title')}</h1>
        <p className="text-sm text-ocean-500">{t('pages.admin.subtitle')}</p>
      </div>

      {profile && profile.role !== 'admin' ? (
        <div className="rounded-lg border border-coral-500/30 bg-coral-500/5 p-4 text-sm text-coral-500">
          This page requires the admin role. Your role is "{profile.role}".
        </div>
      ) : forbidden ? (
        <div className="rounded-lg border border-coral-500/30 bg-coral-500/5 p-4 text-sm text-coral-500">
          Not authorized to view dataset status.
        </div>
      ) : status.isLoading ? (
        <p className="text-sm text-ocean-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ocean-200 dark:border-ocean-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-ocean-50 text-ocean-600 dark:bg-ocean-900 dark:text-ocean-300">
              <tr>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Last synced</th>
                <th className="px-3 py-2">Records</th>
                <th className="px-3 py-2">License</th>
                <th className="px-3 py-2">Cleaning notes</th>
              </tr>
            </thead>
            <tbody>
              {status.data?.map((d) => (
                <tr key={d.id} className="border-t border-ocean-100 dark:border-ocean-800">
                  <td className="px-3 py-2">
                    <DataSourceBadge source={d.source_name} />
                  </td>
                  <td className="px-3 py-2">{d.dataset_type}</td>
                  <td className="px-3 py-2">{d.last_synced_at ? new Date(d.last_synced_at).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2">{d.record_count ?? '—'}</td>
                  <td className="px-3 py-2">{d.license ?? '—'}</td>
                  <td className="px-3 py-2 text-ocean-500">
                    {d.last_cleaning_notes ?? 'Data Integration & Cleaning Agent not wired up yet (Phase 5).'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
