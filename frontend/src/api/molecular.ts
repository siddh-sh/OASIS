import { apiFetch, toQuery } from '@/api/client'
import type { MolecularRecord, Page } from '@/types/api'

export const molecularApi = {
  records: (params: { species_id?: number; limit?: number; offset?: number } = {}) =>
    apiFetch<Page<MolecularRecord>>(`/api/molecular/records${toQuery(params)}`),
}
