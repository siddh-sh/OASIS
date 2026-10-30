import { useQuery } from '@tanstack/react-query'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { analyticsApi } from '@/api/analytics'
import { useFormat } from '@/i18n/format'
import type { Station } from '@/types/api'
import { formatCount, useNearViewport, usePlatformStats, useReveal } from './hooks'
import { ArrowRight } from './icons'

// Mirrors NavSidebar's entries so the preview reads as the real product.
const NAV = ['dashboard', 'ocean', 'weather', 'species', 'fisheries', 'molecular', 'correlation', 'alerts', 'chatbot'] as const

// Same colours as MapView's STATION_STYLES, so a visitor recognises them later.
const KIND_COLOR: Record<string, string> = {
  'satellite-grid': '#13C7DE',
  'coastal-anchor': '#F59E0B',
  'in-situ-buoy': '#A78BFA',
}

const StationMap = memo(function StationMap({ stations, anomalyIds, label }: { stations: Station[]; anomalyIds: Set<number>; label: string }) {
  // Covers the satellite grid, the coast and the equatorial RAMA buoys.
  const x = (lon: number) => ((lon - 62) / 36) * 360
  const y = (lat: number) => ((26 - lat) / 34) * 240
  return (
    <svg viewBox="0 0 360 240" className="h-full w-full" role="img"
      aria-label={label}>
      {[0, 10, 20].map((lat) => (
        <g key={lat}>
          <line x1="0" x2="360" y1={y(lat)} y2={y(lat)} stroke="rgba(167,243,229,0.08)" strokeDasharray="2 5" />
          <text x="4" y={y(lat) - 3} fill="#5d7d8e" fontSize="7">{lat}°N</text>
        </g>
      ))}
      {[70, 80, 90].map((lon) => (
        <g key={lon}>
          <line y1="0" y2="240" x1={x(lon)} x2={x(lon)} stroke="rgba(167,243,229,0.08)" strokeDasharray="2 5" />
          <text x={x(lon) + 3} y="236" fill="#5d7d8e" fontSize="7">{lon}°E</text>
        </g>
      ))}
      {stations.map((s) => (
        <circle key={s.station_id} cx={x(s.lon)} cy={y(s.lat)} r={s.station_type === 'satellite-grid' ? 1.7 : 3}
          fill={KIND_COLOR[s.station_type] ?? '#9CB6C4'} opacity={s.station_type === 'satellite-grid' ? 0.55 : 0.95} />
      ))}
      {stations.filter((s) => anomalyIds.has(s.station_id)).map((s) => (
        <circle key={`a${s.station_id}`} cx={x(s.lon)} cy={y(s.lat)} r="4.5" fill="none" stroke="#FF6384" strokeWidth="1.1" />
      ))}
    </svg>
  )
})

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-[#0a3b55] bg-[#06283f]/60 p-3">
      <p className="truncate text-[9.5px] font-medium tracking-wide text-[#7cc4dd] uppercase">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-[#e0f3f8]">
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-[#3ba3c7]">{unit}</span>}
      </p>
    </div>
  )
}

export function DashboardPreview() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const stats = usePlatformStats()
  const heading = useReveal()
  const frame = useReveal()
  const { ref, near } = useNearViewport()
  const anomalies = useQuery({
    queryKey: ['home', 'recent-anomalies'],
    queryFn: () => analyticsApi.anomalies({ domain: 'ocean' }),
    enabled: near,
    staleTime: 30 * 60 * 1000,
  })
  // High and critical only: all 100 recent events would bury the map in rings.
  const anomalyIds = new Set(
    (anomalies.data ?? [])
      .filter((a) => a.severity === 'high' || a.severity === 'critical')
      .map((a) => a.station_id)
      .filter((id): id is number => id != null),
  )
  const latest = stats.latestCatch

  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div ref={heading} className="reveal mx-auto max-w-3xl text-center">
          <p className="eyebrow">{t('home.preview.eyebrow')}</p>
          <h2 className="font-display mt-4 text-4xl leading-tight font-medium sm:text-5xl">
            {t('home.preview.title')} <span className="text-gradient">{t('home.preview.accent')}</span>
          </h2>
        </div>

        <div ref={frame} className="reveal relative mt-14">
          <div className="pointer-events-none absolute -inset-x-10 -top-10 -bottom-16 rounded-[48px] bg-[radial-gradient(50%_50%_at_50%_40%,rgba(19,199,222,0.16),transparent)]" aria-hidden />
          <div ref={ref} className="glass relative overflow-hidden rounded-[28px] p-2 sm:p-3">
            <div className="flex items-center gap-1.5 px-3 pt-1 pb-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF6384]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#36E0D0]/70" />
              <span translate="no" className="ml-3 rounded-full bg-black/25 px-3 py-0.5 text-[11px] text-[var(--muted)]">oasis / dashboard</span>
            </div>
            <div className="flex overflow-hidden rounded-2xl border border-[#0a3b55] bg-[#041f2e]">
              <aside className="hidden w-44 shrink-0 border-r border-[#0a3b55] p-3 md:block" aria-hidden>
                <p className="px-2 pb-3 text-sm font-semibold">{t('nav.appName')}</p>
                {NAV.map((n, i) => (
                  <p key={n} className={`truncate rounded-md px-2 py-1.5 text-[11px] ${i === 0 ? 'bg-[#146b8f] text-white' : 'text-[#b7e0ee]/80'}`}>{t(`nav.${n}`)}</p>
                ))}
              </aside>
              <div className="min-w-0 flex-1 p-4 sm:p-5">
                <p className="text-base font-semibold text-[#e0f3f8]">{t('pages.dashboard.title')}</p>
                <p className="text-[11px] text-[#3ba3c7]">{t('home.preview.subtitle')}</p>
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
                  <Tile label={t('dashboard.kpi.oceanStations')} value={formatCount(stats.stationCount)} />
                  <Tile label={t('dashboard.kpi.avgSst')} value={stats.avgSst !== undefined ? fmt.fixed(stats.avgSst, 1) : '—'} unit="°C" />
                  <Tile label={t('dashboard.kpi.species')} value={formatCount(stats.speciesCount)} />
                  <Tile label={t('dashboard.kpi.molecular')} value={formatCount(stats.molecularCount)} />
                  <Tile label={t('dashboard.kpi.weather')} value={formatCount(stats.weatherCount)} />
                  <Tile label={t('dashboard.kpi.latestCatch')} value={latest ? fmt.int(latest.catch_metric_tons) : '—'} unit={latest ? 't' : undefined} />
                </div>
                <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[12px] font-semibold text-[#b7e0ee]">{t('dashboard.mapTitle')}</p>
                  <div className="flex flex-wrap gap-3 text-[10px] text-[#7cc4dd]">
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#13C7DE]" /> {t('home.preview.satellite')}</span>
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#F59E0B]" /> {t('home.preview.coastal')}</span>
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#A78BFA]" /> {t('home.preview.buoy')}</span>
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full border border-[#FF6384]" /> {t('home.preview.anomaly')}</span>
                  </div>
                </div>
                <div className="mt-2 aspect-[3/2] max-h-[380px] w-full rounded-xl border border-[#0a3b55] bg-[#031B2A] p-2 sm:aspect-[2/1]">
                  {stats.stations.data ? (
                    <StationMap stations={stats.stations.data.items} anomalyIds={anomalyIds}
                      label={t('home.preview.mapLabel', { n: formatCount(stats.stations.data.items.length), a: formatCount(anomalyIds.size) })} />
                  ) : (
                    <div className="h-full animate-pulse rounded-lg bg-white/5" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-5 text-center">
          <p className="text-sm text-[var(--muted)]">{t('home.preview.caption')}</p>
          <Link to="/dashboard" data-cursor="primary" className="btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px]">
            {t('home.preview.cta')} <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}
