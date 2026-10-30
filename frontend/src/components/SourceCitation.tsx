import { useTranslation } from 'react-i18next'

export function SourceCitation({ sources }: { sources: string[] }) {
  const { t } = useTranslation()
  if (sources.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ocean-500">
      <span>{t('common.sources')}</span>
      {sources.map((s) => (
        // Tool names the agent ran — identifiers, not prose.
        <span key={s} translate="no" className="rounded-full bg-ocean-100 px-2 py-0.5 dark:bg-ocean-900">
          {s}
        </span>
      ))}
    </div>
  )
}
