import { useState } from 'react'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { FilterField, FilterSidebar } from '@/components/FilterSidebar'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { TimeSeriesChart } from '@/components/TimeSeriesChart'
import { useWeatherObservations } from '@/hooks/useWeatherData'

export function WeatherExplorerPage() {
  const [region, setRegion] = useState('')
  const observations = useWeatherObservations({ region: region || undefined, limit: 200 })

  const chartData = [...(observations.data?.items ?? [])]
    .reverse()
    .map((o) => ({ date: o.obs_date, temp_max_c: o.temp_max_c, temp_min_c: o.temp_min_c }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">Weather Explorer</h1>
        <p className="text-sm text-ocean-500">18 coastal anchor points, Open-Meteo Historical Weather API.</p>
      </div>

      <div className="flex gap-6">
        <FilterSidebar>
          <FilterField label="Region">
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g. Kerala"
              className="rounded-md border border-ocean-300 px-2 py-1.5 text-sm dark:border-ocean-700 dark:bg-ocean-950"
            />
          </FilterField>
          <p className="text-xs text-ocean-500">{observations.data?.total ?? 0} observations matched</p>
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          {observations.isLoading ? (
            <LoadingRows rows={4} />
          ) : chartData.length > 0 ? (
            <TimeSeriesChart
              data={chartData}
              xKey="date"
              yUnit="°C"
              series={[
                { key: 'temp_max_c', label: 'Max temp' },
                { key: 'temp_min_c', label: 'Min temp' },
              ]}
            />
          ) : (
            <p className="text-sm text-ocean-500">No observations matched — try clearing the region filter.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {[...new Set((observations.data?.items ?? []).map((o) => o.source))].map((s) => (
              <DataSourceBadge key={s} source={s} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
