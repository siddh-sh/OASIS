import clsx from 'clsx'
import { memo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import oceanPanels from '@/assets/home/ocean-data-panels.webp'
import openWater from '@/assets/home/open-water.webp'
import reefLife from '@/assets/home/reef-life.webp'
import reefSurface from '@/assets/home/reef-surface.webp'
import vessel from '@/assets/home/research-vessel.webp'
import { formatCount, useNearViewport, usePlatformStats, useReveal, useSatelliteSst } from './hooks'
import { ArrowRight } from './icons'

// Same 24 → 32 °C ramp for every SST rendering on the page.
function sstColor(t: number): string {
  const f = Math.max(0, Math.min(1, (t - 26) / 6))
  if (f < 0.5) {
    const g = f / 0.5
    return `rgb(${Math.round(19 + 35 * g)},${Math.round(150 + 74 * g)},${Math.round(222 - 14 * g)})`
  }
  const g = (f - 0.5) / 0.5
  return `rgb(${Math.round(54 + 201 * g)},${Math.round(224 - 125 * g)},${Math.round(208 - 76 * g)})`
}

/** The real latest satellite SST field, as a dot grid. Static SVG — no map library. */
const SstField = memo(function SstField({ cells }: { cells: { lat: number; lon: number; sst: number }[] }) {
  // Satellite grid extent: ~6–23°N, 68–90°E.
  const x = (lon: number) => ((lon - 67) / 24) * 240
  const y = (lat: number) => ((24 - lat) / 19) * 190
  return (
    <svg viewBox="0 0 240 190" className="h-full w-full" aria-hidden>
      {cells.map((c, i) => (
        <circle key={i} cx={x(c.lon)} cy={y(c.lat)} r="2.5" fill={sstColor(c.sst)} />
      ))}
    </svg>
  )
})

function DnaHelix() {
  const bases = ['#36E0D0', '#13C7DE', '#FF6384', '#A7F3E5']
  const rungs = Array.from({ length: 22 }, (_, i) => i)
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="dna-bg" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#063D50" />
          <stop offset="100%" stopColor="#031B2A" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#dna-bg)" />
      <g transform="rotate(-18 200 120)">
        {/* The two backbones, then the base-pair rungs between them. */}
        {[1, -1].map((sign) => (
          <path key={sign} fill="none" stroke={sign > 0 ? '#A7F3E5' : '#13C7DE'} strokeWidth="2" opacity="0.7"
            d={rungs.map((i) => {
              const t = (i / rungs.length) * Math.PI * 4
              return `${i === 0 ? 'M' : 'L'}${20 + i * 17},${120 + sign * Math.sin(t) * 46}`
            }).join(' ')} />
        ))}
        {rungs.map((i) => {
          const px = 20 + i * 17
          const t = (i / rungs.length) * Math.PI * 4
          const y1 = 120 + Math.sin(t) * 46
          const y2 = 120 - Math.sin(t) * 46
          const depth = (Math.cos(t) + 1) / 2
          return (
            <g key={i} opacity={0.35 + depth * 0.65}>
              <line x1={px} y1={y1} x2={px} y2={y2} stroke={bases[i % 4]} strokeWidth="2.4" strokeLinecap="round" />
              <circle cx={px} cy={y1} r={2.5 + depth * 2} fill="#A7F3E5" />
              <circle cx={px} cy={y2} r={2.5 + (1 - depth) * 2} fill="#13C7DE" />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

interface Domain {
  id?: string
  label: string
  title: string
  description: string
  more: string
  cta: string
  to: string
  media: ReactNode
  className: string
  tall?: boolean
}

function DomainCard({ d, index }: { d: Domain; index: number }) {
  const ref = useReveal<HTMLAnchorElement>()
  return (
    <Link
      ref={ref}
      id={d.id}
      to={d.to}
      className={clsx('domain-card reveal group relative isolate flex scroll-mt-24 flex-col justify-end overflow-hidden rounded-3xl', d.className)}
      style={{ transitionDelay: `${(index % 3) * 90}ms` }}
    >
      <div className="card-media absolute inset-0 -z-10">{d.media}</div>
      <div className="tint absolute inset-0 -z-10" />
      <div className="p-5 sm:p-6">
        <span className="inline-block rounded-full border border-[var(--glass-line)] bg-[rgba(3,27,42,0.55)] px-2.5 py-1 text-[10.5px] tracking-[0.16em] text-[var(--seafoam)] uppercase">
          {d.label}
        </span>
        <h3 className={clsx('font-display mt-3 font-medium', d.tall ? 'text-3xl sm:text-4xl' : 'text-2xl')}>{d.title}</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">{d.description}</p>
        <div className="card-more">
          <p className="overflow-hidden text-[12.5px] text-[var(--seafoam)]"><span className="block pt-2">{d.more}</span></p>
        </div>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--turquoise)]">
          {d.cta}
          <ArrowRight size={16} className="card-arrow" />
        </span>
      </div>
    </Link>
  )
}

const img = (src: string, alt: string, position = 'center') => (
  <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" style={{ objectPosition: position }} />
)

export function DomainsSection() {
  const heading = useReveal()
  const { ref: gridRef, near } = useNearViewport()
  const sst = useSatelliteSst(near)
  const stats = usePlatformStats()

  const domains: Domain[] = [
    {
      label: 'Ocean & Satellite',
      title: 'Ocean & Satellite',
      description: 'Observe ocean conditions through satellite imagery, sea-surface temperatures, and marine station data.',
      more: sst.data
        ? `Shown: the latest sea-surface temperature across ${sst.data.length.toLocaleString()} satellite grid cells.`
        : `${formatCount(stats.stationCount)} stations, buoys and satellite grid cells.`,
      cta: 'Explore Ocean Data',
      to: '/ocean',
      tall: true,
      className: 'min-h-[420px] sm:col-span-2 lg:col-span-7 lg:row-span-2 lg:min-h-[600px]',
      media: (
        <div className="relative h-full w-full">
          {img(openWater, 'Aerial view of deep blue open ocean with white wake', 'right top')}
          <div className="absolute inset-0 bg-[rgba(3,27,42,0.45)]" />
          <div className="absolute inset-x-[8%] top-[6%] bottom-[38%] opacity-90">
            {sst.data && <SstField cells={sst.data} />}
          </div>
        </div>
      ),
    },
    {
      label: 'Weather & Climate',
      title: 'Weather & Climate',
      description: 'Understand marine weather, changing sea conditions, and environmental patterns.',
      more: `${formatCount(stats.weatherCount)} daily observations from coastal stations.`,
      cta: 'Explore Weather',
      to: '/weather',
      className: 'min-h-[300px] lg:col-span-5',
      media: img(reefSurface, 'Sunlight streaming through the ocean surface seen from below', 'center 30%'),
    },
    {
      id: 'biodiversity',
      label: 'Marine Biodiversity',
      title: 'Marine Biodiversity',
      description: 'Explore species records and discover the rich biodiversity of marine ecosystems.',
      more: `${formatCount(stats.speciesCount)} species catalogued from occurrence records.`,
      cta: 'Discover Species',
      to: '/species',
      className: 'min-h-[300px] lg:col-span-5',
      media: img(reefLife, 'Clownfish, yellow snappers and a blue tang among colourful soft corals'),
    },
    {
      label: 'Fisheries Intelligence',
      title: 'Fisheries Intelligence',
      description: 'Investigate fisheries trends, annual catch patterns, and opportunities for sustainable resource management.',
      more: 'FAO reported landings alongside the Sea Around Us catch reconstruction.',
      cta: 'Explore Fisheries',
      to: '/fisheries',
      className: 'min-h-[340px] lg:col-span-4',
      media: img(vessel, 'Aerial view of a research vessel cutting through dark blue water', '40% center'),
    },
    {
      label: 'Molecular & eDNA',
      title: 'Molecular & eDNA',
      description: 'Explore molecular evidence and environmental DNA to understand marine life beyond what is visible.',
      more: `${formatCount(stats.molecularCount)} DNA barcode records from BOLD Systems.`,
      cta: 'Explore eDNA',
      to: '/molecular',
      className: 'min-h-[340px] lg:col-span-4',
      media: <DnaHelix />,
    },
    {
      label: 'Correlation & Risk',
      title: 'Correlation & Risk',
      description: 'Identify environmental relationships, emerging anomalies, and potential risks to marine ecosystems.',
      more: 'Anomalies are flagged against each station’s own seasonal baseline.',
      cta: 'Discover Insights',
      to: '/correlation',
      className: 'min-h-[340px] lg:col-span-4',
      media: img(oceanPanels, 'Translucent data charts floating in deep blue water'),
    },
  ]

  return (
    <section id="explore" className="relative scroll-mt-20 py-24 sm:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(19,199,222,0.1),transparent)]" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div ref={heading} className="reveal max-w-2xl">
          <p className="eyebrow">Data domains</p>
          <h2 className="font-display mt-4 text-4xl leading-tight font-medium sm:text-5xl">Every Signal Tells a Story.</h2>
          <p className="mt-4 text-base text-[var(--muted)] sm:text-lg">Explore the interconnected systems shaping our oceans.</p>
        </div>
        <div ref={gridRef} className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-12">
          {domains.map((d, i) => <DomainCard key={d.title} d={d} index={i} />)}
        </div>
      </div>
    </section>
  )
}
