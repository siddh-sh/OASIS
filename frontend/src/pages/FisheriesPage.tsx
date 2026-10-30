import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
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
import { ChartLegend } from '@/components/ChartLegend'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { RecommendationPanel } from '@/components/RecommendationPanel'
import { analyticsApi } from '@/api/analytics'
import { ApiError } from '@/api/client'
import { fisheriesBreakdownApi, type CatchSeries, type CatchSource } from '@/api/fisheries'
import { placeName, tDynamic } from '@/i18n/dynamic'
import { useFormat } from '@/i18n/format'

type GroupBy = 'none' | 'species' | 'region'

// Categorical palette; "Other" is deliberately grey so the tail reads as a
// residual rather than as another headline species.
const COLORS = ['#0e7490', '#b45309', '#7c3aed', '#15803d', '#be123c', '#0369a1', '#a16207', '#4d7c0f']
const OTHER_COLOR = '#94a3b8'
const GROUP_BY: GroupBy[] = ['none', 'species', 'region']
const SOURCES: CatchSource[] = ['FAO', 'SAU']

export function FisheriesPage() {
  const { t, i18n } = useTranslation()
  const fmt = useFormat()
  // Sourced regional names are only stored for the Indian languages.
  const nameLanguage = i18n.language !== 'en' ? i18n.language : undefined
  // FAO by default: it runs to 2024, where Sea Around Us stops at 2019.
  const [source, setSource] = useState<CatchSource>('FAO')
  const [groupBy, setGroupBy] = useState<GroupBy>('species')
  const [regionId, setRegionId] = useState<number>()
  const [speciesId, setSpeciesId] = useState<number>()

  const filters = useQuery({
    queryKey: ['fisheries', 'filters', source, nameLanguage],
    queryFn: () => fisheriesBreakdownApi.filters(source, nameLanguage),
  })

  const data = useQuery({
    queryKey: ['fisheries', 'timeseries', source, groupBy, regionId, speciesId, nameLanguage],
    queryFn: () =>
      fisheriesBreakdownApi.timeseries({
        group_by: groupBy,
        region_id: regionId,
        species_id: speciesId,
        top_n: 8,
        source,
        language: nameLanguage,
      }),
  })

  /** Series names: species/regions are data; the two synthetic series the
   *  backend adds ("total", "other") are translated here. */
  const seriesLabel = (s: CatchSeries) =>
    s.key === 'total'
      ? t('fisheries.chart.total')
      : s.key === 'other'
        ? t('fisheries.chart.other', { count: s.count ?? 0 })
        : groupBy === 'region'
          ? placeName(s.label)
          : (s.vernacular_name ?? s.label)

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
    .map((s) => ({ label: seriesLabel(s), total: s.points.reduce((a, p) => a + p.tonnes, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)

  const prediction = useQuery({
    queryKey: ['analytics', 'predict-catch', source, speciesId, regionId],
    queryFn: () => analyticsApi.predictCatch({ species_id: speciesId as number, region_id: regionId, source }),
    enabled: speciesId !== undefined,
    retry: false,
  })
  const regionName = (id: number) => {
    const name = filters.data?.regions.find((r) => r.region_id === id)?.name
    return name ? placeName(name) : undefined
  }
  const predictionUnavailable = prediction.error instanceof ApiError && prediction.error.status === 404
  const selectedSpecies = filters.data?.species.find((s) => s.species_id === speciesId)
  const selectedSpeciesName =
    selectedSpecies?.vernacular_name ?? selectedSpecies?.common_name ?? t('fisheries.forecast.thisSpecies')
  const selectClass =
    'rounded-md border border-ocean-300 px-3 py-2 text-sm text-ocean-950 dark:border-ocean-700 dark:bg-ocean-900 dark:text-ocean-50'
  const b = <strong />

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.fisheries.title')}</h1>
        <p className="text-sm text-ocean-500">{t('pages.fisheries.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ocean-500">
          {t('fisheries.filters.source')}
          <select
            value={source}
            onChange={(e) => {
              // Region and species ids differ between the two sources, so
              // filters from one would silently match nothing in the other.
              setSource(e.target.value as CatchSource)
              setRegionId(undefined)
              setSpeciesId(undefined)
            }}
            className={selectClass}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`fisheries.sourceOption.${s}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-ocean-500">
          {t('fisheries.filters.groupBy')}
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={selectClass}>
            {GROUP_BY.map((g) => (
              <option key={g} value={g}>
                {g === 'region' ? t(`fisheries.groupBy.region_${source}`) : t(`fisheries.groupBy.${g}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-ocean-500">
          {t('fisheries.filters.region')}
          <select
            value={regionId ?? ''}
            onChange={(e) => setRegionId(e.target.value ? Number(e.target.value) : undefined)}
            className={selectClass}
          >
            <option value="">{t('fisheries.filters.allRegions')}</option>
            {filters.data?.regions.map((r) => (
              <option key={r.region_id} value={r.region_id}>
                {placeName(r.name)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-ocean-500">
          {t('fisheries.filters.species')}
          <select
            value={speciesId ?? ''}
            onChange={(e) => setSpeciesId(e.target.value ? Number(e.target.value) : undefined)}
            className={`max-w-xs ${selectClass}`}
          >
            <option value="">{t('fisheries.filters.allSpecies')}</option>
            {/* Ordered by total catch, so the ones that matter are at the top. */}
            {filters.data?.species.map((s) => (
              // Species names are data: a sourced regional name where one
              // exists, otherwise the English common or scientific name.
              <option key={s.species_id} value={s.species_id} translate="no">
                {s.vernacular_name ?? s.common_name ?? s.scientific_name} ({fmt.int(s.total_tonnes)}{' '}
                {t('common.tonnesShort')})
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
            {t('fisheries.filters.clear')}
          </button>
        )}
      </div>

      {data.isLoading ? (
        <LoadingRows rows={5} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-ocean-500">{t('fisheries.noRecords')}</p>
      ) : (
        <>
          <div className="h-96 rounded-lg border border-ocean-200 p-4 dark:border-ocean-800">
            <ResponsiveContainer width="100%" height="100%">
              {/* Stacked: the sum is the real total, so the stack height is
                  meaningful rather than an artefact of overlapping lines. */}
              <AreaChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${fmt.int(v)} ${t('common.tonnesShort')}`}
                  width={90}
                />
                <Tooltip
                  formatter={(value, name) => [`${fmt.int(Number(value))} ${t('common.tonnesShort')}`, String(name)]}
                  labelFormatter={(l) => t('fisheries.chart.year', { year: l })}
                  contentStyle={{ borderRadius: 8, border: '1px solid var(--color-ocean-200)', fontSize: 13 }}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Legend
                  content={(props) => <ChartLegend payload={props.payload} dataNames={groupBy !== 'none'} />}
                />
                {series.map((s, i) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={seriesLabel(s)}
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
            <DataSourceBadge source={source} />
            <span>{t(`fisheries.citation.${source}`)}</span>
          </div>

          {/* Every figure here is computed from the same data the chart
              draws (see totalByYear/grandTotal/peakYear/topSeries above),
              so it updates automatically with the filters instead of going
              stale next to a chart that changed. */}
          <div className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
            <h2 className="mb-2 font-semibold text-ocean-700 dark:text-ocean-200">{t('fisheries.summary.title')}</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-4 text-ocean-600 dark:text-ocean-300">
              <li>
                <Trans
                  i18nKey="fisheries.summary.total"
                  values={{ count: years.length, first: firstYear, last: lastYear, total: fmt.int(grandTotal) }}
                  components={{ b }}
                />
              </li>
              <li>
                <Trans
                  i18nKey="fisheries.summary.firstLast"
                  values={{
                    first: firstYear,
                    firstTotal: fmt.int(firstYearTotal),
                    last: lastYear,
                    lastTotal: fmt.int(lastYearTotal),
                  }}
                  components={{ b }}
                />{' '}
                {firstYearTotal > 0 ? (
                  <Trans
                    i18nKey={lastYearTotal >= firstYearTotal ? 'fisheries.summary.ratioHigher' : 'fisheries.summary.ratioLower'}
                    values={{
                      ratio: fmt.fixed(
                        lastYearTotal >= firstYearTotal ? lastYearTotal / firstYearTotal : firstYearTotal / lastYearTotal,
                        1,
                      ),
                    }}
                    components={{ b }}
                  />
                ) : (
                  t('fisheries.summary.noStart')
                )}
              </li>
              <li>
                <Trans
                  i18nKey="fisheries.summary.peak"
                  values={{ year: peakYear, value: fmt.int(peakValue) }}
                  components={{ b }}
                />
              </li>
              {topSeries.length > 0 && (
                <li>
                  {groupBy === 'species' ? t('fisheries.summary.topSpecies') : t('fisheries.summary.topRegion')}{' '}
                  {topSeries.map((s, i) => (
                    <span key={s.label}>
                      {i > 0 && (i === topSeries.length - 1 ? t('common.listAnd') : ', ')}
                      <strong>
                        <span translate="no">{s.label}</span> ({fmt.int(s.total)} {t('common.tonnesShort')})
                      </strong>
                    </span>
                  ))}
                  .
                </li>
              )}
              <li>
                <Trans i18nKey="fisheries.summary.stacked" components={{ b }} />
              </li>
            </ul>
          </div>
        </>
      )}

      <div className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
        <h2 className="mb-2 font-semibold text-ocean-700 dark:text-ocean-200">
          {t('fisheries.forecast.title', { year: new Date().getFullYear() + 1 })}
        </h2>
        {speciesId === undefined ? (
          <p className="text-ocean-500">{t('fisheries.forecast.pickSpecies')}</p>
        ) : prediction.isLoading ? (
          <LoadingRows rows={2} />
        ) : predictionUnavailable ? (
          <p className="text-ocean-500">
            <Trans
              i18nKey="fisheries.forecast.notEnoughHistory"
              values={{ name: selectedSpeciesName }}
              components={{ name: <span translate="no" /> }}
            />
          </p>
        ) : prediction.data ? (
          (() => {
            const p = prediction.data
            const delta = p.predicted_tonnes - p.last_observed_tonnes
            const pct = p.last_observed_tonnes > 0 ? (delta / p.last_observed_tonnes) * 100 : null
            const region = regionName(p.region_id)
            return (
              <div className="flex flex-col gap-3">
                <p className="text-ocean-600 dark:text-ocean-300">
                  {/* The model forecasts one region at a time; with "All
                      regions" selected the API picks the first, so name it. */}
                  <Trans
                    i18nKey={region ? 'fisheries.forecast.resultIn' : 'fisheries.forecast.result'}
                    values={{
                      year: p.year,
                      region,
                      value: fmt.int(p.predicted_tonnes),
                      last: fmt.int(p.last_observed_tonnes),
                      lastYear: p.last_observed_year,
                    }}
                    components={{ b }}
                  />
                  {pct !== null && (
                    <>
                      {' '}
                      <Trans
                        i18nKey={pct >= 0 ? 'fisheries.forecast.up' : 'fisheries.forecast.down'}
                        values={{ pct: fmt.fixed(Math.abs(pct), 1) }}
                        components={{ b }}
                      />
                    </>
                  )}
                </p>
                {p.horizon_years > 1 && (
                  <>
                    {/* Neither source reaches the present (FAO 2024, SAU 2019),
                        so a future year is reached by feeding each forecast
                        back in as the next year's input. Say so, and show
                        the path. */}
                    <p className="text-xs text-amber-500">
                      {t('fisheries.forecast.projected', { lastYear: p.last_observed_year, count: p.horizon_years })}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ocean-500">
                      {p.path.map((pt) => (
                        <span key={pt.year}>
                          {pt.year}: <strong>{fmt.int(pt.predicted_tonnes)} {t('common.tonnesShort')}</strong>
                        </span>
                      ))}
                    </div>
                  </>
                )}
                <p className="text-xs text-ocean-500">
                  {t('common.modelSkill', { value: fmt.int(p.skill.skill_vs_persistence * 100) })}
                  {p.skill.skill_vs_persistence <= 0.1 && ` — ${t('fisheries.forecast.weakSkill')}`}
                </p>
                {p.top_features.length > 0 && (
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-ocean-500">
                    {p.top_features.slice(0, 3).map((f) => (
                      <li key={f.feature}>
                        {t(f.direction === 'decreased' ? 'fisheries.forecast.driverDown' : 'fisheries.forecast.driverUp', {
                          feature: tDynamic(`fisheries.feature.${f.feature}`, f.feature),
                          contribution: fmt.fixed(f.contribution, 3),
                        })}{' '}
                        <span translate="no" className="font-mono opacity-70">
                          ({f.feature})
                        </span>
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
        <h2 className="mb-1 font-semibold text-ocean-700 dark:text-ocean-200">{t('fisheries.about.title')}</h2>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-ocean-500">
          {/* The doc asked for a Kerala/Goa/Odisha split. It isn't available,
              and saying so is better than inventing a state attribution. */}
          <li>
            <Trans i18nKey={`fisheries.about.region_${source}`} components={{ b }} />
          </li>
          <li>{t('fisheries.about.grouping')}</li>
          <li>
            <Trans i18nKey={`fisheries.about.measure_${source}`} components={{ b }} />
          </li>
        </ul>
      </div>
    </div>
  )
}
