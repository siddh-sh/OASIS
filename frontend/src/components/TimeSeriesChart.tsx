import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Fixed categorical hue order — never cycled/generated. A 4th+ series should
// fold into a follow-up chart rather than extending this list.
const SERIES_COLORS = ['#1a86ac', '#1f9d7a', '#e0623f', '#d99a2b']

export interface TimeSeriesSeries {
  key: string
  label: string
}

interface TimeSeriesChartProps {
  data: Record<string, number | string | null>[]
  xKey: string
  series: TimeSeriesSeries[]
  yUnit?: string
  height?: number
}

export function TimeSeriesChart({ data, xKey, series, yUnit, height = 280 }: TimeSeriesChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-ocean-200 dark:text-ocean-800" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} stroke="currentColor" className="text-ocean-500" />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="currentColor"
          className="text-ocean-500"
          unit={yUnit ? ` ${yUnit}` : undefined}
          width={56}
        />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid var(--color-ocean-200)', fontSize: 13 }}
          labelStyle={{ fontWeight: 600 }}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
