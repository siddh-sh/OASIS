import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/dashboard', key: 'dashboard' },
  { to: '/ocean', key: 'ocean' },
  { to: '/weather', key: 'weather' },
  { to: '/species', key: 'species' },
  { to: '/fisheries', key: 'fisheries' },
  { to: '/molecular', key: 'molecular' },
  { to: '/correlation', key: 'correlation' },
  { to: '/alerts', key: 'alerts' },
  { to: '/chat', key: 'chatbot' },
  { to: '/admin', key: 'admin' },
] as const

export function NavSidebar() {
  const { t } = useTranslation()

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-ocean-200 bg-ocean-50 p-3 dark:border-ocean-800 dark:bg-ocean-950">
      <div className="mb-4 px-2 py-1">
        <span className="text-lg font-semibold text-ocean-900 dark:text-ocean-50">{t('nav.appName')}</span>
        <p className="text-xs text-ocean-500">{t('nav.tagline')}</p>
      </div>
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) =>
            clsx(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-ocean-600 text-white'
                : 'text-ocean-800 hover:bg-ocean-100 dark:text-ocean-200 dark:hover:bg-ocean-900',
            )
          }
        >
          {t(`nav.${link.key}`)}
        </NavLink>
      ))}
    </nav>
  )
}
