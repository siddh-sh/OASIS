import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { isPasswordValid } from '@/auth/passwordPolicy'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { PasswordChecklist } from '@/components/PasswordChecklist'
import { resetPassword } from '@/store/auth'

const inputClass = 'rounded-md border border-ocean-300 px-3 py-2 text-sm dark:border-ocean-700 dark:bg-ocean-950'

/**
 * Landing page for the emailed reset link. Supabase verifies the link and
 * redirects here with the recovery token in the URL fragment
 * (#access_token=...&type=recovery), or with #error_description=... when
 * the link has expired or was already used.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const { token, linkError } = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    return {
      token: params.get('type') === 'recovery' ? params.get('access_token') : null,
      linkError: params.get('error_description'),
    }
  }, [])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mismatch = confirm.length > 0 && confirm !== password

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      await resetPassword(token, password)
      // Don't leave a live recovery token sitting in the address bar/history.
      window.history.replaceState(null, '', window.location.pathname)
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ocean-50 dark:bg-ocean-950">
      <div className="w-full max-w-sm rounded-xl border border-ocean-200 bg-white p-8 shadow-sm dark:border-ocean-800 dark:bg-ocean-900">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <h1 className="mb-6 text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('login.resetTitle')}</h1>

        {done ? (
          <p className="text-sm text-kelp-500">{t('login.resetDone')}</p>
        ) : !token ? (
          <p className="text-sm text-coral-500">{linkError ?? t('login.resetLinkInvalid')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder={t('login.newPassword')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <PasswordChecklist password={password} />
            <input
              type="password"
              required
              autoComplete="new-password"
              placeholder={t('login.confirmPassword')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
            {mismatch && <p className="text-sm text-coral-500">{t('login.passwordsDontMatch')}</p>}
            {error && <p className="text-sm text-coral-500">{error}</p>}
            <button
              type="submit"
              disabled={saving || !isPasswordValid(password) || confirm !== password}
              className="mt-2 rounded-md bg-ocean-600 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? t('login.working') : t('login.setNewPassword')}
            </button>
          </form>
        )}

        <Link to="/login" className="mt-4 block text-center text-sm text-ocean-500 hover:underline">
          {t('login.backToLogin')}
        </Link>
      </div>
    </div>
  )
}
