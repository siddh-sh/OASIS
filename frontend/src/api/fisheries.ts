import { apiFetch, toQuery } from '@/api/client'
import type { FisheriesCatch, FisheriesSummary, Page } from '@/types/api'

export const fisheriesApi = {
  catch: (
    params: { region?: string; species_id?: number; start_date?: string; end_date?: string; limit?: number; offset?: number } = {},
  ) => apiFetch<Page<FisheriesCatch>>(`/api/fisheries/catch${toQuery(params)}`),

  summary: (params: { region?: string; start_year?: number; end_year?: number } = {}) =>
    apiFetch<FisheriesSummary>(`/api/fisheries/summary${toQuery(params)}`),
}

/**
 * The two species-level catch series. They measure different things — FAO is
 * reported landings, SAU a reconstruction adding discards and unreported
 * catch — so the UI shows exactly one at a time and never sums them.
 */
export type CatchSource = 'FAO' | 'SAU'

export interface CatchSeries {
  key: string
  label: string
  /** Only on the "other" series: how many series it folds together. */
  count?: number
  /** Sourced name in the requested language, when one exists. */
  vernacular_name?: string
  points: { year: number; tonnes: number }[]
}

export interface CatchTimeseries {
  group_by: string
  series: CatchSeries[]
  unit: string
  source: string
  source_key: CatchSource
}

export interface CatchFilters {
  source: CatchSource
  label: string
  first_year: number | null
  last_year: number | null
  regions: { region_id: number; name: string }[]
  species: {
    species_id: number
    scientific_name: string
    common_name: string | null
    /** Sourced name in the requested language, when one exists. */
    vernacular_name: string | null
    total_tonnes: number
  }[]
}

export const fisheriesBreakdownApi = {
  filters: (source: CatchSource, language?: string) =>
    apiFetch<CatchFilters>(`/api/fisheries/filters${toQuery({ source, language })}`),
  timeseries: (
    params: {
      group_by?: 'none' | 'species' | 'region'
      region_id?: number
      species_id?: number
      top_n?: number
      source?: CatchSource
      language?: string
    } = {},
  ) => apiFetch<CatchTimeseries>(`/api/fisheries/timeseries${toQuery(params)}`),
}
