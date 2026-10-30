import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { NavSidebar } from '@/components/NavSidebar'
import { OceanBackground } from '@/components/ocean/OceanBackground'
import { LogoutIcon, MenuIcon, SettingsIcon } from '@/components/ocean/icons'
import { RefreshPrompt } from '@/components/RefreshPrompt'
import { ViewModeSwitcher } from '@/components/ViewModeSwitcher'
import { useAuth } from '@/hooks/useAuth'
import { tDynamic } from '@/i18n/dynamic'
import { useLenis } from '@/hooks/useLenis'
import { useShellStore } from '@/store/shell'

export function AppLayout() {
  const { profile, logout } = useAuth()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const setDrawerOpen = useShellStore((s) => s.setDrawerOpen)
  const scrollRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useLenis(scrollRef, contentRef)

  // Each page starts at the top, as a full page load would.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  const initial = (profile?.full_name ?? profile?.email ?? '?').trim().charAt(0).toUpperCase()

  return (
    <div className="relative flex h-screen w-full overflow-hidden text-ocean-100">
      <OceanBackground calm />
      <NavSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Floating glass header. */}
        <header className="glass-panel animate-slide-down relative z-[1000] m-3 mb-0 flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <button type="button" onClick={() => setDrawerOpen(true)} aria-label={t('header.openMenu')} className="btn-glass p-2 lg:hidden">
            <MenuIcon size={18} />
          </button>
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#16d9d0,#07516a)] text-sm font-semibold text-abyss">
              {initial}
            </span>
            <span className="hidden min-w-0 text-sm sm:block">
              {profile ? (
                <>
                  <span translate="no" className="block truncate text-foam">{profile.full_name ?? profile.email}</span>
                  <span className="block text-[11px] tracking-wide text-mist">{tDynamic(`roles.${profile.role}`, profile.role)}</span>
                </>
              ) : (
                <span className="text-mist">{t('header.notSignedIn')}</span>
              )}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden md:block"><LanguageSwitcher /></div>
            <div className="hidden md:block"><ViewModeSwitcher /></div>
            <Link to="/settings" aria-label={t('header.settings')} className="btn-glass flex items-center gap-2 px-2.5 py-2 text-sm">
              <SettingsIcon size={16} />
              <span className="hidden xl:inline">{t('header.settings')}</span>
            </Link>
            <button type="button" onClick={() => void logout()} className="btn-glass flex items-center gap-2 px-2.5 py-2 text-sm">
              <LogoutIcon size={16} />
              <span className="hidden sm:inline">{t('header.logOut')}</span>
            </button>
          </div>
        </header>
        <main ref={scrollRef} className="oasis-scroll relative min-w-0 flex-1 overflow-y-auto">
          <div ref={contentRef} className="p-3 pt-5 sm:p-6">
            {/* Re-keyed per route: the new page rises in under a light wave sweep. */}
            <div key={pathname} className="relative">
              <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-2 z-10 h-1 overflow-hidden rounded-full">
                <div className="wave-sweep h-full w-1/2 bg-[linear-gradient(90deg,transparent,#16d9d0,transparent)]" />
              </div>
              <div className="page-enter">
                <Outlet />
              </div>
            </div>
          </div>
        </main>
        <RefreshPrompt />
      </div>
    </div>
  )
}
