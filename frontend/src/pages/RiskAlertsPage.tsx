import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AnomalyBadge } from '@/components/AnomalyBadge'
import { analyticsApi } from '@/api/analytics'
import { ApiError } from '@/api/client'

export function RiskAlertsPage() {
  const { t } = useTranslation()
  const anomalies = useQuery({
    queryKey: ['analytics', 'anomalies'],
    queryFn: () => analyticsApi.anomalies(),
    retry: false,
  })

  const notImplemented = anomalies.error instanceof ApiError && anomalies.error.status === 501

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.alerts.title')}</h1>
        <p className="text-sm text-ocean-500">{t('pages.alerts.subtitle')}</p>
      </div>

      <div className="flex gap-2 text-xs">
        {(['low', 'medium', 'high', 'critical'] as const).map((s) => (
          <AnomalyBadge key={s} severity={s} />
        ))}
      </div>

      {notImplemented ? (
        <div className="rounded-lg border border-dashed border-ocean-300 p-6 text-sm text-ocean-500 dark:border-ocean-700">
          Anomaly detection isn't implemented yet (Phase 4) — this page will list real anomaly_events rows with a
          linked RecommendationCard once the detector and Explainable Recommendation Agent (Phase 5) are live.
        </div>
      ) : anomalies.isLoading ? (
        <p className="text-sm text-ocean-500">Loading…</p>
      ) : anomalies.data && anomalies.data.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {anomalies.data.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-lg border border-ocean-200 p-3 text-sm dark:border-ocean-800">
              <span className="flex flex-col">
                <span>
                  {a.variable} · {new Date(a.detected_at).toLocaleDateString()}
                  {a.station_id !== null && (
                    <span className="text-ocean-500"> · station {a.station_id}</span>
                  )}
                </span>
                {a.metric_value !== null && a.threshold_value !== null && (
                  // Without the observed value and the bar it cleared, every
                  // row reads identically and the severity badge is unfalsifiable.
                  <span className="text-xs text-ocean-500">
                    {a.metric_value.toFixed(2)} vs threshold {a.threshold_value.toFixed(2)}
                  </span>
                )}
              </span>
              <AnomalyBadge severity={a.severity} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ocean-500">No anomalies detected.</p>
      )}
    </div>
  )
}
