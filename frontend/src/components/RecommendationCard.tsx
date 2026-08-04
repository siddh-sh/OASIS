interface RecommendationCardProps {
  narrative: string
  createdAt: string
  relatedTo?: string
}

export function RecommendationCard({ narrative, createdAt, relatedTo }: RecommendationCardProps) {
  return (
    <div className="rounded-lg border border-ocean-200 bg-ocean-50 p-4 dark:border-ocean-800 dark:bg-ocean-900/30">
      <div className="mb-2 flex items-center justify-between text-xs text-ocean-500">
        <span className="font-medium text-ocean-600 dark:text-ocean-300">
          {relatedTo ? `Recommendation — ${relatedTo}` : 'Recommendation'}
        </span>
        <span>{new Date(createdAt).toLocaleString()}</span>
      </div>
      <p className="text-sm leading-relaxed text-ocean-950 dark:text-ocean-100">{narrative}</p>
    </div>
  )
}
