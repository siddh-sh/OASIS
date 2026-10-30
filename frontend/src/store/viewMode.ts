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

// Display names and descriptions live in the dictionaries under
// `viewMode.<value>`; this list is only the stable internal values.
export const VIEW_MODES: ViewMode[] = ['researcher', 'fisherman', 'student', 'policy']

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
 * admits the gap. Same logic extends to `vernacularName` — a regional-
 * language name sourced from FishBase/SeaLifeBase/Wikidata (see
 * data-pipeline/cleaning/load_vernacular_names.py), never a machine
 * translation of `commonName`, and just as often simply absent.
 */
export function speciesLabel(
  mode: ViewMode,
  scientificName: string,
  commonName: string | null | undefined,
  vernacularName?: string | null,
): { primary: string; secondary: string | null; primaryIsScientific: boolean } {
  // With a name in the reader's language, the scientific name is the
  // useful second line (the English common name would be a third script).
  if (prefersCommonName(mode) && vernacularName) {
    return { primary: vernacularName, secondary: scientificName, primaryIsScientific: false }
  }
  if (prefersCommonName(mode) && commonName) {
    return { primary: commonName, secondary: scientificName, primaryIsScientific: false }
  }
  if (prefersCommonName(mode)) {
    return { primary: scientificName, secondary: null, primaryIsScientific: true }
  }
  return { primary: scientificName, secondary: vernacularName ?? commonName ?? null, primaryIsScientific: true }
}
