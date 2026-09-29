import { useEffect } from 'react'
import { regionsApi } from '@/api/regions'
import { STATE_TO_LANGUAGE } from '@/i18n'
import { useLocaleStore } from '@/store/locale'

/**
 * Runs once per session. Tries browser geolocation, then resolves the point
 * to a coastal state via the same boundary polygons used for species-region
 * shapes (`/api/regions/locate`), and suggests that state's language as the
 * default — but only if the visitor has never explicitly picked one
 * (`detectFromCoords` no-ops otherwise; see store/locale.ts).
 *
 * Silent on any failure — no permission prompt nagging, no error banner. A
 * visitor outside the 9 covered states, who denies the permission prompt, or
 * whose browser has no geolocation support just stays on the default/
 * previously-chosen language. The explicit picker is always right there
 * regardless of whether this ever runs.
 */
export function useGeoLanguage() {
  const explicit = useLocaleStore((s) => s.explicit)
  const detectFromCoords = useLocaleStore((s) => s.detectFromCoords)

  useEffect(() => {
    if (explicit) return
    if (!('geolocation' in navigator)) return

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        regionsApi
          .locate(pos.coords.latitude, pos.coords.longitude)
          .then((result) => {
            if (!result.matched || !result.state) return
            const language = STATE_TO_LANGUAGE[result.state]
            if (language) detectFromCoords(language)
          })
          .catch(() => {
            // Backend unreachable or the point matched nothing — stay put.
          })
      },
      () => {
        // Permission denied, timed out, or position unavailable — stay put.
      },
      { timeout: 8000, maximumAge: 3_600_000 },
    )
    // Intentionally runs once per mount, not on every render — `explicit` and
    // `detectFromCoords` are read fresh from the store either way.
  }, [])
}
