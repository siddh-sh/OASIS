import { useTranslation } from 'react-i18next'
import { PASSWORD_RULES } from '@/auth/passwordPolicy'

export function PasswordChecklist({ password }: { password: string }) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col gap-0.5 text-xs" aria-label={t('password.requirements')}>
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        return (
          <li key={rule.key} className={ok ? 'text-kelp-500' : 'text-ocean-500'}>
            <span aria-hidden="true">{ok ? '✓' : '○'}</span> {t(`password.rules.${rule.key}`)}
            <span className="sr-only">{ok ? ` (${t('password.met')})` : ` (${t('password.notMet')})`}</span>
          </li>
        )
      })}
    </ul>
  )
}
