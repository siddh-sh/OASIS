import type { LegendPayload } from 'recharts'

/**
 * Chart legend used instead of Recharts' default, which labels every swatch
 * for screen readers with a hardcoded English "… legend icon". Renders the
 * same swatch + label, with no text of its own.
 *
 * `dataNames` marks the labels as data (species or place names) so they are
 * excluded from translation checks; leave it off for translated labels.
 */
export function ChartLegend({ payload, dataNames = false }: { payload?: readonly LegendPayload[]; dataNames?: boolean }) {
  if (!payload?.length) return null
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]" translate={dataNames ? 'no' : undefined}>
      {payload.map((entry) => (
        <li key={String(entry.value)} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: entry.color }} />
          <span style={{ color: entry.color }}>{entry.value}</span>
        </li>
      ))}
    </ul>
  )
}
