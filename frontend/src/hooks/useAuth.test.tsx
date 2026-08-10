import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/auth'

/**
 * Regression tests for the bug that logged users out on every page refresh.
 *
 * The store persists only the tokens, deliberately — a persisted
 * "authenticated" status would claim a live session after the token had
 * expired. The consequence is that `status` is back at 'idle' after a
 * reload, so authentication must be gated on the token itself, not on
 * status. Getting that wrong bounced a signed-in user to /login on every F5.
 */
describe('useAuth', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, profile: null, status: 'idle' })
  })

  it('is unauthenticated with no token', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('is authenticated from a restored token alone, before status is set', () => {
    act(() => {
      // Exactly the post-refresh state: token rehydrated from localStorage,
      // status still at its initial value.
      useAuthStore.setState({ accessToken: 'restored.jwt.token', status: 'idle' })
    })
    const { result } = renderHook(() => useAuth())
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('becomes unauthenticated once the token is cleared', () => {
    act(() => useAuthStore.setState({ accessToken: 'x', status: 'authenticated' }))
    const { result, rerender } = renderHook(() => useAuth())
    expect(result.current.isAuthenticated).toBe(true)

    // fetchProfile clears the token when /auth/me rejects it.
    act(() => useAuthStore.setState({ accessToken: null, status: 'unauthenticated' }))
    rerender()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('reports loading while a login is in flight', () => {
    act(() => useAuthStore.setState({ status: 'loading' }))
    const { result } = renderHook(() => useAuth())
    expect(result.current.isLoading).toBe(true)
  })
})
