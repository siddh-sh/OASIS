import { useAuthStore } from '@/store/auth'

export function useAuth() {
  const { accessToken, profile, status, error, login, signup, logout, fetchProfile } = useAuthStore()
  return {
    // Gated on the token, not on `status`: `status` is not persisted, so
    // after a page refresh it is back at 'idle' while a perfectly valid
    // token sits in localStorage. App.tsx revalidates that token on mount
    // and clears it if the server rejects it.
    isAuthenticated: !!accessToken,
    isLoading: status === 'loading',
    profile,
    error,
    login,
    signup,
    logout,
    fetchProfile,
  }
}
