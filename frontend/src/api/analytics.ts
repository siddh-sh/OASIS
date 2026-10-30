import { apiFetch, toQuery } from '@/api/client'

export interface AnomalyEvent {
  id: number
  domain: string
  region_id: number | null
  // Satellite grid cells sit outside every coastal region, so region_id is
  // null for these events and station_id is the only location they carry.
  station_id: number | null
  variable: string
  detected_at: string
  severity: string | null
  metric_value: number | null
  threshold_value: number | null
}

export interface Recommendation {
  /** Null for non-English narratives, which the backend caches in memory
   *  rather than in the recommendations table. */
  id: number | null
  ml_prediction_id: number | null
  anomaly_event_id: number | null
  narrative: string
  created_at: string | null
  cached: boolean
}

export interface ModelSkill {
  rmse: number
  baseline_rmse: number
  skill_vs_persistence: number
  n_test: number
  note: string
}

export interface FeatureContribution {
  feature: string
  contribution: number
  direction: string
}

export interface CatchPrediction {
  prediction_id: number
  species_id: number
  region_id: number
  year: number
  predicted_tonnes: number
  last_observed_year: number
  last_observed_tonnes: number
  /** Years rolled forward from the last real observation to `year`. */
  horizon_years: number
  path: { year: number; predicted_tonnes: number }[]
  source: 'FAO' | 'SAU'
  skill: ModelSkill
  top_features: FeatureContribution[]
}

export interface ForecastPoint {
  timestamp: string
  predicted_value: number
  step: number
}

export interface OceanForecast {
  station_id: number
  variable: string
  horizon: number
  step_days: number
  points: ForecastPoint[]
  skill: ModelSkill
}

export interface CatchDecline {
  species_id: number
  scientific_name: string | null
  common_name: string | null
  /** Name in the requested language (recorded, or the English name written phonetically). */
  vernacular_name?: string | null
  slope_tonnes_per_year: number
  pct_per_year: number
  n_years: number
  window_end_year: string | null
}

export interface CorrelationVariable {
  name: string
  domain: string
  unit: string
  label: string
}

export interface CorrelationResult {
  var1: string
  var2: string
  var1_label?: string
  var2_label?: string
  var1_unit?: string
  var2_unit?: string
  n_months: number
  pearson_r: number | null
  spearman_rho?: number
  p_value: number | null
  significant: boolean
  points: { month: string; x: number; y: number }[]
  // Sample-size and spatial-mean caveats from the backend. Rendered, not
  // dropped — a coefficient over ~25 months needs its context. `notes` is
  // English prose; the UI renders `note_codes` in the reader's language.
  notes: string[]
  note_codes?: CorrelationNote[]
}

export type CorrelationNote =
  | { code: 'region_ignored' | 'spatial_means' | 'chlorophyll_median' }
  | { code: 'too_few_months' | 'indicative'; n: number }

export const analyticsApi = {
  anomalies: (params: { region?: string; domain?: string } = {}) =>
    apiFetch<AnomalyEvent[]>(`/api/analytics/anomalies${toQuery(params)}`),

  correlationVariables: () => apiFetch<CorrelationVariable[]>('/api/analytics/correlation/variables'),

  correlation: (params: { var1: string; var2: string; region?: string }) =>
    apiFetch<CorrelationResult>(`/api/analytics/correlation${toQuery(params)}`),

  predictCatch: (params: { species_id: number; region_id?: number; source?: 'FAO' | 'SAU' }) =>
    apiFetch<CatchPrediction>(`/api/analytics/predict/catch${toQuery(params)}`),

  forecastOcean: (params: { station_id: number; variable: string; horizon?: number }) =>
    apiFetch<OceanForecast>(`/api/analytics/forecast/ocean-conditions${toQuery(params)}`),

  catchDecline: (limit = 20, language?: string) =>
    apiFetch<CatchDecline[]>(`/api/analytics/anomalies/catch-decline${toQuery({ limit, language })}`),

  recommendation: (targetId: number, language = 'en', refresh = false) =>
    apiFetch<Recommendation>(`/api/analytics/recommendation/${targetId}${toQuery({ refresh, language })}`),
}
