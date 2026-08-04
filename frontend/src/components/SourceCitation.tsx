export function SourceCitation({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-ocean-500">
      <span>Sources:</span>
      {sources.map((s) => (
        <span key={s} className="rounded-full bg-ocean-100 px-2 py-0.5 dark:bg-ocean-900">
          {s}
        </span>
      ))}
    </div>
  )
}
