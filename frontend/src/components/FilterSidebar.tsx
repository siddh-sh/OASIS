import type { ReactNode } from 'react'

export function FilterSidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 rounded-lg border border-ocean-200 bg-ocean-50 p-4 dark:border-ocean-800 dark:bg-ocean-900/30">
      {children}
    </aside>
  )
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ocean-700 dark:text-ocean-200">{label}</span>
      {children}
    </label>
  )
}
