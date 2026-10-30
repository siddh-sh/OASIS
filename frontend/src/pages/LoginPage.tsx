import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { checkEmail, normalizeEmail } from '@/auth/emailPolicy'
import { isPasswordValid } from '@/auth/passwordPolicy'
import { EmailInput } from '@/components/EmailInput'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { OceanBackground } from '@/components/ocean/OceanBackground'
import { OceanGlobe } from '@/components/ocean/OceanGlobe'
import { EyeIcon, EyeOffIcon, OasisEmblem } from '@/components/ocean/icons'
import { PasswordChecklist } from '@/components/PasswordChecklist'
import reef from '@/assets/home/reef.webp'
import { useAuth } from '@/hooks/useAuth'
import { describeAuthError } from '@/i18n/errors'
import { requestPasswordReset } from '@/store/auth'

const inputClass = 'glass-input'

export function LoginPage() {
  const { login, signup, isAuthenticated, isLoading, error } = useAuth()
  const { t } = useTranslation()
  // `?mode=signup` lets the homepage's Sign up button open this tab directly.
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(searchParams.get('mode') === 'signup' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [institution, setInstitution] = useState('')
  // Forgot-password state is local: it never touches the session store.
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState<unknown>(null)
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
      setResetError(err)
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

  const spinner = <span aria-hidden className="h-4 w-4 animate-[oasis-spin_0.8s_linear_infinite] rounded-full border-2 border-abyss/30 border-t-abyss" />

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 text-ocean-100">
      <OceanBackground image={reef} />
      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        {/* Brand side — desktop only; the card carries the essentials on phones. */}
        <div className="hidden flex-col gap-6 lg:flex">
          <Link to="/" className="animate-rise flex items-center gap-3 self-start" style={{ ['--i' as string]: 0 }}>
            <OasisEmblem size={44} />
            <span>
              <span className="block text-xl font-semibold tracking-[0.22em] text-foam">{t('nav.appName')}</span>
              <span className="block text-xs text-mist">{t('nav.tagline')}</span>
            </span>
          </Link>
          <h1 className="animate-rise font-display text-5xl leading-[1.08] font-medium text-foam" style={{ ['--i' as string]: 1 }}>
            <span className="text-ocean-gradient italic">{t('login.welcomeBack')}</span>
          </h1>
          <p className="animate-rise max-w-md text-lg leading-relaxed text-mist" style={{ ['--i' as string]: 2 }}>{t('login.tagline')}</p>
          <OceanGlobe size={150} className="animate-rise mt-4" />
        </div>

      <div className="glass-panel animate-rise w-full max-w-md justify-self-center p-7 sm:p-9" style={{ ['--i' as string]: 1 }}>
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <OasisEmblem size={30} />
            <span className="text-base font-semibold tracking-[0.2em] text-foam">{t('nav.appName')}</span>
          </Link>
          <div className="ml-auto"><LanguageSwitcher /></div>
        </div>
        <h2 className="mb-1 text-2xl font-semibold text-foam lg:hidden">{t('login.welcomeBack')}</h2>
        <p className="mb-6 text-sm text-mist lg:hidden">{t('login.tagline')}</p>

        {/* The form stays usable for a signed-in visitor (e.g. switching
            accounts from the homepage); this just offers the shortcut. */}
        {isAuthenticated && (
          <p className="mb-4 rounded-xl border border-[var(--glass-line)] bg-[rgba(22,217,208,0.08)] px-3 py-2 text-sm text-ocean-100">
            {t('login.alreadySignedIn')}{' '}
            <Link to="/dashboard" className="font-medium underline">{t('login.continueToDashboard')}</Link>
          </p>
        )}

        {mode === 'forgot' ? (
          <form onSubmit={handleForgot} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium text-foam">{t('login.forgotTitle')}</h2>
            {resetSent ? (
              <p role="status" className="animate-fade rounded-xl border border-kelp-500/40 bg-kelp-500/10 px-3 py-2 text-sm text-kelp-400">{t('login.resetSent')}</p>
            ) : (
              <>
                <p className="text-sm text-mist">{t('login.forgotHelp')}</p>
                <EmailInput value={email} onChange={setEmail} className={inputClass} showErrors={attempted} />
                {resetError != null && (
                  <p role="alert" className="animate-fade rounded-xl border border-coral-500/40 bg-coral-500/10 px-3 py-2 text-sm text-coral-400">
                    {describeAuthError(resetError, 'forgot')}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={resetSending}
                  className="btn-ocean mt-2 flex items-center justify-center gap-2 py-3 text-sm"
                >
                  {resetSending && spinner}
                  {resetSending ? t('login.working') : t('login.sendResetLink')}
                </button>
              </>
            )}
            <button type="button" onClick={() => switchMode('login')} className="text-sm text-cyan transition-colors hover:text-turquoise">
              {t('login.backToLogin')}
            </button>
          </form>
        ) : (
          <>
            {/* Tabs with a sliding glass indicator. */}
            <div role="tablist" className="relative mb-6 grid grid-cols-2 rounded-xl border border-[var(--glass-line)] bg-[rgba(3,29,42,0.5)] p-1 text-sm">
              <span
                aria-hidden
                className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-[linear-gradient(110deg,rgba(22,217,208,0.28),rgba(39,198,213,0.12))] shadow-[inset_0_0_0_1px_rgba(22,217,208,0.35)] transition-transform duration-500 ease-[var(--ease-out)]"
                style={{ transform: mode === 'signup' ? 'translateX(100%)' : 'none' }}
              />
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={`relative z-10 rounded-lg py-2 font-medium transition-colors duration-300 ${mode === m ? 'text-foam' : 'text-mist hover:text-ocean-100'}`}
                >
                  {t(`login.${m}Tab`)}
                </button>
              ))}
            </div>

            <form key={mode} onSubmit={handleSubmit} className="animate-fade flex flex-col gap-3">
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
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder={t('login.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-mist transition-colors hover:text-turquoise"
                >
                  {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
              {mode === 'signup' && <PasswordChecklist password={password} />}
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="self-end text-xs text-cyan transition-colors hover:text-turquoise"
                >
                  {t('login.forgotPassword')}
                </button>
              )}
              {error && (
                <p role="alert" className="animate-fade rounded-xl border border-coral-500/40 bg-coral-500/10 px-3 py-2 text-sm text-coral-400">
                  {describeAuthError(error, mode === 'signup' ? 'signup' : 'login')}
                </p>
              )}
              <button
                type="submit"
                disabled={isLoading || (mode === 'signup' && !isPasswordValid(password))}
                className="btn-ocean mt-2 flex items-center justify-center gap-2 py-3 text-sm"
              >
                {isLoading && spinner}
                {isLoading ? t('login.working') : mode === 'login' ? t('login.logInButton') : t('login.signUpButton')}
              </button>
            </form>
          </>
        )}
      </div>
      </div>
    </div>
  )
}
