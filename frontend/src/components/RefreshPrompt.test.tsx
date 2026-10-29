import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RefreshPrompt } from '@/components/RefreshPrompt'
import { resetReloadConsumed, useRefreshPreference } from '@/store/refreshPreference'

function mockNavigationType(type: string) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type } as unknown as PerformanceEntry])
}

function renderAt(path = '/fisheries') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>homepage</p>} />
        <Route path="/fisheries" element={<><p>fisheries page</p><RefreshPrompt /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  resetReloadConsumed()
  useRefreshPreference.setState({ choice: 'ask' })
})
afterEach(() => vi.restoreAllMocks())

describe('RefreshPrompt', () => {
  it('stays hidden on a normal navigation', () => {
    mockNavigationType('navigate')
    renderAt()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks after a reload and can go to the homepage', async () => {
    mockNavigationType('reload')
    renderAt()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /go to homepage/i }))
    expect(screen.getByText('homepage')).toBeInTheDocument()
    expect(useRefreshPreference.getState().choice).toBe('ask')
  })

  it('remembers "stay" when asked to', async () => {
    mockNavigationType('reload')
    renderAt()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /stay on this page/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('fisheries page')).toBeInTheDocument()
    expect(useRefreshPreference.getState().choice).toBe('stay')
  })

  it('goes straight home when "home" is remembered', () => {
    useRefreshPreference.setState({ choice: 'home' })
    mockNavigationType('reload')
    renderAt()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('homepage')).toBeInTheDocument()
  })

  it('shows at most once per page load', () => {
    mockNavigationType('reload')
    const first = renderAt()
    first.unmount()
    renderAt()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
