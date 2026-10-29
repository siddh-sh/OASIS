import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { checkEmail, normalizeEmail } from '@/auth/emailPolicy'
import { isPasswordValid } from '@/auth/passwordPolicy'
import { EmailInput } from '@/components/EmailInput'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { PasswordChecklist } from '@/components/PasswordChecklist'
import { useAuth } from '@/hooks/useAuth'
import { requestPasswordReset } from '@/store/auth'

const inputClass = 'rounded-md border border-ocean-300 px-3 py-2 text-sm dark:border-ocean-700 dark:bg-ocean-950'

export function LoginPage() {
  const { login, signup, isAuthenticated, isLoading, error } = useAuth()
  const { t } = useTranslation()
  // `?mode=signup` lets the homepage's Sign up button open this tab directly.
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(searchParams.get('mode') === 'signup' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [institution, setInstitution] = useState('')
  // Forgot-password state is local: it never touches the session store.
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  // Set on the first submit so field problems show even if the user never
  // left the email box.
  const [attempted, setAttempted] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    // A suspected typo blocks signup, but on login it's only a hint: the
    // account already exists under whatever address it was created with.
    const issue = checkEmail(email)
    if (issue && (mode === 'signup' || issue.kind === 'format')) return
    try {
      if (mode === 'login') {
        await login(normalizeEmail(email), password)
      } else {
        await signup(normalizeEmail(email), password, fullName || undefined, institution || undefined)
      }
      navigate('/dashboard')
    } catch {
      // error is already surfaced via useAuth().error
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)
    if (checkEmail(email)) return
    setResetSending(true)
    setResetError(null)
    try {
      await requestPasswordReset(normalizeEmail(email))
      setResetSent(true)
    } catch (err) {
      setResetError((err as Error).message)
    } finally {
      setResetSending(false)
    }
  }

  function switchMode(m: typeof mode) {
    setMode(m)
    setResetSent(false)
    setResetError(null)
    setAttempted(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ocean-50 dark:bg-ocean-950">
      <div className="w-full max-w-sm rounded-xl border border-ocean-200 bg-white p-8 shadow-sm dark:border-ocean-800 dark:bg-ocean-900">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <h1 className="mb-1 text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('nav.appName')}</h1>
        <p className="mb-6 text-sm text-ocean-500">{t('login.tagline')}</p>

        {/* The form stays usable for a signed-in visitor (e.g. switching
            accounts from the homepage); this just offers the shortcut. */}
        {isAuthenticated && (
          <p className="mb-4 rounded-md bg-ocean-100 px-3 py-2 text-sm text-ocean-700 dark:bg-ocean-950 dark:text-ocean-200">
            {t('login.alreadySignedIn')}{' '}
            <Link to="/dashboard" className="font-medium underline">{t('login.continueToDashboard')}</Link>
          </p>
        )}

        {mode === 'forgot' ? (
          <form onSubmit={handleForgot} className="flex flex-col gap-3">
            <h2 className="text-base font-medium text-ocean-950 dark:text-ocean-50">{t('login.forgotTitle')}</h2>
            {resetSent ? (
              <p className="text-sm text-kelp-500">{t('login.resetSent')}</p>
            ) : (
              <>
                <p className="text-sm text-ocean-500">{t('login.forgotHelp')}</p>
                <EmailInput value={email} onChange={setEmail} className={inputClass} showErrors={attempted} />
                {resetError && <p className="text-sm text-coral-500">{resetError}</p>}
                <button
                  type="submit"
                  disabled={resetSending}
                  className="mt-2 rounded-md bg-ocean-600 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {resetSending ? t('login.working') : t('login.sendResetLink')}
                </button>
              </>
            )}
            <button type="button" onClick={() => switchMode('login')} className="text-sm text-ocean-500 hover:underline">
              {t('login.backToLogin')}
            </button>
          </form>
        ) : (
          <>
            <div className="mb-6 flex rounded-md bg-ocean-100 p-1 text-sm dark:bg-ocean-950">
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                    mode === m ? 'bg-white text-ocean-900 shadow-sm dark:bg-ocean-800 dark:text-white' : 'text-ocean-500'
                  }`}
                >
                  {t(`login.${m}Tab`)}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === 'signup' && (
                <>
                  <input
                    placeholder={t('login.fullName')}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputClass}
                  />
                  <input
                    placeholder={t('login.institution')}
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className={inputClass}
                  />
                </>
              )}
              <EmailInput value={email} onChange={setEmail} className={inputClass} showErrors={attempted} />
              <input
                type="password"
                required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder={t('login.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              {mode === 'signup' && <PasswordChecklist password={password} />}
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="self-end text-xs text-ocean-500 hover:underline"
                >
                  {t('login.forgotPassword')}
                </button>
              )}
              {error && <p className="text-sm text-coral-500">{error}</p>}
              <button
                type="submit"
                disabled={isLoading || (mode === 'signup' && !isPasswordValid(password))}
                className="mt-2 rounded-md bg-ocean-600 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isLoading ? t('login.working') : mode === 'login' ? t('login.logInButton') : t('login.signUpButton')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
