import { apiFetch, toQuery } from '@/api/client'
import type { FisheriesCatch, FisheriesSummary, Page } from '@/types/api'

export const fisheriesApi = {
  catch: (
    params: { region?: string; species_id?: number; start_date?: string; end_date?: string; limit?: number; offset?: number } = {},
  ) => apiFetch<Page<FisheriesCatch>>(`/api/fisheries/catch${toQuery(params)}`),

  summary: (params: { region?: string; start_year?: number; end_year?: number } = {}) =>
    apiFetch<FisheriesSummary>(`/api/fisheries/summary${toQuery(params)}`),
}
