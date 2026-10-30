import { apiFetch, toQuery } from '@/api/client'
import type { Page, WeatherObservation } from '@/types/api'

export const weatherApi = {
  observations: (params: { region?: string; start_date?: string; end_date?: string; limit?: number; offset?: number } = {}) =>
    apiFetch<Page<WeatherObservation>>(`/api/weather/observations${toQuery(params)}`),
}

export interface WeatherStation {
  station_id: number
  name: string
  lat: number
  lon: number
  region: string
  n_observations: number
}

export interface Forecast {
  current: {
    time: string
    temperature_c: number | null
    feels_like_c: number | null
    humidity_pct: number | null
    precipitation_mm: number | null
    wind_speed_kmh: number | null
    wind_compass: string | null
    pressure_hpa: number | null
    is_day: boolean
    condition: string
    /** WMO code; the UI translates from this, `condition` is the English fallback. */
    weather_code: number | null
    uv_index_max_today: number | null
  }
  hourly: {
    time: string
    temperature_c: number | null
    precipitation_probability_pct: number | null
    condition: string
    weather_code: number | null
  }[]
  daily: {
    date: string
    condition: string
    weather_code: number | null
    temp_max_c: number | null
    temp_min_c: number | null
    precipitation_mm: number | null
    precipitation_probability_pct: number | null
    uv_index_max: number | null
    sunrise: string
    sunset: string
    wind_speed_max_kmh: number | null
  }[]
  source: string
  not_available: string[]
}

export const weatherForecastApi = {
  stations: (priorityOnly: boolean) =>
    apiFetch<WeatherStation[]>(`/api/weather/stations${toQuery({ priority_only: priorityOnly })}`),
  forecast: (stationId: number) =>
    apiFetch<Forecast>(`/api/weather/forecast${toQuery({ station_id: stationId })}`),
}
