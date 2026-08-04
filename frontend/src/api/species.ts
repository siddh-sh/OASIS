import { apiFetch, toQuery } from '@/api/client'
import type { Page, Species, SpeciesOccurrence } from '@/types/api'

export const speciesApi = {
  list: (params: { q?: string; kingdom?: string; limit?: number; offset?: number } = {}) =>
    apiFetch<Page<Species>>(`/api/species${toQuery(params)}`),

  get: (speciesId: number) => apiFetch<Species>(`/api/species/${speciesId}`),

  occurrences: (
    params: { bbox?: string; species_id?: number; start_date?: string; end_date?: string; limit?: number; offset?: number } = {},
  ) => apiFetch<Page<SpeciesOccurrence>>(`/api/species/occurrences${toQuery(params)}`),
}
