import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { analyticsApi } from '@/api/analytics'

export function CorrelationPage() {
  const { t } = useTranslation()
  const [var1, setVar1] = useState('sst')
  const [var2, setVar2] = useState('chlorophyll_a')

  const variables = useQuery({
    queryKey: ['analytics', 'correlation-variables'],
    queryFn: () => analyticsApi.correlationVariables(),
  })

  const result = useQuery({
    queryKey: ['analytics', 'correlation', var1, var2],
    queryFn: () => analyticsApi.correlation({ var1, var2 }),
    enabled: var1 !== var2,
  })

  const options = variables.data ?? []
  const data = result.data

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.correlation.title')}</h1>
        <p className="text-sm text-ocean-500">
          {t('pages.correlation.subtitle')} Satellite and weather series resampled to monthly means and joined on
          month.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {[
          { value: var1, set: setVar1, label: 'Variable X' },
          { value: var2, set: setVar2, label: 'Variable Y' },
        ].map(({ value, set, label }) => (
          <label key={label} className="flex flex-col gap-1 text-xs text-ocean-500">
            {label}
            <select
              value={value}
              onChange={(e) => set(e.target.value)}
              className="rounded-md border border-ocean-300 px-3 py-2 text-sm text-ocean-950 dark:border-ocean-700 dark:bg-ocean-900 dark:text-ocean-50"
            >
              {options.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.label} ({o.unit})
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {var1 === var2 ? (
        <p className="text-sm text-ocean-500">Pick two different variables.</p>
      ) : result.isLoading ? (
        <p className="text-sm text-ocean-500">Computing…</p>
      ) : result.error ? (
        <p className="text-sm text-red-600">{(result.error as Error).message}</p>
      ) : data ? (
        <>
          <div className="flex flex-wrap gap-6 rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
            <Stat label="Pearson r" value={data.pearson_r?.toFixed(3) ?? '—'} />
            <Stat label="Spearman ρ" value={data.spearman_rho?.toFixed(3) ?? '—'} />
            <Stat label="p-value" value={data.p_value === null ? '—' : data.p_value.toExponential(2)} />
            <Stat label="Months" value={String(data.n_months)} />
            <Stat
              label="Significant (p<0.05)"
              value={data.significant ? 'yes' : 'no'}
            />
          </div>

          {data.points.length > 0 && (
            <div className="h-80 rounded-lg border border-ocean-200 p-4 dark:border-ocean-800">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, bottom: 40, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={data.var1_label ?? data.var1}
                    unit={data.var1_unit ? ` ${data.var1_unit}` : ''}
                    domain={['dataMin', 'dataMax']}
                    tick={{ fontSize: 11 }}
                    label={{ value: data.var1_label ?? data.var1, position: 'insideBottom', offset: -20, fontSize: 12 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={data.var2_label ?? data.var2}
                    unit={data.var2_unit ? ` ${data.var2_unit}` : ''}
                    domain={['dataMin', 'dataMax']}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter data={data.points} fill="#0e7490" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Plain-language read of the stats above, computed from this
              specific result (not fixed text) — "Pearson r = -0.622" means
              nothing to most readers without translation. */}
          {data.pearson_r !== null && (
            (() => {
              const r = data.pearson_r
              const xLabel = data.var1_label ?? data.var1
              const yLabel = data.var2_label ?? data.var2
              const direction =
                r > 0
                  ? `tend to rise together — as ${xLabel} goes up, ${yLabel} tends to go up too`
                  : `move in opposite directions — as ${xLabel} goes up, ${yLabel} tends to go down`
              const abs = Math.abs(r)
              const strength =
                abs >= 0.8
                  ? 'a very strong'
                  : abs >= 0.6
                    ? 'a fairly strong'
                    : abs >= 0.4
                      ? 'a moderate'
                      : abs >= 0.2
                        ? 'a weak'
                        : 'almost no'
              return (
                <div className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
                  <h2 className="mb-2 font-semibold text-ocean-700 dark:text-ocean-200">
                    What this means in plain words
                  </h2>
                  <ul className="flex list-disc flex-col gap-1.5 pl-4 text-ocean-600 dark:text-ocean-300">
                    <li>
                      <strong>{xLabel}</strong> and <strong>{yLabel}</strong> {direction}. That&rsquo;s{' '}
                      <strong>{strength} relationship</strong> (correlation of {r.toFixed(2)}, where 0 means no
                      relationship at all and ±1 would mean they move perfectly together).
                    </li>
                    <li>
                      {data.significant ? (
                        <>
                          This pattern is <strong>statistically significant</strong> (p = {data.p_value?.toExponential(1)}
                          ) — unlikely to just be random noise, given {data.n_months} months of data.
                        </>
                      ) : (
                        <>
                          This pattern is <strong>not statistically significant</strong> — with only{' '}
                          {data.n_months} months of overlapping data, it could plausibly just be random noise rather
                          than a real relationship.
                        </>
                      )}
                    </li>
                    <li>
                      <strong>Correlation isn&rsquo;t causation</strong> — this says the two move together, not that
                      one causes the other. Both could be driven by something else entirely (like the seasons).
                    </li>
                  </ul>
                </div>
              )
            })()
          )}

          {/* The backend ships caveats with every result; showing the number
              without them would overstate what ~25 monthly points support. */}
          {data.notes?.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-ocean-500">
              {data.notes.map((n) => (
                <li key={n}>• {n}</li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-ocean-500">{label}</span>
      <span className="text-lg font-semibold text-ocean-950 dark:text-ocean-50">{value}</span>
    </div>
  )
}
