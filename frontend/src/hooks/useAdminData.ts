import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'

export function useDatasetsStatus() {
  return useQuery({
    queryKey: ['admin', 'datasets-status'],
    queryFn: () => adminApi.datasetsStatus(),
  })
}
