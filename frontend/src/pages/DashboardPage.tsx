import { KPITile } from '@/components/KPITile'
import { MapView } from '@/components/MapView'
import { useFisheriesSummary } from '@/hooks/useFisheriesData'
import { useMolecularRecords } from '@/hooks/useMolecularData'
import { useOceanReadingsSummary, useOceanStations } from '@/hooks/useOceanData'
import { useSpeciesList } from '@/hooks/useSpeciesData'
import { useWeatherObservations } from '@/hooks/useWeatherData'

export function DashboardPage() {
  const stations = useOceanStations({ limit: 500 })
  const sstSummary = useOceanReadingsSummary('sst')
  const species = useSpeciesList({ limit: 1 })
  const molecular = useMolecularRecords({ limit: 1 })
  const weather = useWeatherObservations({ limit: 1 })
  const fisheries = useFisheriesSummary()

  const latestCatch = fisheries.data?.national_totals.at(-1)
  const avgSst = sstSummary.data?.[0]?.avg_value

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">Dashboard</h1>
        <p className="text-sm text-ocean-500">Overview across all six data domains</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KPITile label="Ocean stations" value={stations.data?.total} loading={stations.isLoading} />
        <KPITile
          label="Avg SST"
          value={avgSst !== undefined && avgSst !== null ? avgSst.toFixed(1) : undefined}
          unit="°C"
          loading={sstSummary.isLoading}
        />
        <KPITile label="Species catalogued" value={species.data?.total} loading={species.isLoading} />
        <KPITile label="Molecular records" value={molecular.data?.total} loading={molecular.isLoading} />
        <KPITile label="Weather observations" value={weather.data?.total} loading={weather.isLoading} />
        <KPITile
          label="Latest annual catch"
          value={latestCatch ? Math.round(latestCatch.catch_metric_tons).toLocaleString() : undefined}
          unit={latestCatch ? `t (${latestCatch.year})` : undefined}
          loading={fisheries.isLoading}
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ocean-700 dark:text-ocean-200">
          Station & sensor coverage
        </h2>
        <MapView
          markers={(stations.data?.items ?? []).map((s) => ({
            id: s.station_id,
            lat: s.lat,
            lon: s.lon,
            colorClass:
              s.station_type === 'in-situ-buoy'
                ? 'bg-kelp-500'
                : s.station_type === 'coastal-anchor'
                  ? 'bg-coral-500'
                  : 'bg-ocean-500',
            popup: (
              <div className="text-xs">
                <div className="font-semibold">{s.name ?? `Grid cell ${s.station_id}`}</div>
                <div>{s.station_type}</div>
              </div>
            ),
          }))}
          height={420}
        />
      </div>
    </div>
  )
}
