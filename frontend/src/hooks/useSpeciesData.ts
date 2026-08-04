import { useQuery } from '@tanstack/react-query'
import { speciesApi } from '@/api/species'

export function useSpeciesList(params: { q?: string; kingdom?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['species', 'list', params],
    queryFn: () => speciesApi.list(params),
  })
}

export function useSpecies(speciesId: number | undefined) {
  return useQuery({
    queryKey: ['species', 'detail', speciesId],
    queryFn: () => speciesApi.get(speciesId!),
    enabled: speciesId !== undefined,
  })
}

export function useSpeciesOccurrences(
  params: { bbox?: string; species_id?: number; start_date?: string; end_date?: string; limit?: number } = {},
) {
  return useQuery({
    queryKey: ['species', 'occurrences', params],
    queryFn: () => speciesApi.occurrences(params),
  })
}
