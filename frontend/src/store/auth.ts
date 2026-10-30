import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ApiError } from '@/api/apiError'
import type { AuthTokenResponse, Profile } from '@/types/api'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  profile: Profile | null
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated'
  /** Kept as the error itself (not its text) so the UI can explain it in
   *  the reader's language from the status code. */
  error: Error | null
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, fullName?: string, institution?: string) => Promise<void>
  logout: () => Promise<void>
  fetchProfile: () => Promise<void>
}

// FastAPI's 422s carry `detail` as a list of {msg} objects, not a string.
function errorDetail(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => String(d?.msg ?? d).replace(/^Value error, /, '')).join('; ')
  }
  return undefined
}

async function authPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, errorDetail(data.detail) ?? `${path} failed (${res.status})`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// Neither of these touches the session, so they live outside the store.
export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return authPost('/auth/forgot-password', {
    email,
    redirect_to: `${window.location.origin}/reset-password`,
  })
}

export function resetPassword(recoveryToken: string, password: string): Promise<{ message: string }> {
  return authPost('/auth/reset-password', { access_token: recoveryToken, password })
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      profile: null,
      status: 'idle',
      error: null,

      login: async (email, password) => {
        set({ status: 'loading', error: null })
        try {
          const data = await authPost<AuthTokenResponse>('/auth/login', { email, password })
          set({ accessToken: data.access_token, refreshToken: data.refresh_token, status: 'authenticated' })
          await get().fetchProfile()
        } catch (e) {
          set({ status: 'unauthenticated', error: e as Error })
          throw e
        }
      },

      signup: async (email, password, fullName, institution) => {
        set({ status: 'loading', error: null })
        try {
          const data = await authPost<AuthTokenResponse>('/auth/signup', {
            email,
            password,
            full_name: fullName,
            institution,
          })
          if (!data.access_token) {
            // Email confirmation required — no session yet.
            set({ status: 'unauthenticated' })
            return
          }
          set({ accessToken: data.access_token, refreshToken: data.refresh_token, status: 'authenticated' })
          await get().fetchProfile()
        } catch (e) {
          set({ status: 'unauthenticated', error: e as Error })
          throw e
        }
      },

      logout: async () => {
        const token = get().accessToken
        set({ accessToken: null, refreshToken: null, profile: null, status: 'unauthenticated' })
        if (token) {
          await fetch(`${BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {
            // best-effort — local session is already cleared
          })
        }
      },

      fetchProfile: async () => {
        const token = get().accessToken
        if (!token) return
        const res = await fetch(`${BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) {
          set({ accessToken: null, refreshToken: null, profile: null, status: 'unauthenticated' })
          return
        }
        const profile = (await res.json()) as Profile
        set({ profile, status: 'authenticated' })
      },
    }),
    {
      name: 'oasis-auth',
      // Only the tokens are persisted — `status` is deliberately NOT, because
      // a stored "authenticated" would claim a live session even after the
      // token had expired or been revoked.
      //
      // Consequence: after a refresh the store holds a token but status is
      // back at 'idle'. Authentication is therefore gated on the token itself
      // (see useAuth), and `restoreSession` below revalidates it against
      // /auth/me on mount, clearing the session if the server rejects it.
      partialize: (state) => ({ accessToken: state.accessToken, refreshToken: state.refreshToken }),
    },
  ),
)
