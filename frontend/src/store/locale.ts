import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n, { type LanguageCode } from '@/i18n'

/**
 * UI language. Two ways a value gets in here:
 *  - `detectFromCoords` (called once from geolocation, see
 *    useGeoLanguage.ts) sets it *only if the visitor has never chosen
 *    explicitly* — `explicit` tracks that so a detected guess never
 *    overwrites a real choice, including on a later visit.
 *  - `setLanguage` (the visible picker) always wins and marks `explicit`.
 *
 * Persisted the same way `viewMode.ts` persists its setting, so a returning
 * visitor keeps whatever they picked without geolocation running again.
 */
interface LocaleState {
  language: LanguageCode
  explicit: boolean
  setLanguage: (language: LanguageCode) => void
  detectFromCoords: (language: LanguageCode) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      language: 'en',
      explicit: false,
      setLanguage: (language) => {
        i18n.changeLanguage(language)
        set({ language, explicit: true })
      },
      detectFromCoords: (language) => {
        if (get().explicit) return
        i18n.changeLanguage(language)
        set({ language })
      },
    }),
    {
      name: 'oasis-locale',
      onRehydrateStorage: () => (state) => {
        if (state) i18n.changeLanguage(state.language)
      },
    },
  ),
)
