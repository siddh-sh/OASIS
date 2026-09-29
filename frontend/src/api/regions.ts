import { apiFetch, toQuery } from '@/api/client'

export interface LocateResult {
  matched: boolean
  region_id: number | null
  name: string | null
  state: string | null
}

export const regionsApi = {
  locate: (lat: number, lon: number) => apiFetch<LocateResult>(`/api/regions/locate${toQuery({ lat, lon })}`),
}
