import { useQuery } from '@tanstack/react-query'
import { oceanApi } from '@/api/ocean'
import type { StationType } from '@/types/api'

export function useOceanStations(params: { station_type?: StationType; bbox?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['ocean', 'stations', params],
    queryFn: () => oceanApi.stations(params),
  })
}

export function useOceanReadings(params: { station_id?: number; start_date?: string; end_date?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: ['ocean', 'readings', params],
    queryFn: () => oceanApi.readings(params),
    enabled: params.station_id !== undefined,
  })
}

export function useOceanReadingsSummary(variable: string, regionId?: number) {
  return useQuery({
    queryKey: ['ocean', 'readings-summary', variable, regionId],
    queryFn: () => oceanApi.readingsSummary({ variable, region_id: regionId }),
  })
}

export function useSensorReadings(params: { station_id?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['ocean', 'sensor-readings', params],
    queryFn: () => oceanApi.sensorReadings(params),
    enabled: params.station_id !== undefined,
  })
}
