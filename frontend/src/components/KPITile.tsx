import clsx from 'clsx'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import { useCountUp } from '@/hooks/useCountUp'

interface KPITileProps {
  label: string
  /** Numbers count up on first load; strings are shown as given. */
  value: string | number | null | undefined
  unit?: string
  loading?: boolean
  hint?: string
  icon?: React.ReactNode
  /** How a numeric value is displayed (the active language's number format). */
  format?: (n: number) => string
  /** Real history for a mini trend line — omit when there is none. */
  trend?: number[]
  /** Position in its row, for the staggered entrance. */
  index?: number
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 26 - ((v - min) / (max - min || 1)) * 22] as const)
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-2 h-8 w-full" aria-hidden>
      <defs>
        <linearGradient id="kpi-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#16d9d0" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#16d9d0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,28 ${line} 100,28`} fill="url(#kpi-spark)" className="animate-fade" />
      <polyline points={line} fill="none" stroke="#16d9d0" strokeWidth="1.4" vectorEffect="non-scaling-stroke"
        strokeLinejoin="round" className="sparkline-draw" />
    </svg>
  )
}

export function KPITile({ label, value, unit, loading, hint, icon, format, trend, index = 0 }: KPITileProps) {
  const numeric = typeof value === 'number' ? value : undefined
  const counted = useCountUp(numeric)
  const shown =
    numeric !== undefined && counted !== undefined
      ? (format ?? ((n: number) => Math.round(n).toLocaleString()))(counted)
      : value

  return (
    <div className="glass-panel glass-card animate-rise flex min-w-0 flex-col gap-1 p-4" style={{ ['--i' as string]: index }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium tracking-[0.12em] text-ocean-300 uppercase">{label}</span>
        {icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--glass-line)] bg-[rgba(22,217,208,0.08)] text-turquoise">
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <LoadingSkeleton className="mt-1 h-8 w-24" />
      ) : (
        <span className={clsx('mt-1 truncate text-[1.65rem] leading-tight font-semibold text-foam tabular-nums')}>
          {shown ?? '—'}
          {unit && value !== null && value !== undefined && (
            <span className="ml-1 text-sm font-normal text-mist">{unit}</span>
          )}
        </span>
      )}
      {hint && <span className="text-xs text-mist">{hint}</span>}
      {trend && trend.length > 1 && !loading && (
        <div className="mt-auto">
          <Sparkline values={trend} />
        </div>
      )}
    </div>
  )
}
