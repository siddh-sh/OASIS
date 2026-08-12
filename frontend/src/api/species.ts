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

export interface SpeciesPhoto {
  url: string
  license: string | null
  license_url: string | null
  photographer: string | null
  observed_at: string | null
  lat: number | null
  lon: number | null
  grid_cell: string | null
  locality: string | null
}

export interface SpeciesPhotos {
  total_with_photos: number
  photos: SpeciesPhoto[]
  source: string
}

export interface SpeciesContext {
  n_occurrences: number
  sst_c: { mean: number | null; min: number | null; max: number | null }
  salinity_psu_mean: number | null
  seabed_depth_m_mean: number | null
  explanation: string | null
  relocation_note?: string
  note?: string
}

export const speciesExtrasApi = {
  photos: (speciesId: number) => apiFetch<SpeciesPhotos>(`/api/species/${speciesId}/photos?limit=6`),
  context: (speciesId: number) => apiFetch<SpeciesContext>(`/api/species/${speciesId}/context`),
}
