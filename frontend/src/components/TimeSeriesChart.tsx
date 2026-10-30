import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartLegend } from '@/components/ChartLegend'
import { useFormat } from '@/i18n/format'

// Fixed categorical hue order — never cycled/generated. A 4th+ series should
// fold into a follow-up chart rather than extending this list.
const SERIES_COLORS = ['#16d9d0', '#27c6d5', '#ff6384', '#d99a2b']

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

/** Callers pass already-translated series labels and x values; this only
 *  owns number formatting on the axis and tooltip. */
export function TimeSeriesChart({ data, xKey, series, yUnit, height = 280 }: TimeSeriesChartProps) {
  const fmt = useFormat()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(145,177,191,0.14)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} stroke="rgba(145,177,191,0.35)" tickLine={false} />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="rgba(145,177,191,0.35)"
          tickLine={false}
          axisLine={false}
          unit={yUnit ? ` ${yUnit}` : undefined}
          tickFormatter={(v: number) => fmt.num(v, 2)}
          width={56}
        />
        <Tooltip
          formatter={(value) => (typeof value === 'number' ? fmt.num(value, 2) : String(value))}
          contentStyle={{ borderRadius: 12, fontSize: 13 }}
          cursor={{ stroke: 'rgba(22,217,208,0.35)', strokeWidth: 1 }}
          labelStyle={{ fontWeight: 600, color: '#f3fafc' }}
        />
        {series.length > 1 && <Legend content={(props) => <ChartLegend payload={props.payload} />} />}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            animationDuration={1200}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
