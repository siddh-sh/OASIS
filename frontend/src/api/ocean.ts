import { apiFetch, toQuery } from '@/api/client'
import type { Page, Reading, ReadingsSummary, SensorReading, Station, StationType } from '@/types/api'

export interface LatestReading {
  station_id: number
  timestamp: string
  sst: number | null
  chlorophyll_a: number | null
  region_id: number | null
}

export const oceanApi = {
  stations: (params: { station_type?: StationType; bbox?: string; limit?: number; offset?: number } = {}) =>
    apiFetch<Page<Station>>(`/api/ocean/stations${toQuery(params)}`),

  latestReadings: (params: { station_type?: StationType; bbox?: string } = {}) =>
    apiFetch<LatestReading[]>(`/api/ocean/stations/latest-readings${toQuery(params)}`),

  readings: (params: { station_id?: number; start_date?: string; end_date?: string; limit?: number; offset?: number } = {}) =>
    apiFetch<Page<Reading>>(`/api/ocean/readings${toQuery(params)}`),

  readingsSummary: (params: { variable: string; region_id?: number }) =>
    apiFetch<ReadingsSummary[]>(`/api/ocean/readings/summary${toQuery(params)}`),

  sensorReadings: (params: { station_id?: number; start_date?: string; end_date?: string; limit?: number; offset?: number } = {}) =>
    apiFetch<Page<SensorReading>>(`/api/ocean/sensor-readings${toQuery(params)}`),
}
