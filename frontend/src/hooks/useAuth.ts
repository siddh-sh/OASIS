import { useAuthStore } from '@/store/auth'

export function useAuth() {
  const { accessToken, profile, status, error, login, signup, logout, fetchProfile } = useAuthStore()
  return {
    isAuthenticated: status === 'authenticated' && !!accessToken,
    isLoading: status === 'loading',
    profile,
    error,
    login,
    signup,
    logout,
    fetchProfile,
  }
}
