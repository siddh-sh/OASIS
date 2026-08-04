export function CorrelationPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">Correlation Studio</h1>
        <p className="text-sm text-ocean-500">Pick two variables across domains → scatter/heatmap + narrated insight.</p>
      </div>
      <div className="rounded-lg border border-dashed border-ocean-300 p-6 text-sm text-ocean-500 dark:border-ocean-700">
        Should-Have feature, backed by GET /api/analytics/correlation — not implemented yet (Phase 6). It will reuse
        the Explainable Recommendation Agent's narration pattern once that agent exists (Phase 5).
      </div>
    </div>
  )
}
