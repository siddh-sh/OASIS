import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { consumeReload, useRefreshPreference } from '@/store/refreshPreference'

/**
 * Shown once after a reload inside the platform: stay here, or go to the
 * public homepage. A remembered answer skips the prompt (and is changeable
 * later in Settings).
 */
export function RefreshPrompt() {
  const { t } = useTranslation()
  const choice = useRefreshPreference((s) => s.choice)
  const setChoice = useRefreshPreference((s) => s.setChoice)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(false)
  const stayRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!consumeReload()) return
    if (choice === 'home') navigate('/', { replace: true })
    else if (choice === 'ask') setOpen(true)
    // Re-running on a dependency change is harmless: consumeReload() only
    // answers true once per document load.
  }, [choice, navigate])

  useEffect(() => {
    if (!open) return
    stayRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  function decide(next: 'stay' | 'home') {
    if (remember) setChoice(next)
    setOpen(false)
    if (next === 'home') navigate('/')
  }

  return (
    <div
      role="dialog"
      aria-labelledby="refresh-prompt-title"
      className="fixed right-4 bottom-4 z-50 w-[min(92vw,22rem)] rounded-xl border border-ocean-200 bg-white p-4 shadow-lg dark:border-ocean-700 dark:bg-ocean-900"
    >
      <p id="refresh-prompt-title" className="text-sm font-semibold text-ocean-950 dark:text-ocean-50">
        {t('refresh.title')}
      </p>
      <p className="mt-1 text-sm text-ocean-600 dark:text-ocean-300">{t('refresh.question')}</p>
      <div className="mt-3 flex gap-2">
        <button
          ref={stayRef}
          type="button"
          onClick={() => decide('stay')}
          className="flex-1 rounded-md border border-ocean-300 px-3 py-1.5 text-sm text-ocean-700 hover:bg-ocean-100 dark:border-ocean-700 dark:text-ocean-200 dark:hover:bg-ocean-800"
        >
          {t('refresh.stay')}
        </button>
        <button
          type="button"
          onClick={() => decide('home')}
          className="flex-1 rounded-md bg-ocean-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-ocean-700"
        >
          {t('refresh.home')}
        </button>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-ocean-600 dark:text-ocean-300">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {t('refresh.remember')}
      </label>
    </div>
  )
}
