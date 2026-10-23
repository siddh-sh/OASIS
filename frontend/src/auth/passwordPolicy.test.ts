import { describe, expect, it } from 'vitest'
import { PASSWORD_RULES, isPasswordValid } from '@/auth/passwordPolicy'

const failing = (p: string) => PASSWORD_RULES.filter((r) => !r.test(p)).map((r) => r.key)

describe('passwordPolicy', () => {
  it('accepts a password meeting every rule', () => {
    expect(isPasswordValid('Ocean-Tide42')).toBe(true)
  })

  it.each([
    ['Sh0rt!', 'minLength'],
    ['lowercase-only1', 'uppercase'],
    ['UPPERCASE-ONLY1', 'lowercase'],
    ['No-Digits-Here', 'number'],
    ['NoSpecial123', 'special'],
    ['Has Space-123', 'noSpaces'],
    [`Aa1!${'x'.repeat(69)}`, 'noSpaces'],
  ])('rejects %j for %s', (password, rule) => {
    expect(failing(password)).toEqual([rule])
    expect(isPasswordValid(password)).toBe(false)
  })
})
