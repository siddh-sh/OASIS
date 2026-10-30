import { describe, expect, it } from 'vitest'
import bn from '@/i18n/locales/bn.json'
import en from '@/i18n/locales/en.json'
import gu from '@/i18n/locales/gu.json'
import kn from '@/i18n/locales/kn.json'
import ml from '@/i18n/locales/ml.json'
import mr from '@/i18n/locales/mr.json'
import or_ from '@/i18n/locales/or.json'
import ta from '@/i18n/locales/ta.json'
import te from '@/i18n/locales/te.json'

type Dict = { [key: string]: string | Dict }

function flatten(dict: Dict, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out[path] = value
    else Object.assign(out, flatten(value, path))
  }
  return out
}

/** The parts of a string that code depends on: {{variables}} and <tags>. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}|<\/?(\w+)\s*\/?>/g)].map((m) => m[0].replace(/\s/g, '')).sort()
}

const EN = flatten(en as Dict)
const LANGUAGES = { mr, ml, gu, kn, ta, te, or: or_, bn } as Record<string, unknown>

/**
 * Every UI language is complete: each must cover every English key, and
 * every translation must keep the same interpolation variables and markup
 * tags — a dropped {{count}} or <b> renders wrong without any runtime error.
 */
describe.each(Object.entries(LANGUAGES))('%s dictionary', (_code, dict) => {
  const T = flatten(dict as Dict)

  it('has exactly the keys English has', () => {
    const missing = Object.keys(EN).filter((k) => !(k in T))
    const extra = Object.keys(T).filter((k) => !(k in EN))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  it('has no empty translation', () => {
    expect(Object.entries(T).filter(([, v]) => v.trim() === '').map(([k]) => k)).toEqual([])
  })

  it('keeps every placeholder and tag its English source uses', () => {
    const mismatched = Object.keys(EN)
      .filter((k) => k in T)
      .filter((k) => placeholders(EN[k]).join() !== placeholders(T[k]).join())
      .map((k) => `${k}: en ${placeholders(EN[k])} vs ${placeholders(T[k])}`)
    expect(mismatched).toEqual([])
  })
})

describe('English dictionary', () => {
  it('has no empty translation', () => {
    expect(Object.entries(EN).filter(([, v]) => v.trim() === '').map(([k]) => k)).toEqual([])
  })

  it('pluralised keys have both _one and _other forms', () => {
    const bases = new Set(Object.keys(EN).filter((k) => /_(one|other)$/.test(k)).map((k) => k.replace(/_(one|other)$/, '')))
    expect([...bases].filter((b) => !(`${b}_one` in EN && `${b}_other` in EN))).toEqual([])
  })
})
