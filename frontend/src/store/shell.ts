import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ShellState {
  /** Desktop sidebar shows icons only. Remembered between visits. */
  collapsed: boolean
  /** Mobile navigation drawer. Never persisted. */
  drawerOpen: boolean
  toggleCollapsed: () => void
  setDrawerOpen: (open: boolean) => void
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      collapsed: false,
      drawerOpen: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
    }),
    { name: 'oasis-shell', partialize: (s) => ({ collapsed: s.collapsed }) },
  ),
)
