import { useTranslation } from 'react-i18next'
import oceanData from '@/assets/home/ocean-data.webp'
import { useReveal } from './hooks'
import { ArrowRight } from './icons'

const NODES = [
  { x: 60, y: 46, key: 'ocean', color: '#13C7DE' },
  { x: 250, y: 46, key: 'eco', color: '#36E0D0' },
  { x: 155, y: 140, key: 'human', color: '#FF6384' },
] as const

function ConnectionDiagram() {
  const { t } = useTranslation()
  const [a, b, c] = NODES
  return (
    <svg viewBox="0 0 310 196" className="w-full" role="img"
      aria-label={t('home.mission.diagram')}>
      {[[a, b], [b, c], [c, a]].map(([p, q], i) => (
        <g key={i}>
          <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="rgba(167,243,229,0.18)" strokeWidth="1" />
          <line className="flow-line" x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={p.color} strokeWidth="1.4" style={{ animationDelay: `${-i}s` }} />
        </g>
      ))}
      {NODES.map((n) => (
        <g key={n.key}>
          <circle cx={n.x} cy={n.y} r="16" fill="#052638" stroke={n.color} strokeWidth="1.4" />
          <circle cx={n.x} cy={n.y} r="4" fill={n.color} />
          <text x={n.x} y={n.y + 32} textAnchor="middle" fill="#F4FAFC" fontSize="11.5" fontWeight="600">{t(`home.mission.${n.key}`)}</text>
          <text x={n.x} y={n.y + 46} textAnchor="middle" fill="#9CB6C4" fontSize="9.5">{t(`home.mission.${n.key}Sub`)}</text>
        </g>
      ))}
    </svg>
  )
}

export function MissionSection() {
  const { t } = useTranslation()
  const left = useReveal()
  const right = useReveal()
  return (
    <section id="mission" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
        <div ref={left} className="reveal">
          <p className="eyebrow">{t('home.mission.eyebrow')}</p>
          <h2 className="font-display mt-4 text-4xl leading-[1.08] font-medium sm:text-5xl lg:text-6xl">
            {t('home.mission.line1')}
            <br />
            <span className="text-gradient">{t('home.mission.accent')}</span>
          </h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            {t('home.mission.body')}
          </p>
          <a href="#benefits" className="group mt-8 inline-flex items-center gap-2 font-medium text-[var(--turquoise)]">
            {t('home.mission.learn')}
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </a>
        </div>

        <div ref={right} className="reveal relative [transition-delay:120ms]">
          <div className="relative overflow-hidden rounded-[28px] border border-[var(--glass-line)]">
            <img src={oceanData} alt={t('home.mission.imageAlt')}
              width={1502} height={850} loading="lazy" decoding="async"
              className="aspect-[4/3] w-full object-cover sm:aspect-[16/11]" />
            <div className="absolute inset-0 bg-[linear-gradient(200deg,rgba(3,27,42,0)_30%,rgba(3,27,42,0.75)_100%)]" />
          </div>
          <div className="glass absolute -bottom-10 left-4 w-[min(88%,340px)] rounded-2xl p-4 sm:-left-8">
            <p className="mb-1 text-[11px] tracking-wider text-[var(--muted)] uppercase">{t('home.mission.connect')}</p>
            <ConnectionDiagram />
          </div>
          <span className="glass absolute top-5 right-5 rounded-full px-3 py-1.5 text-[11px] text-[var(--seafoam)]">
            {t('home.mission.badge')}
          </span>
        </div>
      </div>
    </section>
  )
}
