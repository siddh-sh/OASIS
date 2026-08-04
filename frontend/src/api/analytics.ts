import { apiFetch, toQuery } from '@/api/client'

// These mirror app/schemas shapes Phase 4/5 will introduce — kept minimal
// here since the endpoints themselves are still 501 stubs (backend/app/api/analytics.py).
export interface AnomalyEvent {
  id: number
  domain: string
  region_id: number | null
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

export const analyticsApi = {
  anomalies: (params: { region?: string; domain?: string } = {}) =>
    apiFetch<AnomalyEvent[]>(`/api/analytics/anomalies${toQuery(params)}`),
}
