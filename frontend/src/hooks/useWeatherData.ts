import { useQuery } from '@tanstack/react-query'
import { weatherApi } from '@/api/weather'

export function useWeatherObservations(params: { region?: string; start_date?: string; end_date?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['weather', 'observations', params],
    queryFn: () => weatherApi.observations(params),
  })
}
