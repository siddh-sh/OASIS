import { apiFetch } from '@/api/client'
import type { DatasetStatus } from '@/types/api'

export const adminApi = {
  datasetsStatus: () => apiFetch<DatasetStatus[]>('/api/admin/datasets/status'),
}
