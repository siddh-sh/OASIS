import i18n from '@/i18n'
import { ApiError } from '@/api/apiError'

/**
 * A failure, explained in the reader's language.
 *
 * Server `detail` strings are English diagnostics written for developers
 * (and sometimes come from upstream services like Supabase), so they are not
 * translated. Instead the user gets a translated sentence for the kind of
 * failure, with the server's detail kept after it for anyone diagnosing.
 */
export function describeError(error: unknown): string {
  const t = i18n.t.bind(i18n)
  if (error instanceof ApiError) {
    const kind =
      error.status === 401 || error.status === 403
        ? t('errors.notAuthorized')
        : error.status === 404
          ? t('errors.notFound')
          : error.status === 422 || error.status === 400
            ? t('errors.invalidRequest')
            : error.status === 429
              ? t('errors.rateLimited')
              : error.status === 503
                ? t('errors.unavailable')
                : t('errors.server')
    return error.message && error.message !== kind ? `${kind} (${error.message})` : kind
  }
  // fetch() rejects with a TypeError when the server can't be reached.
  if (error instanceof TypeError) return t('errors.network')
  const message = error instanceof Error ? error.message : String(error)
  return message ? `${t('errors.generic')} (${message})` : t('errors.generic')
}

/**
 * Auth failures, with the cases a user can act on named specifically.
 * Validation messages (422) are the backend's own rule list — the forms
 * check the same rules live, so this is rarely reached — and are appended.
 */
export function describeAuthError(error: unknown, action: 'login' | 'signup' | 'forgot' | 'reset'): string {
  const t = i18n.t.bind(i18n)
  if (!(error instanceof ApiError)) return describeError(error)
  if (action === 'login' && (error.status === 400 || error.status === 401)) return t('login.errors.invalidCredentials')
  if (action === 'reset' && (error.status === 401 || error.status === 403)) return t('login.resetLinkInvalid')
  if (error.status === 429) return action === 'forgot' ? t('login.errors.tooManyResetEmails') : t('errors.rateLimited')
  if (action === 'signup' && error.status === 400 && /registered|exists/i.test(error.message)) {
    return t('login.errors.alreadyRegistered')
  }
  if (error.status === 422) return `${t('login.errors.checkInput')} (${error.message})`
  return describeError(error)
}
