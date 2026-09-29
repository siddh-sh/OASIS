import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useAuth } from '@/hooks/useAuth'

export function LoginPage() {
  const { login, signup, isAuthenticated, isLoading, error } = useAuth()
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [institution, setInstitution] = useState('')
  const navigate = useNavigate()

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await signup(email, password, fullName || undefined, institution || undefined)
      }
      navigate('/dashboard')
    } catch {
      // error is already surfaced via useAuth().error
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ocean-50 dark:bg-ocean-950">
      <div className="w-full max-w-sm rounded-xl border border-ocean-200 bg-white p-8 shadow-sm dark:border-ocean-800 dark:bg-ocean-900">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <h1 className="mb-1 text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('nav.appName')}</h1>
        <p className="mb-6 text-sm text-ocean-500">{t('login.tagline')}</p>

        <div className="mb-6 flex rounded-md bg-ocean-100 p-1 text-sm dark:bg-ocean-950">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
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
                className="rounded-md border border-ocean-300 px-3 py-2 text-sm dark:border-ocean-700 dark:bg-ocean-950"
              />
              <input
                placeholder={t('login.institution')}
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="rounded-md border border-ocean-300 px-3 py-2 text-sm dark:border-ocean-700 dark:bg-ocean-950"
              />
            </>
          )}
          <input
            type="email"
            required
            placeholder={t('login.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-ocean-300 px-3 py-2 text-sm dark:border-ocean-700 dark:bg-ocean-950"
          />
          <input
            type="password"
            required
            placeholder={t('login.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-ocean-300 px-3 py-2 text-sm dark:border-ocean-700 dark:bg-ocean-950"
          />
          {error && <p className="text-sm text-coral-500">{error}</p>}
          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 rounded-md bg-ocean-600 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isLoading ? t('login.working') : mode === 'login' ? t('login.logInButton') : t('login.signUpButton')}
          </button>
        </form>
      </div>
    </div>
  )
}
