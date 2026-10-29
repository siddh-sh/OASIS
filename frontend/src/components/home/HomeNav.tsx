import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Close, Menu } from './icons'

const SECTION_LINKS = [
  { href: '#top', label: 'Home' },
  { href: '#explore', label: 'Explore Oceans' },
  { href: '#fisheries', label: 'Fisheries' },
  { href: '#biodiversity', label: 'Biodiversity' },
  { href: '#mission', label: 'About' },
]

export function OasisEmblem({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="emblem-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#36E0D0" />
          <stop offset="100%" stopColor="#13C7DE" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="15" fill="#052638" stroke="url(#emblem-grad)" strokeWidth="1.4" />
      <g className="emblem-ring">
        <circle cx="20" cy="20" r="18.5" fill="none" stroke="#36E0D0" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="1.5 4" />
      </g>
      <path d="M10 20.5c2.2 0 2.2-1.8 4.4-1.8s2.2 1.8 4.4 1.8 2.2-1.8 4.4-1.8 2.2 1.8 4.4 1.8" fill="none" stroke="#36E0D0" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 25c1.8 0 1.8-1.5 3.6-1.5s1.8 1.5 3.6 1.5 1.8-1.5 3.6-1.5 1.8 1.5 3.6 1.5" fill="none" stroke="#A7F3E5" strokeOpacity="0.7" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="20" cy="13.5" r="2.2" fill="#FF6384" />
    </svg>
  )
}

// Always Log in / Sign up, even for a signed-in visitor: LoginPage already
// forwards an authenticated session straight to /dashboard.
export function AuthActions({ compact = false }: { compact?: boolean }) {
  const size = compact ? 'px-3.5 py-1.5 text-[13px]' : 'px-4 py-2 text-sm'
  return (
    <div className="flex items-center gap-2">
      <Link to="/login" className={clsx('btn-ghost rounded-full', size)}>Log in</Link>
      <Link to="/login?mode=signup" data-cursor="primary" className={clsx('btn-primary rounded-full', size)}>Sign up</Link>
    </div>
  )
}

export function HomeNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className={clsx('nav-shell fixed inset-x-0 top-0 z-50', (scrolled || open) && 'is-scrolled')}>
      <nav className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8" aria-label="Primary">
        <a href="#top" className="flex items-center gap-2.5" aria-label="OASIS home">
          <OasisEmblem />
          <span className="leading-tight">
            <span className="block text-lg font-semibold tracking-[0.18em]">OASIS</span>
            <span className="hidden text-[10.5px] tracking-wide text-[var(--muted)] sm:block">Ocean Intelligence Platform</span>
          </span>
        </a>

        <ul className="mx-auto hidden items-center gap-1 lg:flex">
          {SECTION_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded-full px-3.5 py-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--white)]">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <div className="hidden sm:block"><AuthActions /></div>
          <div className="sm:hidden"><AuthActions compact /></div>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="home-mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--white)] hover:bg-white/5 lg:hidden">
            {open ? <Close /> : <Menu />}
          </button>
        </div>
      </nav>

      {open && (
        <ul id="home-mobile-menu" className="mx-auto flex max-w-7xl flex-col gap-1 px-4 pb-4 lg:hidden">
          {SECTION_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-3 text-base text-[var(--white)] hover:bg-white/5">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </header>
  )
}
