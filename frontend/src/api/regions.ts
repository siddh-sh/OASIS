import { apiFetch, toQuery } from '@/api/client'

export interface LocateResult {
  matched: boolean
  region_id: number | null
  name: string | null
  state: string | null
}

export interface RegionSummary {
  region_id: number
  name: string
  state: string | null
}

export const regionsApi = {
  list: () => apiFetch<RegionSummary[]>('/api/regions'),

  locate: (lat: number, lon: number) => apiFetch<LocateResult>(`/api/regions/locate${toQuery({ lat, lon })}`),
}
