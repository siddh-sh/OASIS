import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/** Admin-only pages: anyone else is sent to the dashboard. This only hides
 *  the page — the server enforces the role on every /api/admin request. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  // The profile is re-fetched after a refresh; wait for it rather than
  // bouncing an admin away while it loads.
  if (!profile) return null
  if (profile.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
