import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AnomalyBadge } from '@/components/AnomalyBadge'
import { RecommendationPanel } from '@/components/RecommendationPanel'
import { analyticsApi } from '@/api/analytics'
import { ApiError } from '@/api/client'

export function RiskAlertsPage() {
  const { t } = useTranslation()
  const anomalies = useQuery({
    queryKey: ['analytics', 'anomalies'],
    queryFn: () => analyticsApi.anomalies(),
    retry: false,
  })
  const decline = useQuery({
    queryKey: ['analytics', 'catch-decline'],
    queryFn: () => analyticsApi.catchDecline(20),
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
          Anomaly detection is temporarily unavailable from the server.
        </div>
      ) : anomalies.isLoading ? (
        <p className="text-sm text-ocean-500">Loading…</p>
      ) : anomalies.data && anomalies.data.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {anomalies.data.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-lg border border-ocean-200 p-3 text-sm dark:border-ocean-800">
              <div className="flex items-center justify-between">
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
              </div>
              <RecommendationPanel targetId={a.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ocean-500">No anomalies detected.</p>
      )}

      <div>
        <h2 className="mb-1 text-sm font-semibold text-ocean-700 dark:text-ocean-200">Declining species</h2>
        <p className="mb-2 text-xs text-ocean-500">
          Species whose reported catch has been trending down over the last decade of record — a slow trend, not a
          point-in-time spike like the alerts above.
        </p>
        {decline.isLoading ? (
          <p className="text-sm text-ocean-500">Loading…</p>
        ) : decline.data && decline.data.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {decline.data.map((d) => (
              <li
                key={d.species_id}
                className="flex items-center justify-between rounded-lg border border-ocean-200 p-3 text-sm dark:border-ocean-800"
              >
                <span className="flex flex-col">
                  <span>
                    {d.common_name ?? <em>{d.scientific_name}</em>}
                    {d.common_name && d.scientific_name && (
                      <span className="text-ocean-500"> ({d.scientific_name})</span>
                    )}
                  </span>
                  <span className="text-xs text-ocean-500">
                    Down about {Math.abs(d.pct_per_year).toFixed(1)}% a year, over {d.n_years} years
                  </span>
                </span>
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  {d.slope_tonnes_per_year.toFixed(1)} t/yr
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ocean-500">No declining trend detected in the catch record.</p>
        )}
      </div>
    </div>
  )
}
