import i18n from '@/i18n'

/**
 * Translate a key assembled from runtime data — a database enum, a weather
 * code, a region name — where the set of values is open-ended. Falls back to
 * `fallback` (normally the raw value) when the dictionary has no entry, so an
 * unexpected value shows as itself rather than as a raw key path.
 *
 * Use plain `t('…')` for fixed keys: those are type-checked and a typo fails
 * the build. This escape hatch is only for keys the compiler cannot know.
 * Callers still subscribe via useTranslation(), so they re-render on a
 * language change.
 */
export function tDynamic(key: string, fallback: string, options?: Record<string, unknown>): string {
  if (!i18n.exists(key)) return fallback
  return (i18n.t as unknown as (k: string, o?: Record<string, unknown>) => string)(key, options)
}

/**
 * Place and region names stored in the database (states, EEZs, FAO areas,
 * coastal stations). Proper nouns with an established Marathi spelling are
 * listed under `places` in each dictionary; anything else is shown as stored.
 */
export function placeName(name: string | null | undefined): string {
  if (!name) return ''
  const places = i18n.t('places', { returnObjects: true }) as unknown as Record<string, string>
  return (places && typeof places === 'object' && places[name]) || name
}
