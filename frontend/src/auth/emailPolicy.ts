/**
 * Email checks for the auth forms. Mirrors backend/app/schemas/auth.py,
 * which additionally confirms the domain can actually receive mail (a DNS
 * lookup the browser can't do).
 *
 * The typo check exists because a mistyped address on signup or password
 * reset fails silently: the confirmation/reset email just never arrives.
 */

// The browser's own type="email" check accepts "a@b"; this requires a dot
// and an alphabetic TLD, and no spaces anywhere.
const EMAIL_FORMAT = /^[^\s@]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i

// Exact matches are never "corrected", so real domains that sit close to
// another one (ymail.com / mail.com vs gmail.com, yahoo.in vs yahoo.com)
// are listed too.
export const COMMON_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'mail.com',
  'yahoo.com',
  'yahoo.in',
  'yahoo.co.in',
  'yahoo.co.uk',
  'ymail.com',
  'rediffmail.com',
  'outlook.com',
  'outlook.in',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.in',
  'icloud.com',
  'me.com',
  'protonmail.com',
  'proton.me',
]

// Only major providers are suggested, and only within a small edit
// distance — a looser match would "correct" real, unrelated domains
// (abc.com is two edits from me.com). Unknown domains that merely don't
// exist are left to the backend's DNS check.
const SUGGESTION_TARGETS = ['gmail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'icloud.com', 'rediffmail.com']

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** The likely-intended address when the domain is a near-miss of a common provider. */
export function suggestEmail(email: string): string | null {
  const [local, domain] = normalizeEmail(email).split('@')
  if (!local || !domain || COMMON_DOMAINS.includes(domain)) return null
  let best: string | null = null
  let bestDistance = 3
  for (const candidate of SUGGESTION_TARGETS) {
    const d = editDistance(domain, candidate)
    if (d < bestDistance && d <= (candidate.length >= 9 ? 2 : 1)) {
      best = candidate
      bestDistance = d
    }
  }
  return best ? `${local}@${best}` : null
}

export type EmailIssue = { kind: 'format' } | { kind: 'typo'; suggestion: string }

export function checkEmail(email: string): EmailIssue | null {
  if (!EMAIL_FORMAT.test(normalizeEmail(email))) return { kind: 'format' }
  const suggestion = suggestEmail(email)
  return suggestion ? { kind: 'typo', suggestion } : null
}
