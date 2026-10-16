import { useState } from 'react'
import { analyticsApi } from '@/api/analytics'
import { ApiError } from '@/api/client'

/**
 * Plain-language narrative for a prediction or anomaly, fetched on demand
 * rather than automatically — this calls the LLM (cached after the first
 * request per id, see backend's recommend()), so it costs real quota and
 * shouldn't fire just because a page rendered.
 */
export function RecommendationPanel({ targetId }: { targetId: number }) {
  const [narrative, setNarrative] = useState<string>()
  const [cached, setCached] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  async function fetchRecommendation() {
    setLoading(true)
    setError(undefined)
    try {
      const result = await analyticsApi.recommendation(targetId)
      setNarrative(result.narrative)
      setCached(result.cached)
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? 'AI explanation unavailable right now (LLM provider issue) — see Admin / Data Status.'
          : (e as Error).message,
      )
    } finally {
      setLoading(false)
    }
  }

  if (narrative) {
    return (
      <p className="rounded-md bg-ocean-50 px-3 py-2 text-xs text-ocean-700 dark:bg-ocean-950 dark:text-ocean-300">
        {narrative}
        {cached && <span className="ml-2 text-ocean-400">(cached)</span>}
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => void fetchRecommendation()}
        disabled={loading}
        className="text-xs font-medium text-ocean-600 hover:underline disabled:opacity-50 dark:text-ocean-300"
      >
        {loading ? 'Asking…' : 'Explain this in plain language'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
