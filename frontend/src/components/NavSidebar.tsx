import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router-dom'
import {
  AlertIcon, AnchorIcon, ChatIcon, CloseIcon, CollapseIcon, CorrelationIcon, DashboardIcon, DnaIcon, FishIcon,
  OasisEmblem, SatelliteIcon, ShieldIcon, WeatherIcon,
} from '@/components/ocean/icons'
import { useAuth } from '@/hooks/useAuth'
import { useShellStore } from '@/store/shell'

const LINKS = [
  { to: '/dashboard', key: 'dashboard', Icon: DashboardIcon },
  { to: '/ocean', key: 'ocean', Icon: SatelliteIcon },
  { to: '/weather', key: 'weather', Icon: WeatherIcon },
  { to: '/species', key: 'species', Icon: FishIcon },
  { to: '/fisheries', key: 'fisheries', Icon: AnchorIcon },
  { to: '/molecular', key: 'molecular', Icon: DnaIcon },
  { to: '/correlation', key: 'correlation', Icon: CorrelationIcon },
  { to: '/alerts', key: 'alerts', Icon: AlertIcon },
  { to: '/chat', key: 'chatbot', Icon: ChatIcon },
  { to: '/admin', key: 'admin', Icon: ShieldIcon, adminOnly: true },
] as const

function NavItems({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation()
  // The admin page is only offered to admins; the server enforces it anyway.
  const isAdmin = useAuth().profile?.role === 'admin'
  return (
    <ul className="flex flex-col gap-1">
      {LINKS.filter((link) => isAdmin || !('adminOnly' in link)).map(({ to, key, Icon }, i) => (
        <li key={to} className="animate-slide-right" style={{ animationDelay: `${120 + i * 35}ms` }}>
          <NavLink
            to={to}
            onClick={onNavigate}
            title={collapsed ? t(`nav.${key}`) : undefined}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-300',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-[linear-gradient(100deg,rgba(22,217,208,0.20),rgba(39,198,213,0.06))] text-foam shadow-[inset_0_0_0_1px_rgba(22,217,208,0.28),0_0_24px_-6px_rgba(22,217,208,0.45)]'
                  : 'text-ocean-200 hover:bg-[rgba(7,81,106,0.35)] hover:text-foam',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active indicator: a glowing bar that grows in. */}
                <span
                  aria-hidden
                  className={clsx(
                    'absolute top-1/2 left-0 w-[3px] -translate-y-1/2 rounded-full bg-turquoise shadow-[0_0_10px_#16d9d0] transition-all duration-500',
                    isActive ? 'h-5 opacity-100' : 'h-0 opacity-0',
                  )}
                />
                <Icon size={18} className={clsx('shrink-0 transition-colors', isActive ? 'text-turquoise' : 'text-ocean-300 group-hover:text-turquoise')} />
                {!collapsed && <span className="truncate">{t(`nav.${key}`)}</span>}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

function Brand({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  return (
    <Link to="/" className={clsx('mb-6 flex items-center gap-3 rounded-xl px-2 py-1', collapsed && 'justify-center px-0')} title={t('nav.home')}>
      <OasisEmblem size={34} className="shrink-0" />
      {!collapsed && (
        <span className="min-w-0">
          <span className="block text-base font-semibold tracking-[0.18em] text-foam">{t('nav.appName')}</span>
          <span className="block truncate text-[11px] text-mist">{t('nav.tagline')}</span>
        </span>
      )}
    </Link>
  )
}

export function NavSidebar() {
  const { t } = useTranslation()
  const { collapsed, toggleCollapsed, drawerOpen, setDrawerOpen } = useShellStore()

  return (
    <>
      {/* Desktop: a floating glass rail that can collapse to icons. */}
      <nav
        aria-label={t('nav.appName')}
        className={clsx(
          'glass-panel animate-slide-right relative m-3 mr-0 hidden shrink-0 flex-col p-3 transition-[width] duration-500 ease-[var(--ease-out)] lg:flex',
          collapsed ? 'w-[72px]' : 'w-60',
        )}
      >
        <Brand collapsed={collapsed} />
        <div className="oasis-scroll -mx-1 flex-1 overflow-y-auto px-1" data-lenis-prevent>
          <NavItems collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t('header.expandMenu') : t('header.collapseMenu')}
          aria-expanded={!collapsed}
          className={clsx('btn-glass mt-3 flex items-center gap-2 px-3 py-2 text-xs text-mist', collapsed && 'justify-center px-0')}
        >
          <CollapseIcon size={16} className={clsx('transition-transform duration-500', collapsed && 'rotate-180')} />
          {!collapsed && t('header.collapseMenu')}
        </button>
      </nav>

      {/* Mobile and tablet: the same items in a slide-in drawer. */}
      <div className={clsx('fixed inset-0 z-[1100] lg:hidden', drawerOpen ? 'pointer-events-auto' : 'pointer-events-none')}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={clsx('absolute inset-0 bg-[rgba(2,14,21,0.6)] backdrop-blur-sm transition-opacity duration-300', drawerOpen ? 'opacity-100' : 'opacity-0')}
        />
        <nav
          aria-label={t('nav.appName')}
          aria-hidden={!drawerOpen}
          className={clsx(
            'glass-panel absolute inset-y-3 left-3 flex w-72 max-w-[calc(100vw-24px)] flex-col p-3 transition-transform duration-500 ease-[var(--ease-out)]',
            drawerOpen ? 'translate-x-0' : '-translate-x-[110%]',
          )}
        >
          <div className="flex items-start justify-between">
            <Brand collapsed={false} />
            <button type="button" onClick={() => setDrawerOpen(false)} aria-label={t('header.closeMenu')} className="btn-glass p-2">
              <CloseIcon size={16} />
            </button>
          </div>
          <div className="oasis-scroll flex-1 overflow-y-auto" data-lenis-prevent>
            {drawerOpen && <NavItems collapsed={false} onNavigate={() => setDrawerOpen(false)} />}
          </div>
        </nav>
      </div>
    </>
  )
}
