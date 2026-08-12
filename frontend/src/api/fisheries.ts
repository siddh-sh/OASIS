import { apiFetch, toQuery } from '@/api/client'
import type { FisheriesCatch, FisheriesSummary, Page } from '@/types/api'

export const fisheriesApi = {
  catch: (
    params: { region?: string; species_id?: number; start_date?: string; end_date?: string; limit?: number; offset?: number } = {},
  ) => apiFetch<Page<FisheriesCatch>>(`/api/fisheries/catch${toQuery(params)}`),

  summary: (params: { region?: string; start_year?: number; end_year?: number } = {}) =>
    apiFetch<FisheriesSummary>(`/api/fisheries/summary${toQuery(params)}`),
}

export interface CatchSeries {
  key: string
  label: string
  points: { year: number; tonnes: number }[]
}

export interface CatchTimeseries {
  group_by: string
  series: CatchSeries[]
  unit: string
  source: string
}

export interface CatchFilters {
  regions: { region_id: number; name: string }[]
  species: {
    species_id: number
    scientific_name: string
    common_name: string | null
    total_tonnes: number
  }[]
}

export const fisheriesBreakdownApi = {
  filters: () => apiFetch<CatchFilters>('/api/fisheries/filters'),
  timeseries: (
    params: {
      group_by?: 'none' | 'species' | 'region'
      region_id?: number
      species_id?: number
      top_n?: number
    } = {},
  ) => apiFetch<CatchTimeseries>(`/api/fisheries/timeseries${toQuery(params)}`),
}
