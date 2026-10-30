import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * What happens when someone reloads a page inside the platform.
 *
 * Browsers don't let a page add options to the reload button itself, so the
 * choice is offered just after the reload instead (RefreshPrompt). "stay" and
 * "home" are remembered answers; "ask" shows the prompt every time.
 */
export type RefreshChoice = 'ask' | 'stay' | 'home'

/** Labels live in the dictionaries under `refresh.<labelKey>`. */
export const REFRESH_CHOICES: { value: RefreshChoice; labelKey: 'ask' | 'stayChoice' | 'homeChoice' }[] = [
  { value: 'ask', labelKey: 'ask' },
  { value: 'stay', labelKey: 'stayChoice' },
  { value: 'home', labelKey: 'homeChoice' },
]

interface RefreshPreferenceState {
  choice: RefreshChoice
  setChoice: (choice: RefreshChoice) => void
}

export const useRefreshPreference = create<RefreshPreferenceState>()(
  persist(
    (set) => ({
      choice: 'ask',
      setChoice: (choice) => set({ choice }),
    }),
    { name: 'oasis-refresh-preference' },
  ),
)

// The navigation entry describes how the *document* was loaded, so it still
// says "reload" after the user clicks around the app. Consuming it once per
// load is what keeps the prompt from reappearing on every in-app route change.
let reloadConsumed = false

export function consumeReload(): boolean {
  if (reloadConsumed) return false
  reloadConsumed = true
  const entry = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined
  return entry?.type === 'reload'
}

/** Test hook: lets each test simulate a fresh document load. */
export function resetReloadConsumed() {
  reloadConsumed = false
}
