import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { FilterField, FilterSidebar } from '@/components/FilterSidebar'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { MapView, type StationKind } from '@/components/MapView'
import { TimeSeriesChart } from '@/components/TimeSeriesChart'
import { useOceanReadings, useOceanStations } from '@/hooks/useOceanData'
import type { StationType } from '@/types/api'

export function OceanExplorerPage() {
  const { t } = useTranslation()
  const [stationType, setStationType] = useState<StationType | ''>('')
  const [selectedStation, setSelectedStation] = useState<number>()

  const stations = useOceanStations({ station_type: stationType || undefined, limit: 500 })
  const readings = useOceanReadings({ station_id: selectedStation, limit: 200 })

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
            markers={(stations.data?.items ?? []).map((s) => ({
              id: s.station_id,
              lat: s.lat,
              lon: s.lon,
              kind: s.station_type as StationKind,
              title:
                (s.name ?? `Station #${s.station_id}`) +
                (s.station_id === selectedStation ? ' (selected)' : ''),
              popup: (
                <button className="text-xs font-medium underline" onClick={() => setSelectedStation(s.station_id)}>
                  {s.name ?? `Station #${s.station_id}`} — view readings
                </button>
              ),
            }))}
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
        </div>
      )}
    </div>
  )
}
