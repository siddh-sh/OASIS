import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { analyticsApi } from '@/api/analytics'
import { ApiError } from '@/api/client'
import { describeError } from '@/i18n/errors'

/**
 * Plain-language narrative for a prediction or anomaly, fetched on demand
 * rather than automatically — this calls the LLM (cached after the first
 * request per id and language, see backend's recommend()), so it costs real
 * quota and shouldn't fire just because a page rendered.
 *
 * The narrative is written by the model in the active language, and kept
 * per language: switching language shows the button again rather than
 * leaving an explanation in the previous language on screen.
 */
export function RecommendationPanel({ targetId }: { targetId: number }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [narratives, setNarratives] = useState<Record<string, { text: string; cached: boolean }>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  async function fetchRecommendation() {
    setLoading(true)
    setError(undefined)
    try {
      const result = await analyticsApi.recommendation(targetId, language)
      setNarratives((prev) => ({ ...prev, [language]: { text: result.narrative, cached: result.cached } }))
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503 ? t('recommendation.unavailable') : describeError(e),
      )
    } finally {
      setLoading(false)
    }
  }

  const current = narratives[language]
  if (current) {
    return (
      <p
        data-generated="llm"
        className="rounded-md bg-ocean-50 px-3 py-2 text-xs text-ocean-700 dark:bg-ocean-950 dark:text-ocean-300"
      >
        {current.text}
        {current.cached && <span className="ml-2 text-ocean-400">({t('recommendation.cached')})</span>}
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
        {loading ? t('recommendation.asking') : t('recommendation.explain')}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
