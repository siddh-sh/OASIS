import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useReveal } from './hooks'
import { ArrowRight, Fish, Network, Radar, Waves } from './icons'
import { OasisEmblem } from './HomeNav'

const BENEFITS = [
  { icon: Network, key: 'b1' },
  { icon: Waves, key: 'b2' },
  { icon: Fish, key: 'b3' },
  { icon: Radar, key: 'b4' },
] as const

export function BenefitsSection() {
  const { t } = useTranslation()
  const ref = useReveal()
  return (
    <section id="benefits" className="relative scroll-mt-20 py-24 sm:py-28">
      <div ref={ref} className="reveal mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-display max-w-2xl text-4xl leading-tight font-medium sm:text-5xl">
          {t('home.benefits.title')}
        </h2>
        <div className="mt-6 h-px bg-[linear-gradient(90deg,var(--turquoise),rgba(19,199,222,0.2)_40%,transparent)]" />
        <ul className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {BENEFITS.map(({ icon: Icon, key }) => (
            <li key={key}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--glass-line)] bg-[rgba(19,199,222,0.08)] text-[var(--turquoise)]">
                <Icon />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{t(`home.benefits.${key}`)}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted)]">{t(`home.benefits.${key}Text`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function FinalCta() {
  const { t } = useTranslation()
  const ref = useReveal()
  const { isAuthenticated } = useAuth()
  return (
    <section className="relative isolate overflow-hidden py-28 sm:py-36">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_100%,rgba(54,224,208,0.18),transparent_70%),linear-gradient(180deg,#031B2A_0%,#052638_50%,#063D50_100%)]" aria-hidden />
      <div className="absolute inset-0 -z-10 hidden md:block" aria-hidden>
        <span className="ray" style={{ left: '30%', ['--r' as string]: '-14deg' }} />
        <span className="ray" style={{ left: '52%', ['--r' as string]: '6deg', animationDelay: '-4s' }} />
        <span className="ray" style={{ left: '70%', ['--r' as string]: '18deg', animationDelay: '-7s' }} />
      </div>
      <div ref={ref} className="reveal mx-auto flex max-w-3xl flex-col items-center px-4 text-center sm:px-6">
        <OasisEmblem size={52} />
        <h2 className="font-display mt-8 text-4xl leading-[1.08] font-medium sm:text-6xl">
          {t('home.cta.title')} <span className="text-gradient italic">{t('home.cta.accent')}</span>
        </h2>
        <p className="mt-6 max-w-xl text-base text-[var(--muted)] sm:text-lg">
          {t('home.cta.body')}
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to={isAuthenticated ? '/dashboard' : '/login?mode=signup'} data-cursor="primary"
            className="btn-primary inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px]">
            {t('home.cta.start')} <ArrowRight size={18} />
          </Link>
          <a href="#explore" className="btn-ghost inline-flex items-center rounded-full px-7 py-3.5 text-[15px]">
            {t('home.cta.explore')}
          </a>
        </div>
      </div>
      <svg className="absolute inset-x-0 bottom-0 -z-10 h-24 w-full" viewBox="0 0 1440 96" preserveAspectRatio="none" aria-hidden>
        <path d="M0 48 C240 18 480 78 720 48 S1200 18 1440 48 V96 H0 Z" fill="#031B2A" opacity="0.6" />
        <path d="M0 66 C240 40 480 90 720 66 S1200 40 1440 66 V96 H0 Z" fill="#031B2A" />
      </svg>
    </section>
  )
}

export function HomeFooter() {
  const { t } = useTranslation()
  const links = [
    { href: '#top', label: t('home.nav.home') },
    { href: '#explore', label: t('home.footer.explore') },
    { href: '#fisheries', label: t('home.nav.fisheries') },
    { href: '#mission', label: t('home.nav.about') },
  ]
  return (
    <footer className="border-t border-[var(--glass-line)] bg-[#031B2A]">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-14 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <OasisEmblem />
            <span className="text-lg font-semibold tracking-[0.18em]">OASIS</span>
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">{t('home.footer.tagline')}</p>
        </div>
        <nav aria-label={t('home.nav.footer')} className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[var(--muted)] hover:text-[var(--white)]">{l.label}</a>
          ))}
          <Link to="/login" className="text-[var(--muted)] hover:text-[var(--white)]">{t('home.nav.logIn')}</Link>
          <Link to="/login?mode=signup" className="text-[var(--turquoise)] hover:text-[var(--white)]">{t('home.nav.signUp')}</Link>
        </nav>
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-white/5 px-4 py-6 text-[13px] text-[var(--muted)] sm:flex-row sm:justify-between sm:px-6 lg:px-8">
        <p>{t('home.footer.built')}</p>
        <p>© {new Date().getFullYear()} OASIS</p>
      </div>
    </footer>
  )
}
