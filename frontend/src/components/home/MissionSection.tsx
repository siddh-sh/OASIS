import oceanData from '@/assets/home/ocean-data.webp'
import { useReveal } from './hooks'
import { ArrowRight } from './icons'

const NODES = [
  { x: 60, y: 46, label: 'Ocean', sub: 'SST · chlorophyll · weather', color: '#13C7DE' },
  { x: 250, y: 46, label: 'Ecosystems', sub: 'species · eDNA', color: '#36E0D0' },
  { x: 155, y: 140, label: 'Human activity', sub: 'fisheries · catch', color: '#FF6384' },
]

function ConnectionDiagram() {
  const [a, b, c] = NODES
  return (
    <svg viewBox="0 0 310 196" className="w-full" role="img"
      aria-label="Diagram: ocean conditions, marine ecosystems and human activity are linked to one another">
      {[[a, b], [b, c], [c, a]].map(([p, q], i) => (
        <g key={i}>
          <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="rgba(167,243,229,0.18)" strokeWidth="1" />
          <line className="flow-line" x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={p.color} strokeWidth="1.4" style={{ animationDelay: `${-i}s` }} />
        </g>
      ))}
      {NODES.map((n) => (
        <g key={n.label}>
          <circle cx={n.x} cy={n.y} r="16" fill="#052638" stroke={n.color} strokeWidth="1.4" />
          <circle cx={n.x} cy={n.y} r="4" fill={n.color} />
          <text x={n.x} y={n.y + 32} textAnchor="middle" fill="#F4FAFC" fontSize="11.5" fontWeight="600">{n.label}</text>
          <text x={n.x} y={n.y + 46} textAnchor="middle" fill="#9CB6C4" fontSize="9.5">{n.sub}</text>
        </g>
      ))}
    </svg>
  )
}

export function MissionSection() {
  const left = useReveal()
  const right = useReveal()
  return (
    <section id="mission" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
        <div ref={left} className="reveal">
          <p className="eyebrow">The OASIS mission</p>
          <h2 className="font-display mt-4 text-4xl leading-[1.08] font-medium sm:text-5xl lg:text-6xl">
            One Ocean.
            <br />
            <span className="text-gradient">Connected Intelligence.</span>
          </h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            The ocean is a complex, interconnected system. OASIS brings marine observations, fisheries information,
            biodiversity records, and environmental signals together to help researchers and decision-makers see the
            bigger picture.
          </p>
          <a href="#benefits" className="group mt-8 inline-flex items-center gap-2 font-medium text-[var(--turquoise)]">
            Learn About OASIS
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </a>
        </div>

        <div ref={right} className="reveal relative [transition-delay:120ms]">
          <div className="relative overflow-hidden rounded-[28px] border border-[var(--glass-line)]">
            <img src={oceanData} alt="Underwater scene with floating data panels showing charts above a coral reef"
              width={1502} height={850} loading="lazy" decoding="async"
              className="aspect-[4/3] w-full object-cover sm:aspect-[16/11]" />
            <div className="absolute inset-0 bg-[linear-gradient(200deg,rgba(3,27,42,0)_30%,rgba(3,27,42,0.75)_100%)]" />
          </div>
          <div className="glass absolute -bottom-10 left-4 w-[min(88%,340px)] rounded-2xl p-4 sm:-left-8">
            <p className="mb-1 text-[11px] tracking-wider text-[var(--muted)] uppercase">How the signals connect</p>
            <ConnectionDiagram />
          </div>
          <span className="glass absolute top-5 right-5 rounded-full px-3 py-1.5 text-[11px] text-[var(--seafoam)]">
            6 data domains · 1 platform
          </span>
        </div>
      </div>
    </section>
  )
}
