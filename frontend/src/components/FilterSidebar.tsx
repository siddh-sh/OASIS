import type { ReactNode } from 'react'

export function FilterSidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="glass-panel flex w-64 shrink-0 flex-col gap-4 p-4">
      {children}
    </aside>
  )
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[11px] font-semibold tracking-[0.12em] text-ocean-300 uppercase">{label}</span>
      {children}
    </label>
  )
}
