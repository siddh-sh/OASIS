import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { tDynamic } from '@/i18n/dynamic'

// Status colors are reserved for severity and never reused for anything
// else (e.g. data-source identity uses DataSourceBadge's separate palette).
const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-kelp-500/15 text-kelp-500',
  medium: 'bg-amber-500/15 text-amber-500',
  high: 'bg-coral-500/15 text-coral-500',
  critical: 'bg-coral-500 text-white',
}

export function AnomalyBadge({ severity }: { severity: string | null | undefined }) {
  useTranslation() // re-render on language change
  const key = (severity ?? 'unknown').toLowerCase()
  const style = SEVERITY_STYLES[key] ?? 'bg-ocean-200 text-ocean-700 dark:bg-ocean-800 dark:text-ocean-200'
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', style)}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {tDynamic(`alerts.severity.${key}`, key)}
    </span>
  )
}
