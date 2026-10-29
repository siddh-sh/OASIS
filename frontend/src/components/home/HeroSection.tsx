import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import reef from '@/assets/home/reef.webp'
import { ArrowRight, ChevronDown } from './icons'

// Fixed, not random: deterministic layout means no layout shift between
// renders and nothing for React to reconcile.
const PARTICLES = [
  { l: 6, s: 3, d: 19, delay: 0, dx: 18 }, { l: 14, s: 2, d: 24, delay: -6, dx: -10 },
  { l: 22, s: 4, d: 28, delay: -12, dx: 24 }, { l: 31, s: 2, d: 21, delay: -3, dx: 12 },
  { l: 43, s: 3, d: 26, delay: -15, dx: -16 }, { l: 52, s: 2, d: 18, delay: -9, dx: 20 },
  { l: 61, s: 3, d: 30, delay: -20, dx: -8 }, { l: 70, s: 2, d: 23, delay: -5, dx: 14 },
  { l: 78, s: 4, d: 27, delay: -17, dx: -20 }, { l: 86, s: 2, d: 20, delay: -11, dx: 10 },
  { l: 93, s: 3, d: 25, delay: -2, dx: -12 }, { l: 37, s: 2, d: 32, delay: -24, dx: 16 },
]

const RAYS = [
  { left: '48%', r: '16deg', delay: '0s' },
  { left: '60%', r: '22deg', delay: '-3s' },
  { left: '70%', r: '28deg', delay: '-6s' },
  { left: '80%', r: '34deg', delay: '-1.5s' },
]

export function HeroSection() {
  const imageRef = useRef<HTMLImageElement>(null)
  const heroRef = useRef<HTMLElement>(null)

  // Gentle parallax: the photo drifts at 25% of scroll speed, only while the
  // hero is on screen, via a single rAF-throttled transform.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const img = imageRef.current
    const hero = heroRef.current
    if (!img || !hero) return
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        if (y < hero.offsetHeight) img.style.transform = `translate3d(0, ${y * 0.25}px, 0) scale(1.08)`
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section id="top" ref={heroRef} className="relative isolate flex min-h-[92vh] items-center overflow-hidden pt-24 pb-20 md:min-h-screen">
      {/* Layer 1 — background */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        <img ref={imageRef} src={reef} alt="" width={852} height={853} fetchPriority="high"
          className="hero-image h-full w-full scale-[1.08] object-cover object-[60%_35%]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,27,42,0.96)_0%,rgba(3,27,42,0.82)_38%,rgba(3,27,42,0.35)_70%,rgba(3,27,42,0.55)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,27,42,0.55)_0%,rgba(3,27,42,0)_30%,rgba(3,27,42,0)_65%,#031B2A_100%)]" />
        <div className="absolute -top-40 right-[-10%] h-[520px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(19,199,222,0.22),transparent)]" />
        <div className="hidden md:block">
          {RAYS.map((r) => (
            <span key={r.left} className="ray" style={{ left: r.left, ['--r' as string]: r.r, animationDelay: r.delay }} />
          ))}
        </div>
        {PARTICLES.map((p, i) => (
          <span key={i} className={`particle ${i > 6 ? 'hidden md:block' : ''}`}
            style={{ left: `${p.l}%`, width: p.s, height: p.s, animationDuration: `${p.d}s`, animationDelay: `${p.delay}s`, ['--dx' as string]: `${p.dx}px` }} />
        ))}
        <svg className="fish-silhouette absolute top-[30%] left-0 hidden w-24 opacity-[0.18] md:block" viewBox="0 0 120 50">
          {/* Drawn head-left; mirrored so it faces the way it swims (left → right). */}
          <path transform="matrix(-1 0 0 1 120 0)" d="M5 25 C25 5 70 2 95 20 L115 8 L110 25 L115 42 L95 30 C70 48 25 45 5 25 Z" fill="#A7F3E5" />
        </svg>
      </div>

      {/* Layer 2 — content */}
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <p className="eyebrow sm:!text-sm">Discover • Understand • Protect</p>
          <h1 className="font-display mt-6 text-[clamp(3rem,min(7.4vw,11vh),6.75rem)] leading-[1.02] font-medium">
            Explore the Ocean.
            <br />
            Understand <span className="text-gradient whitespace-nowrap italic">Our Future.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-[var(--muted)] sm:text-xl lg:text-2xl lg:leading-relaxed">
            From shifting ocean temperatures to marine biodiversity and sustainable fisheries, OASIS transforms
            complex marine data into meaningful insights for a healthier blue planet.
          </p>
          <div className="mt-11 flex flex-wrap items-center gap-4">
            <Link to="/dashboard" data-cursor="primary"
              className="btn-primary inline-flex items-center gap-2.5 rounded-full px-8 py-4 text-base sm:text-lg">
              Explore the Platform <ArrowRight size={20} />
            </Link>
            <a href="#mission" className="btn-ghost inline-flex items-center rounded-full px-8 py-4 text-base sm:text-lg">
              Discover Our Mission
            </a>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <a href="#mission" className="scroll-cue flex flex-col items-center gap-1 text-xs tracking-[0.3em] text-[var(--muted)]">
          SCROLL TO EXPLORE
          <ChevronDown size={16} />
        </a>
      </div>
    </section>
  )
}
