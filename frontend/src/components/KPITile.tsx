import clsx from 'clsx'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'

interface KPITileProps {
  label: string
  value: string | number | null | undefined
  unit?: string
  loading?: boolean
  hint?: string
}

export function KPITile({ label, value, unit, loading, hint }: KPITileProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-ocean-200 bg-white p-4 dark:border-ocean-800 dark:bg-ocean-900/40">
      <span className="text-xs font-medium tracking-wide text-ocean-600 uppercase dark:text-ocean-300">{label}</span>
      {loading ? (
        <LoadingSkeleton className="h-8 w-24" />
      ) : (
        <span className={clsx('text-2xl font-semibold text-ocean-950 dark:text-ocean-50')}>
          {value ?? '—'}
          {unit && value !== null && value !== undefined && (
            <span className="ml-1 text-sm font-normal text-ocean-500">{unit}</span>
          )}
        </span>
      )}
      {hint && <span className="text-xs text-ocean-500">{hint}</span>}
    </div>
  )
}
