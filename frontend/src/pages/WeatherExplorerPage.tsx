import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { MapView } from '@/components/MapView'
import { TimeSeriesChart } from '@/components/TimeSeriesChart'
import { weatherForecastApi } from '@/api/weather'
import { useWeatherObservations } from '@/hooks/useWeatherData'
import { placeName, tDynamic } from '@/i18n/dynamic'
import { describeError } from '@/i18n/errors'
import { useFormat } from '@/i18n/format'

/** Rough emoji for a WMO condition string — enough to scan a 7-day strip.
 *  Keyed off the backend's English description, which is stable. */
function icon(condition: string): string {
  const c = condition.toLowerCase()
  if (c.includes('thunder')) return '⛈️'
  if (c.includes('snow')) return '🌨️'
  if (c.includes('shower')) return '🌦️'
  if (c.includes('rain') || c.includes('drizzle')) return '🌧️'
  if (c.includes('fog')) return '🌫️'
  if (c.includes('overcast')) return '☁️'
  if (c.includes('cloud')) return '⛅'
  return '☀️'
}

const hhmm = (iso: string) => iso.slice(11, 16)

/** WMO code → condition in the active language; the backend's English
 *  description stands in for any code the dictionary lacks. */
function conditionText(code: number | null | undefined, english: string): string {
  return code === null || code === undefined ? english : tDynamic(`weather.codes.${code}`, english)
}

