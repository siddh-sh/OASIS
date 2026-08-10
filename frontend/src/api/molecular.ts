import { apiFetch, toQuery } from '@/api/client'
import type { MolecularRecord, Page } from '@/types/api'

export interface SequenceMatch {
  record_id: number
  process_id: string | null
  marker_gene: string | null
  bin_uri: string | null
  species_id: number | null
  scientific_name: string | null
  common_name: string | null
  subject_length: number
  similarity: number
}

export interface SequenceMatchResult {
  query_length: number
  n_compared: number
  method: string
  // Composition-vs-alignment caveat. Always rendered: a similarity score here
  // is not a BLAST identification and must not be read as one.
  caveat: string
  matches: SequenceMatch[]
}

export const molecularApi = {
  records: (params: { species_id?: number; limit?: number; offset?: number } = {}) =>
    apiFetch<Page<MolecularRecord>>(`/api/molecular/records${toQuery(params)}`),

  match: (sequence: string, limit = 10) =>
    apiFetch<SequenceMatchResult>('/api/molecular/match', {
      method: 'POST',
      body: JSON.stringify({ sequence, limit }),
    }),
}
