import { useQuery } from '@tanstack/react-query'
import { fisheriesApi } from '@/api/fisheries'

export function useFisheriesSummary(params: { region?: string; start_year?: number; end_year?: number } = {}) {
  return useQuery({
    queryKey: ['fisheries', 'summary', params],
    queryFn: () => fisheriesApi.summary(params),
  })
}

export function useFisheriesCatch(params: { region?: string; species_id?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['fisheries', 'catch', params],
    queryFn: () => fisheriesApi.catch(params),
  })
}
