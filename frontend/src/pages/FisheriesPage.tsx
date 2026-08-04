import { DataSourceBadge } from '@/components/DataSourceBadge'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { TimeSeriesChart } from '@/components/TimeSeriesChart'
import { useFisheriesSummary } from '@/hooks/useFisheriesData'

export function FisheriesPage() {
  const summary = useFisheriesSummary()

  const chartData = (summary.data?.national_totals ?? []).map((t) => ({
    year: String(t.year),
    catch_metric_tons: t.catch_metric_tons,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">Fisheries Insights</h1>
        <p className="text-sm text-ocean-500">India, national annual capture production (FAO via Our World in Data).</p>
      </div>

      {summary.isLoading ? (
        <LoadingRows rows={4} />
      ) : (
        <>
          <TimeSeriesChart data={chartData} xKey="year" yUnit="t" series={[{ key: 'catch_metric_tons', label: 'Catch (metric tons)' }]} />
          <div className="flex flex-wrap gap-1">
            {[...new Set((summary.data?.national_totals ?? []).map((t) => t.source))].map((s) => (
              <DataSourceBadge key={s} source={s} />
            ))}
          </div>
        </>
      )}

      <div className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
        <h2 className="mb-1 font-semibold text-ocean-700 dark:text-ocean-200">Region / species-level catch</h2>
        <p className="text-ocean-500">{summary.data?.granular_catch_note}</p>
      </div>

      <div className="rounded-lg border border-dashed border-ocean-300 p-4 text-sm text-ocean-500 dark:border-ocean-700">
        Catch prediction (Phase 4, /api/analytics/predict/catch) isn't implemented yet — this panel will show a
        forecast with feature attribution once the prediction model lands.
      </div>
    </div>
  )
}
