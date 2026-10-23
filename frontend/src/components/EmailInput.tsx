import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { checkEmail } from '@/auth/emailPolicy'

/**
 * Email field that explains what's wrong instead of letting a bad address
 * through. Problems are shown once the user leaves the field (or once the
 * parent marks the form as submitted), not on every keystroke.
 */
export function EmailInput({
  value,
  onChange,
  className,
  showErrors = false,
}: {
  value: string
  onChange: (value: string) => void
  className: string
  showErrors?: boolean
}) {
  const { t } = useTranslation()
  const [touched, setTouched] = useState(false)
  const issue = value ? checkEmail(value) : null
  const visible = (touched || showErrors) && issue

  return (
    <div className="flex flex-col gap-1">
      <input
        type="email"
        required
        autoComplete="email"
        placeholder={t('login.email')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={!!visible}
        className={className}
      />
      {visible && issue.kind === 'format' && <p className="text-xs text-coral-500">{t('login.emailInvalid')}</p>}
      {visible && issue.kind === 'typo' && (
        <p className="text-xs text-coral-500">
          {t('login.emailDidYouMean')}{' '}
          <button
            type="button"
            onClick={() => onChange(issue.suggestion)}
            className="font-medium text-ocean-500 underline"
          >
            {issue.suggestion}
          </button>
          ?
        </p>
      )}
    </div>
  )
}
