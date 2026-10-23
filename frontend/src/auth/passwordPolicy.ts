/**
 * Password rules for signup and reset. Mirrors backend/app/schemas/auth.py,
 * which is what actually enforces them — this copy only drives the live
 * checklist so users see what's missing before they submit.
 *
 * Login deliberately doesn't use this: accounts created before the policy
 * existed must still be able to sign in.
 */
export const PASSWORD_RULES = [
  { key: 'minLength', test: (p: string) => p.length >= 8 },
  { key: 'uppercase', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lowercase', test: (p: string) => /[a-z]/.test(p) },
  { key: 'number', test: (p: string) => /[0-9]/.test(p) },
  { key: 'special', test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
  // bcrypt (Supabase's hash) ignores everything past 72 bytes.
  { key: 'noSpaces', test: (p: string) => p.length > 0 && p.length <= 72 && !/\s/.test(p) },
] as const

export type PasswordRuleKey = (typeof PASSWORD_RULES)[number]['key']

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}
