import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { fisheriesBreakdownApi } from '@/api/fisheries'

type GroupBy = 'none' | 'species' | 'region'

// Categorical palette; "Other" is deliberately grey so the tail reads as a
// residual rather than as another headline species.
const COLORS = ['#0e7490', '#b45309', '#7c3aed', '#15803d', '#be123c', '#0369a1', '#a16207', '#4d7c0f']
const OTHER_COLOR = '#94a3b8'

export function FisheriesPage() {
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">Fisheries Insights</h1>
        <p className="text-sm text-ocean-500">
          Sea Around Us reconstructed catch, 1950–2019, broken down by species and EEZ.
        </p>
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
        </>
      )}

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
