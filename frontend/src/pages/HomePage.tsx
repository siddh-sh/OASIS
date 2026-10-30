import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { OasisCursor } from '@/components/OasisCursor'
import { useLenis } from '@/hooks/useLenis'
import { BenefitsSection, FinalCta, HomeFooter } from '@/components/home/ClosingSections'
import { DashboardPreview } from '@/components/home/DashboardPreview'
import { DomainsSection } from '@/components/home/DomainsSection'
import { FisheriesSpotlight } from '@/components/home/FisheriesSpotlight'
import { HeroSection } from '@/components/home/HeroSection'
import { HomeNav } from '@/components/home/HomeNav'
import { MissionSection } from '@/components/home/MissionSection'
import '@/components/home/home.css'

/**
 * Public landing page at `/`. Discovery only — every data figure on it comes
 * from the same public endpoints and hooks the dashboard uses, and every CTA
 * leads into the existing login flow or the authenticated app.
 */
export function HomePage() {
  const { t } = useTranslation()
  // A matching overscroll colour, for this page only; restored when the
  // visitor moves on into the app.
  // A refresh always starts at the hero: no restored scroll position, and no
  // leftover #section anchor from the nav links jumping the page down.
  useEffect(() => {
    const prevRestoration = history.scrollRestoration
    history.scrollRestoration = 'manual'
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    window.scrollTo(0, 0)
    return () => {
      history.scrollRestoration = prevRestoration
    }
  }, [])

  useEffect(() => {
    const html = document.documentElement
    const prev = html.style.backgroundColor
    html.style.backgroundColor = '#031B2A'
    return () => {
      html.style.backgroundColor = prev
    }
  }, [])

  // Lenis smooths the page and its #section links; touch devices and
  // reduced-motion visitors keep native scrolling (see useLenis).
  useLenis(undefined, undefined, { anchors: true })

  return (
    <div className="oasis-home min-h-screen">
      <OasisCursor />
      <a href="#mission" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-[#36E0D0] focus:px-4 focus:py-2 focus:text-[#031B2A]">
        {t('home.nav.skip')}
      </a>
      <HomeNav />
      <main>
        <HeroSection />
        <MissionSection />
        <DomainsSection />
        <FisheriesSpotlight />
        <DashboardPreview />
        <BenefitsSection />
        <FinalCta />
      </main>
      <HomeFooter />
    </div>
  )
}
