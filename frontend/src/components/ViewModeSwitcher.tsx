import { VIEW_MODES, useViewModeStore, type ViewMode } from '@/store/viewMode'

/**
 * Audience switcher. Labelled "Viewing as" rather than "Role" on purpose:
 * it changes presentation only, and calling it a role would imply it grants
 * access it does not. Server-side permissions are unaffected.
 */
export function ViewModeSwitcher() {
  const { mode, setMode } = useViewModeStore()
  const current = VIEW_MODES.find((m) => m.value === mode)

  return (
    <label className="flex items-center gap-2 text-sm text-ocean-600 dark:text-ocean-300">
      <span className="text-xs uppercase tracking-wide text-ocean-500">Viewing as</span>
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as ViewMode)}
        title={current?.blurb}
        className="rounded-md border border-ocean-300 px-2 py-1 text-sm text-ocean-800 dark:border-ocean-700 dark:bg-ocean-900 dark:text-ocean-100"
      >
        {VIEW_MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  )
}
