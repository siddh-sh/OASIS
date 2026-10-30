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
import { placeName } from '@/i18n/dynamic'
import { useFormat } from '@/i18n/format'
import type { StationType } from '@/types/api'

// Internal values only; labels come from `ocean.variable.<value>`.
const FORECASTABLE_VARIABLES = ['sst', 'chlorophyll_a'] as const
const STATION_TYPES: StationType[] = ['coastal-anchor', 'in-situ-buoy', 'satellite-grid']

export function OceanExplorerPage() {
  const { t } = useTranslation()
  const fmt = useFormat()
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
  const namedStations = (stations.data?.items ?? []).filter((s) => s.name)
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

  const sstLabel = t('ocean.series.sst')
  const chlaLabel = t('ocean.series.chlorophyll_a')
  const chartData = [...(readings.data?.items ?? [])]
    .reverse()
    .map((r) => ({
      date: fmt.date(r.timestamp),
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
          <FilterField label={t('ocean.stationType')}>
            <select
              value={stationType}
              onChange={(e) => setStationType(e.target.value as StationType | '')}
              className="rounded-md border border-ocean-300 px-2 py-1.5 text-sm dark:border-ocean-700 dark:bg-ocean-950"
            >
              <option value="">{t('common.all')}</option>
              {STATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`map.kind.${type}`)}
                </option>
              ))}
            </select>
          </FilterField>
          <p className="text-xs text-ocean-500">
            {t('ocean.stationsMatched', { count: stations.data?.total ?? 0, formatted: fmt.int(stations.data?.total ?? 0) })}
          </p>
          {/* Named stations listed by name: on the map they can sit close
              enough to merge, and a list is quicker to scan than hovering. */}
          {namedStations.length > 0 && (
            <ul className="-mx-1 flex max-h-96 flex-col overflow-y-auto">
              {namedStations.map((s) => (
                <li key={s.station_id}>
                  <button
                    onClick={() => setSelectedStation(s.station_id)}
                    className={
                      s.station_id === selectedStation
                        ? 'w-full rounded-md bg-ocean-600 px-2 py-1 text-left text-sm text-white'
                        : 'w-full rounded-md px-2 py-1 text-left text-sm text-ocean-800 hover:bg-ocean-100 dark:text-ocean-200 dark:hover:bg-ocean-900'
                    }
                  >
                    {placeName(s.name as string)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          <MapView
            legend
            // Group markers only when there are too many to read singly
            // (satellite grid cells); a few dozen stations stay individual.
            cluster={(stations.data?.items.length ?? 0) > 60}
            markers={(stations.data?.items ?? []).map((s) => {
              const name = s.name ? placeName(s.name) : t('ocean.stationNumber', { id: s.station_id })
              const region = s.region_id !== null ? regionNameById.get(s.region_id) : undefined
              const reading = readingByStation.get(s.station_id)

              // Built incrementally so a station with only SST (no
              // chlorophyll, or vice versa — the two satellite grids don't
              // overlap, see data-pipeline's loader notes) still shows what
              // it has instead of an empty parenthetical.
              const readingParts: string[] = []
              if (reading?.sst !== null && reading?.sst !== undefined) {
                readingParts.push(t('ocean.hover.sst', { value: fmt.fixed(reading.sst, 1) }))
              }
              if (reading?.chlorophyll_a !== null && reading?.chlorophyll_a !== undefined) {
                readingParts.push(t('ocean.hover.chlorophyll', { value: fmt.fixed(reading.chlorophyll_a, 2) }))
              }
              const asOf = reading ? ` (${t('ocean.hover.asOf', { date: fmt.date(reading.timestamp) })})` : ''

              const titleParts = [name]
              if (region) titleParts.push(placeName(region))
              if (readingParts.length > 0) titleParts.push(readingParts.join(', ') + asOf)
              if (s.station_id === selectedStation) titleParts.push(t('ocean.hover.selected'))

              return {
                id: s.station_id,
                lat: s.lat,
                lon: s.lon,
                kind: s.station_type as StationKind,
                title: titleParts.join(' — '),
                popup: (
                  <button className="text-xs font-medium underline" onClick={() => setSelectedStation(s.station_id)}>
                    {t('ocean.viewReadings', { name })}
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
            {t('ocean.readingsTitle', { id: selectedStation })}
          </h2>
          {readings.isLoading ? (
            <LoadingRows rows={3} />
          ) : chartData.length > 0 ? (
            <TimeSeriesChart
              data={chartData}
              xKey="date"
              series={[
                { key: 'sst', label: `${sstLabel} (°C)` },
                { key: 'chlorophyll_a', label: `${chlaLabel} (mg/m³)` },
              ]}
            />
          ) : (
            <p className="text-sm text-ocean-500">{t('ocean.noReadings')}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {[...new Set((readings.data?.items ?? []).map((r) => r.source))].map((s) => (
              <DataSourceBadge key={s} source={s} />
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-ocean-200 p-4 dark:border-ocean-800">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-sm font-semibold text-ocean-700 dark:text-ocean-200">{t('ocean.forecast.title')}</h2>
              <div className="flex gap-2">
                <label className="flex flex-col gap-1 text-xs text-ocean-500">
                  {t('ocean.forecast.variable')}
                  <select
                    value={forecastVariable}
                    onChange={(e) => setForecastVariable(e.target.value as 'sst' | 'chlorophyll_a')}
                    className="rounded-md border border-ocean-300 px-2 py-1 text-sm dark:border-ocean-700 dark:bg-ocean-950"
                  >
                    {FORECASTABLE_VARIABLES.map((v) => (
                      <option key={v} value={v}>
                        {t(`ocean.variable.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-ocean-500">
                  {t('ocean.forecast.stepsAhead')}
                  <select
                    value={horizon}
                    onChange={(e) => setHorizon(Number(e.target.value))}
                    className="rounded-md border border-ocean-300 px-2 py-1 text-sm dark:border-ocean-700 dark:bg-ocean-950"
                  >
                    {[1, 3, 5, 10].map((h) => (
                      <option key={h} value={h}>
                        {t('ocean.forecast.stepOption', { count: h })}
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
                {t('ocean.forecast.noHistory', { variable: t(`ocean.variable.${forecastVariable}`) })}
              </p>
            ) : forecast.data ? (
              <div className="flex flex-col gap-3">
                <ul className="flex flex-wrap gap-2">
                  {forecast.data.points.map((p) => (
                    <li
                      key={p.step}
                      className="flex flex-col items-center gap-1 rounded-md border border-ocean-200 px-3 py-2 text-xs dark:border-ocean-800"
                    >
                      <span className="text-ocean-500">{fmt.date(p.timestamp)}</span>
                      <span className="font-medium text-ocean-950 dark:text-ocean-50">
                        {fmt.fixed(p.predicted_value, 2)}
                        {forecastVariable === 'sst' ? '°C' : ' mg/m³'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ocean-500">
                  {t('common.modelSkill', { value: fmt.int(forecast.data.skill.skill_vs_persistence * 100) })}
                  {forecast.data.skill.skill_vs_persistence <= 0.1 && ` — ${t('ocean.forecast.weakSkill')}`}{' '}
                  {t('ocean.forecast.compounds')}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
