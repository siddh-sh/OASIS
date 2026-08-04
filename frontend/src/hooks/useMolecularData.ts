import { useQuery } from '@tanstack/react-query'
import { molecularApi } from '@/api/molecular'

export function useMolecularRecords(params: { species_id?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['molecular', 'records', params],
    queryFn: () => molecularApi.records(params),
  })
}
