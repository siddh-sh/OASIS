import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { FilterField, FilterSidebar } from '@/components/FilterSidebar'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { MapView, type StationKind } from '@/components/MapView'
import { TimeSeriesChart } from '@/components/TimeSeriesChart'
import { analyticsApi } from '@/api/analytics'
import { ApiError } from '@/api/client'
import { oceanApi } from '@/api/ocean'
import { regionsApi } from '@/api/regions'
import { useOceanReadings, useOceanStations } from '@/hooks/useOceanData'
import type { StationType } from '@/types/api'

const FORECASTABLE_VARIABLES = [
  { value: 'sst', label: 'Sea surface temperature' },
  { value: 'chlorophyll_a', label: 'Chlorophyll-a' },
] as const

export function OceanExplorerPage() {
  const { t } = useTranslation()
  const [stationType, setStationType] = useState<StationType | ''>('')
  const [selectedStation, setSelectedStation] = useState<number>()
  const [forecastVariable, setForecastVariable] = useState<'sst' | 'chlorophyll_a'>('sst')
  const [horizon, setHorizon] = useState(3)

  const stations = useOceanStations({ station_type: stationType || undefined, limit: 500 })
  const readings = useOceanReadings({ station_id: selectedStation, limit: 200 })
  // One bulk request for the whole filtered set rather than per-marker —
  // see the backend endpoint's own docstring for why (hundreds of
  // satellite-grid cells, hover needs to be instant).
  const latestReadings = useQuery({
    queryKey: ['ocean', 'latest-readings', stationType],
    queryFn: () => oceanApi.latestReadings({ station_type: stationType || undefined }),
  })
  // Static reference data (12 rows, never changes mid-session) — fetched
  // once and left to React Query's default caching rather than refetched
  // per filter change.
  const regions = useQuery({
    queryKey: ['regions', 'list'],
    queryFn: () => regionsApi.list(),
    staleTime: Infinity,
  })
  const readingByStation = new Map((latestReadings.data ?? []).map((r) => [r.station_id, r]))
  const regionNameById = new Map((regions.data ?? []).map((r) => [r.region_id, r.name]))
  const forecast = useQuery({
    queryKey: ['analytics', 'forecast', selectedStation, forecastVariable, horizon],
    queryFn: () =>
      analyticsApi.forecastOcean({ station_id: selectedStation as number, variable: forecastVariable, horizon }),
    enabled: selectedStation !== undefined,
    retry: false,
  })
  const forecastUnavailable = forecast.error instanceof ApiError && forecast.error.status === 404

  const chartData = [...(readings.data?.items ?? [])]
    .reverse()
    .map((r) => ({
      date: new Date(r.timestamp).toLocaleDateString(),
      sst: r.sst,
      chlorophyll_a: r.chlorophyll_a,
    }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.ocean.title')}</h1>
        <p className="text-sm text-ocean-500">{t('pages.ocean.subtitle')}</p>
      </div>

      <div className="flex gap-6">
        <FilterSidebar>
          <FilterField label="Station type">
            <select
              value={stationType}
              onChange={(e) => setStationType(e.target.value as StationType | '')}
              className="rounded-md border border-ocean-300 px-2 py-1.5 text-sm dark:border-ocean-700 dark:bg-ocean-950"
            >
              <option value="">All</option>
              <option value="coastal-anchor">Coastal anchor</option>
              <option value="in-situ-buoy">In-situ buoy</option>
              <option value="satellite-grid">Satellite grid</option>
            </select>
          </FilterField>
          <p className="text-xs text-ocean-500">{stations.data?.total ?? 0} stations matched</p>
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          <MapView
            legend
            markers={(stations.data?.items ?? []).map((s) => {
              const name = s.name ?? `Station #${s.station_id}`
              const region = s.region_id !== null ? regionNameById.get(s.region_id) : undefined
              const reading = readingByStation.get(s.station_id)

              // Built incrementally so a station with only SST (no
              // chlorophyll, or vice versa — the two satellite grids don't
              // overlap, see data-pipeline's loader notes) still shows what
              // it has instead of an empty parenthetical.
              const readingParts: string[] = []
              if (reading?.sst !== null && reading?.sst !== undefined) readingParts.push(`SST ${reading.sst.toFixed(1)}°C`)
              if (reading?.chlorophyll_a !== null && reading?.chlorophyll_a !== undefined) {
                readingParts.push(`Chl-a ${reading.chlorophyll_a.toFixed(2)} mg/m³`)
              }
              const asOf = reading ? ` (as of ${new Date(reading.timestamp).toLocaleDateString()})` : ''

              const titleParts = [name]
              if (region) titleParts.push(region)
              if (readingParts.length > 0) titleParts.push(readingParts.join(', ') + asOf)
              if (s.station_id === selectedStation) titleParts.push('selected')

              return {
                id: s.station_id,
                lat: s.lat,
                lon: s.lon,
                kind: s.station_type as StationKind,
                title: titleParts.join(' — '),
                popup: (
                  <button className="text-xs font-medium underline" onClick={() => setSelectedStation(s.station_id)}>
                    {name} — view readings
                  </button>
                ),
              }
            })}
            height={380}
          />
        </div>
      </div>

      {selectedStation && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-ocean-700 dark:text-ocean-200">
            Station #{selectedStation} readings
          </h2>
          {readings.isLoading ? (
            <LoadingRows rows={3} />
          ) : chartData.length > 0 ? (
            <TimeSeriesChart
              data={chartData}
              xKey="date"
              series={[
                { key: 'sst', label: 'SST (°C)' },
                { key: 'chlorophyll_a', label: 'Chlorophyll-a (mg/m³)' },
              ]}
            />
          ) : (
            <p className="text-sm text-ocean-500">No readings for this station in range.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {[...new Set((readings.data?.items ?? []).map((r) => r.source))].map((s) => (
              <DataSourceBadge key={s} source={s} />
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-ocean-200 p-4 dark:border-ocean-800">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-sm font-semibold text-ocean-700 dark:text-ocean-200">Short-term forecast</h2>
              <div className="flex gap-2">
                <label className="flex flex-col gap-1 text-xs text-ocean-500">
                  Variable
                  <select
                    value={forecastVariable}
                    onChange={(e) => setForecastVariable(e.target.value as 'sst' | 'chlorophyll_a')}
                    className="rounded-md border border-ocean-300 px-2 py-1 text-sm dark:border-ocean-700 dark:bg-ocean-950"
                  >
                    {FORECASTABLE_VARIABLES.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-ocean-500">
                  Steps ahead
                  <select
                    value={horizon}
                    onChange={(e) => setHorizon(Number(e.target.value))}
                    className="rounded-md border border-ocean-300 px-2 py-1 text-sm dark:border-ocean-700 dark:bg-ocean-950"
                  >
                    {[1, 3, 5, 10].map((h) => (
                      <option key={h} value={h}>
                        {h} (×8 days)
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {forecast.isLoading ? (
              <LoadingRows rows={2} />
            ) : forecastUnavailable ? (
              <p className="text-sm text-ocean-500">
                No usable {forecastVariable === 'sst' ? 'SST' : 'chlorophyll'} history for this station — satellite
                chlorophyll in particular covers fewer stations than SST.
              </p>
            ) : forecast.data ? (
              <div className="flex flex-col gap-3">
                <ul className="flex flex-wrap gap-2">
                  {forecast.data.points.map((p) => (
                    <li
                      key={p.step}
                      className="flex flex-col items-center gap-1 rounded-md border border-ocean-200 px-3 py-2 text-xs dark:border-ocean-800"
                    >
                      <span className="text-ocean-500">{new Date(p.timestamp).toLocaleDateString()}</span>
                      <span className="font-medium text-ocean-950 dark:text-ocean-50">
                        {p.predicted_value.toFixed(2)}
                        {forecastVariable === 'sst' ? '°C' : ' mg/m³'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ocean-500">
                  Model skill vs. a no-change baseline:{' '}
                  {(forecast.data.skill.skill_vs_persistence * 100).toFixed(0)}%
                  {forecast.data.skill.skill_vs_persistence <= 0.1 &&
                    ' — barely better than assuming tomorrow looks like today; read these numbers loosely.'}{' '}
                  Each step compounds the last, so the further right, the less to trust it.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
