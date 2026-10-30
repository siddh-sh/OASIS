import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

// Every data point in OASIS traces to a named real source — this badge is
// what makes that provenance visible in the UI rather than implicit.
const SOURCE_COLORS: Record<string, string> = {
  'NOAA-BLENDED-SST': 'bg-ocean-100 text-ocean-800 dark:bg-ocean-900 dark:text-ocean-200',
  'NOAA-DINEOF-CHLA': 'bg-kelp-500/15 text-kelp-500',
  'NOAA-PMEL-RAMA': 'bg-ocean-100 text-ocean-800 dark:bg-ocean-900 dark:text-ocean-200',
  'Open-Meteo': 'bg-amber-500/15 text-amber-500',
  OBIS: 'bg-kelp-500/15 text-kelp-500',
  GBIF: 'bg-kelp-400/15 text-kelp-400',
  'FAO-via-OWID': 'bg-coral-500/15 text-coral-500',
  FAO: 'bg-coral-500/15 text-coral-500',
  SAU: 'bg-amber-500/15 text-amber-500',
  BOLD: 'bg-ocean-400/15 text-ocean-600 dark:text-ocean-300',
}

export function DataSourceBadge({ source }: { source: string }) {
  const { t } = useTranslation()
  const colorClass = SOURCE_COLORS[source] ?? 'bg-ocean-200/60 text-ocean-700 dark:bg-ocean-800 dark:text-ocean-200'
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        colorClass,
      )}
      title={t('common.sourceTooltip', { source })}
      // Organisation/dataset names (NOAA, FAO, OBIS…) are proper nouns.
      translate="no"
    >
      {source}
    </span>
  )
}
