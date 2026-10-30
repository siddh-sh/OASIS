import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Locale-aware formatting for numbers and dates, shared by every page so the
 * policy lives in one place.
 *
 * Policy: digits stay Latin (0–9) in every language — coordinates, sensor
 * readings, coefficients and chart axes are scientific values that readers
 * cross-check against other sources, and a mixed-numeral UI (Devanagari in
 * prose, Latin on chart ticks drawn by the library) would be worse than
 * either. Everything else follows the language: digit grouping (Marathi uses
 * the Indian 12,34,567 grouping), month and weekday names, date order.
 * Only presentation changes; the underlying values are never rounded
 * differently per language.
 */
const LOCALE_TAGS: Record<string, string> = {
  en: 'en-GB',
  mr: 'mr-IN',
  ml: 'ml-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  or: 'or-IN',
  bn: 'bn-IN',
}

export function localeTag(language: string): string {
  return `${LOCALE_TAGS[language] ?? 'en-GB'}-u-nu-latn`
}

/**
 * Month and weekday names for languages a browser may ship without: Chrome
 * and Edge have no Odia date data and silently format in English. Taken
 * from CLDR (what Safari and Node use), January…December and Sunday…Saturday.
 */
const FALLBACK_NAMES: Record<string, { months: string[]; weekdays: string[] }> = {
  or: {
    months: ['ଜାନୁଆରୀ', 'ଫେବୃଆରୀ', 'ମାର୍ଚ୍ଚ', 'ଅପ୍ରେଲ', 'ମଇ', 'ଜୁନ', 'ଜୁଲାଇ', 'ଅଗଷ୍ଟ', 'ସେପ୍ଟେମ୍ବର', 'ଅକ୍ଟୋବର', 'ନଭେମ୍ବର', 'ଡିସେମ୍ବର'],
    weekdays: ['ରବି', 'ସୋମ', 'ମଙ୍ଗଳ', 'ବୁଧ', 'ଗୁରୁ', 'ଶୁକ୍ର', 'ଶନି'],
  },
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

export function makeFormatters(language: string) {
  const tag = localeTag(language)
  const number = (value: number, maximumFractionDigits = 0, minimumFractionDigits = 0) =>
    new Intl.NumberFormat(tag, { maximumFractionDigits, minimumFractionDigits }).format(value)
  const names = Intl.DateTimeFormat.supportedLocalesOf([tag]).length ? undefined : FALLBACK_NAMES[language]
  const dateWith = (options: Intl.DateTimeFormatOptions) => (value: string | number | Date) => {
    const date = toDate(value)
    if (!names) return new Intl.DateTimeFormat(tag, options).format(date)
    // Day-month-year order and 24-hour time from en-GB, names swapped in.
    return new Intl.DateTimeFormat('en-GB', options)
      .formatToParts(date)
      .map((part) =>
        part.type === 'month'
          ? names.months[date.getMonth()]
          : part.type === 'weekday'
            ? names.weekdays[date.getDay()]
            : part.value,
      )
      .join('')
  }

  return {
    locale: tag,
    /** Grouped integer, e.g. 6,356,492 (en) / 63,56,492 (mr). */
    int: (value: number) => number(Math.round(value)),
    /** Fixed decimals with locale grouping — same precision in every language. */
    fixed: (value: number, digits: number) => number(value, digits, digits),
    /** Up to `digits` decimals, trailing zeros dropped. */
    num: (value: number, digits = 2) => number(value, digits),
    /** 23 Oct 2026 / २३ ऑक्टो, २०२६ (with Latin digits). */
    date: dateWith({ day: 'numeric', month: 'short', year: 'numeric' }),
    dateTime: dateWith({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    weekday: dateWith({ weekday: 'short' }),
    monthYear: dateWith({ month: 'short', year: 'numeric' }),
  }
}

export type Formatters = ReturnType<typeof makeFormatters>

/** Formatters bound to the active language; re-created when it changes. */
export function useFormat(): Formatters {
  const { i18n } = useTranslation()
  return useMemo(() => makeFormatters(i18n.language), [i18n.language])
}
