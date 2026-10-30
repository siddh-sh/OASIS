import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { analyticsApi, type CorrelationNote } from '@/api/analytics'
import { tDynamic } from '@/i18n/dynamic'
import { describeError } from '@/i18n/errors'
import { useFormat } from '@/i18n/format'

/** Backend unit codes → display symbols. °C and mg/m³ are international
 *  symbols; millimetres follow the language like everywhere else in the UI
 *  (Weather shows मिमी in Marathi). */
const UNIT_SYMBOLS: Record<string, string> = { degrees_C: '°C', 'mg/m3': 'mg/m³' }

/**
 * Selection state holds the stable variable ids (`sst`, `chlorophyll_a`…),
 * never a display label — so switching language relabels the dropdowns
 * without changing what is selected or what is computed.
 */
export function CorrelationPage() {
  const { t } = useTranslation()
  const fmt = useFormat()
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
  const unitSymbol = (unit: string | undefined) =>
    !unit ? '' : unit === 'mm' ? t('weather.units.mm') : (UNIT_SYMBOLS[unit] ?? unit)
  const varLabel = (name: string, fallback?: string) => tDynamic(`correlation.variable.${name}`, fallback ?? name)

  const noteText = (n: CorrelationNote) =>
    'n' in n ? t(`correlation.notes.${n.code}`, { count: n.n }) : t(`correlation.notes.${n.code}`)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.correlation.title')}</h1>
        <p className="text-sm text-ocean-500">
          {t('pages.correlation.subtitle')} {t('correlation.subtitleSuffix')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {[
          { id: 'x', value: var1, set: setVar1, label: t('correlation.variableX') },
          { id: 'y', value: var2, set: setVar2, label: t('correlation.variableY') },
        ].map(({ id, value, set, label }) => (
          <label key={id} className="flex flex-col gap-1 text-xs text-ocean-500">
            {label}
            <select
              value={value}
              onChange={(e) => set(e.target.value)}
              className="rounded-md border border-ocean-300 px-3 py-2 text-sm text-ocean-950 dark:border-ocean-700 dark:bg-ocean-900 dark:text-ocean-50"
            >
              {options.map((o) => (
                <option key={o.name} value={o.name}>
                  {varLabel(o.name, o.label)} ({unitSymbol(o.unit)})
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {var1 === var2 ? (
        <p className="text-sm text-ocean-500">{t('correlation.pickDifferent')}</p>
      ) : result.isLoading ? (
        <p className="text-sm text-ocean-500">{t('correlation.computing')}</p>
      ) : result.error ? (
        <p className="text-sm text-red-600">{describeError(result.error)}</p>
      ) : data ? (
        <>
          <div className="flex flex-wrap gap-6 rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
            <Stat label={t('correlation.stats.pearson')} value={data.pearson_r != null ? fmt.fixed(data.pearson_r, 3) : '—'} />
            <Stat
              label={t('correlation.stats.spearman')}
              value={data.spearman_rho != null ? fmt.fixed(data.spearman_rho, 3) : '—'}
            />
            {/* Scientific notation is kept as-is: it is the standard way to
                print a p-value and reads the same in every language. */}
            <Stat label={t('correlation.stats.pValue')} value={data.p_value === null ? '—' : data.p_value.toExponential(2)} />
            <Stat label={t('correlation.stats.months')} value={fmt.int(data.n_months)} />
            <Stat
              label={t('correlation.stats.significant')}
              value={data.significant ? t('common.yes') : t('common.no')}
            />
          </div>

          {data.points.length > 0 &&
            (() => {
              const xLabel = varLabel(data.var1, data.var1_label)
              const yLabel = varLabel(data.var2, data.var2_label)
              const xUnit = unitSymbol(data.var1_unit)
              const yUnit = unitSymbol(data.var2_unit)
              return (
                <div className="h-80 rounded-lg border border-ocean-200 p-4 dark:border-ocean-800">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 16, bottom: 40, left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name={xLabel}
                        domain={['dataMin', 'dataMax']}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => fmt.num(v, 2)}
                        label={{ value: `${xLabel} (${xUnit})`, position: 'insideBottom', offset: -20, fontSize: 12 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name={yLabel}
                        domain={['dataMin', 'dataMax']}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => fmt.num(v, 2)}
                        label={{ value: `${yLabel} (${yUnit})`, angle: -90, position: 'insideLeft', offset: -10, fontSize: 12 }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        formatter={(value) => (typeof value === 'number' ? fmt.num(value, 3) : String(value))}
                      />
                      <Scatter data={data.points} fill="#0e7490" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )
            })()}

          {/* Plain-language read of the stats above, computed from this
              specific result (not fixed text) — "Pearson r = -0.622" means
              nothing to most readers without translation. */}
          {data.pearson_r !== null &&
            (() => {
              const r = data.pearson_r
              const x = varLabel(data.var1, data.var1_label)
              const y = varLabel(data.var2, data.var2_label)
              const abs = Math.abs(r)
              const strength =
                abs >= 0.8 ? 'veryStrong' : abs >= 0.6 ? 'fairlyStrong' : abs >= 0.4 ? 'moderate' : abs >= 0.2 ? 'weak' : 'none'
              const b = <strong />
              return (
                <div className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
                  <h2 className="mb-2 font-semibold text-ocean-700 dark:text-ocean-200">{t('correlation.plain.title')}</h2>
                  <ul className="flex list-disc flex-col gap-1.5 pl-4 text-ocean-600 dark:text-ocean-300">
                    <li>
                      <Trans
                        i18nKey={r > 0 ? 'correlation.plain.positive' : 'correlation.plain.negative'}
                        values={{ x, y }}
                        components={{ b }}
                      />{' '}
                      <Trans
                        i18nKey="correlation.plain.strength"
                        values={{ strength: t(`correlation.strength.${strength}`), r: fmt.fixed(r, 2) }}
                        components={{ b }}
                      />
                    </li>
                    <li>
                      {data.significant ? (
                        <Trans
                          i18nKey="correlation.plain.significant"
                          values={{ p: data.p_value?.toExponential(1), count: data.n_months }}
                          components={{ b }}
                        />
                      ) : (
                        <Trans
                          i18nKey="correlation.plain.notSignificant"
                          values={{ count: data.n_months }}
                          components={{ b }}
                        />
                      )}
                    </li>
                    <li>
                      <Trans i18nKey="correlation.plain.causation" components={{ b }} />
                    </li>
                  </ul>
                </div>
              )
            })()}

          {/* The backend ships caveats with every result; showing the number
              without them would overstate what ~25 monthly points support. */}
          {(data.note_codes?.length ?? 0) > 0 ? (
            <ul className="flex flex-col gap-1 text-xs text-ocean-500">
              {data.note_codes!.map((n) => (
                <li key={n.code}>• {noteText(n)}</li>
              ))}
            </ul>
          ) : (
            data.notes?.length > 0 && (
              // Older backend without codes: show its English notes rather
              // than nothing.
              <ul className="flex flex-col gap-1 text-xs text-ocean-500">
                {data.notes.map((n) => (
                  <li key={n}>• {n}</li>
                ))}
              </ul>
            )
          )}
        </>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      {/* Not upper-cased: the labels carry statistical symbols (p, ρ, r)
          whose case is meaningful — CSS turned "ρ" into "Ρ", which reads as P. */}
      <span className="text-xs tracking-wide text-ocean-500">{label}</span>
      <span className="text-lg font-semibold text-ocean-950 dark:text-ocean-50">{value}</span>
    </div>
  )
}
