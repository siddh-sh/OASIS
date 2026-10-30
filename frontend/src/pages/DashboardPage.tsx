import { useTranslation } from 'react-i18next'
import { KPITile } from '@/components/KPITile'
import { MapView, type StationKind } from '@/components/MapView'
import { OceanGlobe } from '@/components/ocean/OceanGlobe'
import { AnchorIcon, DnaIcon, FishIcon, RadarIcon, ThermometerIcon, WeatherIcon } from '@/components/ocean/icons'
import { useAuth } from '@/hooks/useAuth'
import { useFisheriesSummary } from '@/hooks/useFisheriesData'
import { useMolecularRecords } from '@/hooks/useMolecularData'
import { useOceanReadingsSummary, useOceanStations } from '@/hooks/useOceanData'
import { useSpeciesList } from '@/hooks/useSpeciesData'
import { useWeatherObservations } from '@/hooks/useWeatherData'
import { placeName } from '@/i18n/dynamic'
import { useFormat } from '@/i18n/format'

export function DashboardPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const fmt = useFormat()
  const stations = useOceanStations({ limit: 500 })
  const sstSummary = useOceanReadingsSummary('sst')
  const species = useSpeciesList({ limit: 1 })
  const molecular = useMolecularRecords({ limit: 1 })
  const weather = useWeatherObservations({ limit: 1 })
  const fisheries = useFisheriesSummary()

  const catchSeries = fisheries.data?.national_totals ?? []
  const latestCatch = catchSeries.at(-1)
  const avgSst = sstSummary.data?.[0]?.avg_value
  const firstName = profile?.full_name?.split(' ')[0]

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome strip */}
      <section className="glass-panel animate-rise relative flex items-center gap-6 overflow-hidden px-6 py-6 sm:px-8">
        <div aria-hidden className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(closest-side_at_80%_50%,rgba(22,217,208,0.14),transparent)]" />
        <div className="relative min-w-0 flex-1">
          <p className="eyebrow-label">{t('pages.dashboard.title')}</p>
          <h1 className="font-display mt-2 text-3xl leading-tight font-medium text-foam sm:text-4xl">
            {t('login.welcomeBack')}
            {firstName && <span className="text-ocean-gradient">, <span translate="no">{firstName}</span></span>}
          </h1>
          <p className="mt-2 text-sm text-mist">{t('pages.dashboard.subtitle')}</p>
        </div>
        <OceanGlobe size={112} className="relative hidden shrink-0 sm:block" />
      </section>

      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        <KPITile index={0} icon={<RadarIcon />} label={t('dashboard.kpi.oceanStations')} value={stations.data?.total} format={fmt.int} loading={stations.isLoading} />
        <KPITile
          index={1}
          icon={<ThermometerIcon />}
          label={t('dashboard.kpi.avgSst')}
          value={avgSst ?? undefined}
          format={(n) => fmt.fixed(n, 1)}
          unit="°C"
          loading={sstSummary.isLoading}
        />
        <KPITile index={2} icon={<FishIcon />} label={t('dashboard.kpi.species')} value={species.data?.total} format={fmt.int} loading={species.isLoading} />
        <KPITile index={3} icon={<DnaIcon />} label={t('dashboard.kpi.molecular')} value={molecular.data?.total} format={fmt.int} loading={molecular.isLoading} />
        <KPITile index={4} icon={<WeatherIcon />} label={t('dashboard.kpi.weather')} value={weather.data?.total} format={fmt.int} loading={weather.isLoading} />
        <KPITile
          index={5}
          icon={<AnchorIcon />}
          label={t('dashboard.kpi.latestCatch')}
          value={latestCatch ? Math.round(latestCatch.catch_metric_tons) : undefined}
          format={fmt.int}
          unit={latestCatch ? 't' : undefined}
          hint={latestCatch ? `${latestCatch.year} · FAO` : undefined}
          trend={catchSeries.slice(-25).map((r) => r.catch_metric_tons)}
          loading={fisheries.isLoading}
        />
      </div>

      <section className="glass-panel animate-rise p-3 sm:p-4" style={{ ['--i' as string]: 6 }}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold text-foam">{t('dashboard.mapTitle')}</h2>
          {stations.data && (
            <span className="text-xs text-mist">{t('dashboard.stationCount', { count: stations.data.total, formatted: fmt.int(stations.data.total) })}</span>
          )}
        </div>
        <MapView
          legend
          markers={(stations.data?.items ?? []).map((s) => ({
            id: s.station_id,
            lat: s.lat,
            lon: s.lon,
            kind: s.station_type as StationKind,
            title: s.name ? placeName(s.name) : t('map.gridCell', { id: s.station_id }),
            // MapView already renders the title and coordinates; this only
            // adds what it doesn't know about.
            popup: <div className="text-xs">{t(`map.kind.${s.station_type as StationKind}`)}</div>,
          }))}
          height={460}
        />
      </section>
    </div>
  )
}
