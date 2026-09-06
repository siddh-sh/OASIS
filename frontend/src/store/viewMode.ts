import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Audience view mode (project-changes.md §7).
 *
 * This is a **presentation** setting, not an access-control one, and the
 * distinction matters. It changes how the same data is labelled and how much
 * jargon is shown — it does not unlock anything. Real permissions live on
 * `profiles.role` and are enforced server-side (see
 * `backend/app/core/security.py:require_admin`); switching to "Admin" here
 * would not get you past that check.
 *
 * Self-service by design: any signed-in user can preview any audience, which
 * is what makes it demonstrable in one sitting without juggling accounts.
 */
export type ViewMode = 'researcher' | 'fisherman' | 'student' | 'policy'

export const VIEW_MODES: { value: ViewMode; label: string; blurb: string }[] = [
  {
    value: 'researcher',
    label: 'Researcher',
    blurb: 'Scientific names first, full taxonomy, raw figures and model diagnostics.',
  },
  {
    value: 'fisherman',
    label: 'Fisherman',
    blurb: 'Common names first, plain language, practical figures. Jargon hidden.',
  },
  {
    value: 'student',
    label: 'Student',
    blurb: 'Both names, with explanatory context on what each measure means.',
  },
  {
    value: 'policy',
    label: 'Policy maker',
    blurb: 'Common names, trends and totals emphasised over per-record detail.',
  },
]

interface ViewModeState {
  mode: ViewMode
  setMode: (mode: ViewMode) => void
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set) => ({
      mode: 'student',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'oasis-view-mode' },
  ),
)

/** True where the audience should lead with the common name. */
export function prefersCommonName(mode: ViewMode): boolean {
  return mode !== 'researcher'
}

/** True where taxonomy/diagnostics are worth showing at all. */
export function showsTechnicalDetail(mode: ViewMode): boolean {
  return mode === 'researcher' || mode === 'student'
}

/**
 * How to label a species for this audience.
 *
 * Honest fallback: only 110 of the 1,482 species carry a common name, so for
 * most records the common name simply does not exist. Rather than invent one
 * or show an empty label, the scientific name is used and flagged as such —
 * a Fisherman view that silently showed Latin would be worse than one that
 * admits the gap.
 */
export function speciesLabel(
  mode: ViewMode,
  scientificName: string,
  commonName: string | null | undefined,
): { primary: string; secondary: string | null; primaryIsScientific: boolean } {
  if (prefersCommonName(mode) && commonName) {
    return { primary: commonName, secondary: scientificName, primaryIsScientific: false }
  }
  if (prefersCommonName(mode)) {
    return { primary: scientificName, secondary: null, primaryIsScientific: true }
  }
  return { primary: scientificName, secondary: commonName ?? null, primaryIsScientific: true }
}