export function WeatherExplorerPage() {
  const { t } = useTranslation()
  const fmt = useFormat()
  // §3a: all coastal states are shown by default; Kerala, Goa & Odisha are
  // the platform's priority states and stay one click away via the checkbox.
  const [priorityOnly, setPriorityOnly] = useState(false)
  const [stationId, setStationId] = useState<number>()

  const stations = useQuery({
    queryKey: ['weather', 'stations', priorityOnly],
    queryFn: () => weatherForecastApi.stations(priorityOnly),
  })

  useEffect(() => {
    const list = stations.data
    if (list?.length && !list.some((s) => s.station_id === stationId)) {
      setStationId(list[0].station_id)
    }
  }, [stations.data, stationId])

  const forecast = useQuery({
    queryKey: ['weather', 'forecast', stationId],
    queryFn: () => weatherForecastApi.forecast(stationId as number),
    enabled: stationId !== undefined,
    retry: false,
  })

  const selected = stations.data?.find((s) => s.station_id === stationId)
  const history = useWeatherObservations({ region: selected?.region, limit: 120 })

  const cur = forecast.data?.current
  const historyData = (history.data?.items ?? [])
    .slice()
    .reverse()
    .map((o) => ({ date: fmt.date(o.obs_date), temp_max_c: o.temp_max_c, temp_min_c: o.temp_min_c }))
  const compass = (point: string | null | undefined) => (point ? tDynamic(`weather.compass.${point}`, point) : '')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.weather.title')}</h1>
        <p className="text-sm text-ocean-500">{t('pages.weather.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ocean-500">
          {t('weather.station')}
          <select
            value={stationId ?? ''}
            onChange={(e) => setStationId(Number(e.target.value))}
            className="rounded-md border border-ocean-300 px-3 py-2 text-sm text-ocean-950 dark:border-ocean-700 dark:bg-ocean-900 dark:text-ocean-50"
          >
            {stations.data?.map((s) => (
              <option key={s.station_id} value={s.station_id}>
                {placeName(s.name)} — {placeName(s.region)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-ocean-600 dark:text-ocean-300">
          <input type="checkbox" checked={priorityOnly} onChange={(e) => setPriorityOnly(e.target.checked)} />
          {t('weather.priorityOnly')}
        </label>
      </div>

      {forecast.isLoading ? (
        <LoadingRows rows={4} />
      ) : forecast.error ? (
        // Forecast is a live outbound call; the historical chart below still
        // renders from the database when it fails.
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {t('weather.unavailable', { message: describeError(forecast.error) })}
        </p>
      ) : cur ? (
        <>
          <div className="rounded-lg border border-ocean-200 p-5 dark:border-ocean-800">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm text-ocean-500">
                  {placeName(selected?.name)}, {placeName(selected?.region)}
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl font-light text-ocean-950 dark:text-ocean-50">
                    {cur.temperature_c != null ? fmt.fixed(cur.temperature_c, 1) : '—'}°
                  </span>
                  <span className="text-2xl">{icon(cur.condition)}</span>
                  <span className="text-sm text-ocean-600 dark:text-ocean-300">
                    {conditionText(cur.weather_code, cur.condition)}
                  </span>
                </div>
                <div className="text-sm text-ocean-500">
                  {t('weather.feelsLike', { value: cur.feels_like_c != null ? fmt.fixed(cur.feels_like_c, 1) : '—' })}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
                <Metric label={t('weather.humidity')} value={cur.humidity_pct != null ? `${fmt.int(cur.humidity_pct)}%` : '—'} />
                <Metric
                  label={t('weather.wind')}
                  value={
                    cur.wind_speed_kmh != null
                      ? `${fmt.num(cur.wind_speed_kmh, 1)} ${t('weather.units.kmh')} ${compass(cur.wind_compass)}`
                      : '—'
                  }
                />
                <Metric
                  label={t('weather.rainNow')}
                  value={cur.precipitation_mm != null ? `${fmt.num(cur.precipitation_mm, 1)} ${t('weather.units.mm')}` : '—'}
                />
                <Metric
                  label={t('weather.pressure')}
                  value={cur.pressure_hpa != null ? `${fmt.int(cur.pressure_hpa)} hPa` : '—'}
                />
                {/* Upstream has no "current UV"; only a daily peak. Labelled
                    as today's max rather than passed off as right now. */}
                <Metric
                  label={t('weather.uvToday')}
                  value={cur.uv_index_max_today != null ? fmt.fixed(cur.uv_index_max_today, 1) : '—'}
                />
                <Metric
                  label={t('weather.sun')}
                  value={
                    forecast.data?.daily?.[0]
                      ? `${hhmm(forecast.data.daily[0].sunrise)} – ${hhmm(forecast.data.daily[0].sunset)}`
                      : '—'
                  }
                />
              </dl>
            </div>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ocean-700 dark:text-ocean-200">{t('weather.next24')}</h2>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {forecast.data?.hourly.map((h) => (
                <div
                  key={h.time}
                  title={conditionText(h.weather_code, h.condition)}
                  className="flex min-w-[68px] flex-col items-center gap-1 rounded-md border border-ocean-200 px-2 py-2 text-xs dark:border-ocean-800"
                >
                  <span className="text-ocean-500">{hhmm(h.time)}</span>
                  <span className="text-lg">{icon(h.condition)}</span>
                  <span className="font-medium text-ocean-950 dark:text-ocean-50">
                    {h.temperature_c != null ? fmt.int(h.temperature_c) : '—'}°
                  </span>
                  <span className="text-ocean-500" title={t('weather.rainChance')}>
                    {fmt.int(h.precipitation_probability_pct ?? 0)}%
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-ocean-700 dark:text-ocean-200">{t('weather.next7')}</h2>
            <ul className="flex flex-col gap-1">
              {forecast.data?.daily.map((d) => (
                <li
                  key={d.date}
                  className="grid grid-cols-[3.5rem_2rem_1fr_6rem_5rem] items-center gap-2 rounded-md border border-ocean-200 px-3 py-2 text-sm dark:border-ocean-800"
                >
                  <span className="text-ocean-500">{fmt.weekday(d.date)}</span>
                  <span>{icon(d.condition)}</span>
                  <span className="truncate text-ocean-600 dark:text-ocean-300">
                    {conditionText(d.weather_code, d.condition)}
                  </span>
                  <span className="text-ocean-500">
                    {t('weather.rainPct', { value: fmt.int(d.precipitation_probability_pct ?? 0) })}
                  </span>
                  <span className="text-right font-medium text-ocean-950 dark:text-ocean-50">
                    {d.temp_min_c != null ? fmt.int(d.temp_min_c) : '—'}° / {d.temp_max_c != null ? fmt.int(d.temp_max_c) : '—'}°
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* The backend's source/not-available strings are fixed English;
              the same facts are rendered from the dictionary instead. */}
          <p className="text-xs text-ocean-500">{t('weather.sourceNote')}</p>
        </>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ocean-700 dark:text-ocean-200">{t('weather.mapTitle')}</h2>
        <MapView
          height={320}
          cluster={false}
          markers={(stations.data ?? []).map((s) => ({
            id: s.station_id,
            lat: s.lat,
            lon: s.lon,
            kind: 'coastal-anchor' as const,
            title: `${placeName(s.name)}, ${placeName(s.region)}`,
            popup: (
              <button className="text-xs underline" onClick={() => setStationId(s.station_id)}>
                {t('weather.showForecastFor', { name: placeName(s.name) })}
              </button>
            ),
          }))}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ocean-700 dark:text-ocean-200">
          {t('weather.historyTitle', { region: selected?.region ? placeName(selected.region) : t('weather.allRegions') })}
        </h2>
        {history.isLoading ? (
          <LoadingRows rows={3} />
        ) : (
          <TimeSeriesChart
            data={historyData}
            xKey="date"
            yUnit="°C"
            series={[
              { key: 'temp_max_c', label: t('weather.maxTemp') },
              { key: 'temp_min_c', label: t('weather.minTemp') },
            ]}
          />
        )}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-ocean-500">{label}</dt>
      <dd className="text-ocean-900 dark:text-ocean-100">{value}</dd>
    </div>
  )
}
