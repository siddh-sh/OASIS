import { apiFetch, toQuery } from '@/api/client'

// These mirror app/schemas shapes Phase 4/5 will introduce — kept minimal
// here since the endpoints themselves are still 501 stubs (backend/app/api/analytics.py).
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
  id: number
  ml_prediction_id: number | null
  anomaly_event_id: number | null
  narrative: string
  created_at: string
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
  // dropped — a coefficient over ~25 months needs its context.
  notes: string[]
}

export const analyticsApi = {
  anomalies: (params: { region?: string; domain?: string } = {}) =>
    apiFetch<AnomalyEvent[]>(`/api/analytics/anomalies${toQuery(params)}`),

  correlationVariables: () => apiFetch<CorrelationVariable[]>('/api/analytics/correlation/variables'),

  correlation: (params: { var1: string; var2: string; region?: string }) =>
    apiFetch<CorrelationResult>(`/api/analytics/correlation${toQuery(params)}`),
}
