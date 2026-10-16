import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { RecommendationPanel } from '@/components/RecommendationPanel'
import { analyticsApi } from '@/api/analytics'
import { ApiError } from '@/api/client'
import { fisheriesBreakdownApi } from '@/api/fisheries'

type GroupBy = 'none' | 'species' | 'region'

// Categorical palette; "Other" is deliberately grey so the tail reads as a
// residual rather than as another headline species.
const COLORS = ['#0e7490', '#b45309', '#7c3aed', '#15803d', '#be123c', '#0369a1', '#a16207', '#4d7c0f']
const OTHER_COLOR = '#94a3b8'

export function FisheriesPage() {
  const { t } = useTranslation()
  const [groupBy, setGroupBy] = useState<GroupBy>('species')
  const [regionId, setRegionId] = useState<number>()
  const [speciesId, setSpeciesId] = useState<number>()

  const filters = useQuery({
    queryKey: ['fisheries', 'filters'],
    queryFn: () => fisheriesBreakdownApi.filters(),
  })

  const data = useQuery({
    queryKey: ['fisheries', 'timeseries', groupBy, regionId, speciesId],
    queryFn: () =>
      fisheriesBreakdownApi.timeseries({
        group_by: groupBy,
        region_id: regionId,
        species_id: speciesId,
        top_n: 8,
      }),
  })

  // Recharts wants one row per year with a column per series.
  const series = data.data?.series ?? []
  const years = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.year)))).sort()
  const rows = years.map((year) => {
    const row: Record<string, number | string> = { year: String(year) }
    for (const s of series) row[s.key] = s.points.find((p) => p.year === year)?.tonnes ?? 0
    return row
  })

  // Every number below is computed straight from `rows`/`series` above — the
  // same data the chart draws — rather than written as fixed text, so it
  // stays correct as the Break down by / Region / Species filters change.
  const fmt = (n: number) => Math.round(n).toLocaleString()
  const totalByYear = rows.map((row) => {
    let sum = 0
    for (const s of series) sum += Number(row[s.key] ?? 0)
    return sum
  })
  const firstYear = years[0]
  const lastYear = years[years.length - 1]
  const firstYearTotal = totalByYear[0]
  const lastYearTotal = totalByYear[totalByYear.length - 1]
  const grandTotal = totalByYear.reduce((a, b) => a + b, 0)
  let peakIndex = 0
  for (let i = 1; i < totalByYear.length; i++) if (totalByYear[i] > totalByYear[peakIndex]) peakIndex = i
  const peakYear = years[peakIndex]
  const peakValue = totalByYear[peakIndex]
  const topSeries = series
    .filter((s) => s.key !== 'other' && s.key !== 'total')
    .map((s) => ({ label: s.label, total: s.points.reduce((a, p) => a + p.tonnes, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)

  const prediction = useQuery({
    queryKey: ['analytics', 'predict-catch', speciesId, regionId],
    queryFn: () => analyticsApi.predictCatch({ species_id: speciesId as number, region_id: regionId }),
    enabled: speciesId !== undefined,
    retry: false,
  })
  const predictionUnavailable = prediction.error instanceof ApiError && prediction.error.status === 404

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.fisheries.title')}</h1>
        <p className="text-sm text-ocean-500">{t('pages.fisheries.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ocean-500">
          Break down by
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded-md border border-ocean-300 px-3 py-2 text-sm text-ocean-950 dark:border-ocean-700 dark:bg-ocean-900 dark:text-ocean-50"
          >
            <option value="none">Total only</option>
            <option value="species">Species</option>
            <option value="region">Region (EEZ)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-ocean-500">
          Region
          <select
            value={regionId ?? ''}
            onChange={(e) => setRegionId(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-md border border-ocean-300 px-3 py-2 text-sm text-ocean-950 dark:border-ocean-700 dark:bg-ocean-900 dark:text-ocean-50"
          >
            <option value="">All regions</option>
            {filters.data?.regions.map((r) => (
              <option key={r.region_id} value={r.region_id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-ocean-500">
          Species
          <select
            value={speciesId ?? ''}
            onChange={(e) => setSpeciesId(e.target.value ? Number(e.target.value) : undefined)}
            className="max-w-xs rounded-md border border-ocean-300 px-3 py-2 text-sm text-ocean-950 dark:border-ocean-700 dark:bg-ocean-900 dark:text-ocean-50"
          >
            <option value="">All species</option>
            {/* Ordered by total catch, so the ones that matter are at the top. */}
            {filters.data?.species.map((s) => (
              <option key={s.species_id} value={s.species_id}>
                {s.common_name ?? s.scientific_name} ({s.total_tonnes.toLocaleString()} t)
              </option>
            ))}
          </select>
        </label>

        {(regionId || speciesId) && (
          <button
            onClick={() => {
              setRegionId(undefined)
              setSpeciesId(undefined)
            }}
            className="rounded-md border border-ocean-300 px-3 py-2 text-sm text-ocean-600 dark:border-ocean-700 dark:text-ocean-300"
          >
            Clear filters
          </button>
        )}
      </div>

      {data.isLoading ? (
        <LoadingRows rows={5} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-ocean-500">No catch records match those filters.</p>
      ) : (
        <>
          <div className="h-96 rounded-lg border border-ocean-200 p-4 dark:border-ocean-800">
            <ResponsiveContainer width="100%" height="100%">
              {/* Stacked: the sum is the real total, so the stack height is
                  meaningful rather than an artefact of overlapping lines. */}
              <AreaChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} unit=" t" width={70} />
                <Tooltip
                  formatter={(value, name) => [`${Number(value).toLocaleString()} t`, String(name)]}
                  labelFormatter={(l) => `Year ${l}`}
                  contentStyle={{ borderRadius: 8, border: '1px solid var(--color-ocean-200)', fontSize: 13 }}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {series.map((s, i) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stackId="catch"
                    stroke={s.key === 'other' ? OTHER_COLOR : COLORS[i % COLORS.length]}
                    fill={s.key === 'other' ? OTHER_COLOR : COLORS[i % COLORS.length]}
                    fillOpacity={0.75}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-ocean-500">
            <DataSourceBadge source="SAU" />
            <span>{data.data?.source}</span>
          </div>

          {/* Every figure here is computed from the same data the chart
              draws (see totalByYear/grandTotal/peakYear/topSeries above),
              so it updates automatically with the filters instead of going
              stale next to a chart that changed. */}
          <div className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
            <h2 className="mb-2 font-semibold text-ocean-700 dark:text-ocean-200">What this chart shows</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-ocean-600 dark:text-ocean-300">
              <li>
                Total catch across all {years.length} years ({firstYear}–{lastYear}):{' '}
                <strong>{fmt(grandTotal)} tonnes</strong>.
              </li>
              <li>
                Catch in {firstYear}: <strong>{fmt(firstYearTotal)} t</strong>. Catch in {lastYear}:{' '}
                <strong>{fmt(lastYearTotal)} t</strong> —{' '}
                {firstYearTotal > 0 ? (
                  <>
                    about <strong>{(lastYearTotal / firstYearTotal).toFixed(1)}×</strong> higher over that period.
                  </>
                ) : (
                  'no catch recorded at the very start of the series to compare against.'
                )}
              </li>
              <li>
                Busiest year: <strong>{peakYear}</strong>, with <strong>{fmt(peakValue)} t</strong> caught — the
                tallest point on the chart.
              </li>
              {topSeries.length > 0 && (
                <li>
                  {groupBy === 'species' ? 'Top species' : 'Top region'} by total catch over the whole period:{' '}
                  {topSeries.map((s, i) => (
                    <span key={s.label}>
                      {i > 0 && (i === topSeries.length - 1 ? ', and ' : ', ')}
                      <strong>
                        {s.label} ({fmt(s.total)} t)
                      </strong>
                    </span>
                  ))}
                  .
                </li>
              )}
              <li>
                The chart is <strong>stacked</strong>, so the height at any point on the x-axis is the total catch
                that year — not a comparison of overlapping lines.
              </li>
            </ul>
          </div>
        </>
      )}

      <div className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
        <h2 className="mb-2 font-semibold text-ocean-700 dark:text-ocean-200">Predict next year&rsquo;s catch</h2>
        {speciesId === undefined ? (
          <p className="text-ocean-500">Pick a species above to predict its catch for next year.</p>
        ) : prediction.isLoading ? (
          <LoadingRows rows={2} />
        ) : predictionUnavailable ? (
          <p className="text-ocean-500">
            Not enough history for{' '}
            {filters.data?.species.find((s) => s.species_id === speciesId)?.common_name ?? 'this species'} — the
            model needs at least 6 consecutive annual observations.
          </p>
        ) : prediction.data ? (
          (() => {
            const p = prediction.data
            const delta = p.predicted_tonnes - p.last_observed_tonnes
            const pct = p.last_observed_tonnes > 0 ? (delta / p.last_observed_tonnes) * 100 : null
            return (
              <div className="flex flex-col gap-3">
                <p className="text-ocean-600 dark:text-ocean-300">
                  Predicted catch for <strong>{p.year}</strong>: <strong>{fmt(p.predicted_tonnes)} t</strong>{' '}
                  (last observed: {fmt(p.last_observed_tonnes)} t
                  {pct !== null && (
                    <>
                      , {pct >= 0 ? 'up' : 'down'} about <strong>{Math.abs(pct).toFixed(1)}%</strong>
                    </>
                  )}
                  ).
                </p>
                <p className="text-xs text-ocean-500">
                  Model skill vs. a no-change baseline: {(p.skill.skill_vs_persistence * 100).toFixed(0)}%
                  {p.skill.skill_vs_persistence <= 0.1 && ' — barely better than assuming no change; read this prediction loosely.'}
                </p>
                {p.top_features.length > 0 && (
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-ocean-500">
                    {p.top_features.slice(0, 3).map((f) => (
                      <li key={f.feature}>
                        <strong>{f.feature}</strong> pushed the prediction {f.direction} (contribution{' '}
                        {f.contribution.toFixed(3)}).
                      </li>
                    ))}
                  </ul>
                )}
                <RecommendationPanel targetId={p.prediction_id} />
              </div>
            )
          })()
        ) : null}
      </div>

      <div className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
        <h2 className="mb-1 font-semibold text-ocean-700 dark:text-ocean-200">About this breakdown</h2>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-ocean-500">
          {/* The doc asked for a Kerala/Goa/Odisha split. It isn't available,
              and saying so is better than inventing a state attribution. */}
          <li>
            Region here means <strong>EEZ</strong>, not Indian state — Sea Around Us reports catch by exclusive
            economic zone, so a state-level split (Kerala / Goa / Odisha) is not derivable from this source.
          </li>
          <li>
            Grouping by species charts the eight largest by total catch; the remainder are summed into
            &ldquo;Other&rdquo; so the yearly totals still add up.
          </li>
          <li>
            These are <strong>reconstructed</strong> figures including estimated discards and unreported catch. They
            are not comparable with the FAO reported-landings series and must not be summed with it.
          </li>
        </ul>
      </div>
    </div>
  )
}
