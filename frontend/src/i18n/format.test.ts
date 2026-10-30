import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeFormatters } from '@/i18n/format'

describe('date formatting', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uses Odia names when the browser has no Odia date data', () => {
    // Chrome ships without Odia; simulate it so the fallback runs everywhere.
    vi.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockReturnValue([])
    const fmt = makeFormatters('or')
    const tuesday = new Date(2026, 9, 13, 14, 5)
    expect(fmt.date(tuesday)).toBe('13 ଅକ୍ଟୋବର 2026')
    expect(fmt.weekday(tuesday)).toBe('ମଙ୍ଗଳ')
    expect(fmt.monthYear(tuesday)).toBe('ଅକ୍ଟୋବର 2026')
    expect(fmt.dateTime(tuesday)).toMatch(/^13 ଅକ୍ଟୋବର 2026.*14:05$/)
  })

  it('keeps Latin digits and the native Intl output when the language is supported', () => {
    const fmt = makeFormatters('mr')
    expect(fmt.date(new Date(2026, 9, 13))).toMatch(/13/)
    expect(fmt.date(new Date(2026, 9, 13))).not.toMatch(/Oct/)
  })
})
