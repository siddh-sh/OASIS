import { apiFetch, toQuery } from '@/api/client'
import type { Page, WeatherObservation } from '@/types/api'

export const weatherApi = {
  observations: (params: { region?: string; start_date?: string; end_date?: string; limit?: number; offset?: number } = {}) =>
    apiFetch<Page<WeatherObservation>>(`/api/weather/observations${toQuery(params)}`),
}
