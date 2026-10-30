import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import vessel from '@/assets/home/research-vessel.webp'
import { useFormat } from '@/i18n/format'
import { useNearViewport, usePlatformStats, useReveal } from './hooks'
import { ArrowRight, ChartUp, Fish, Leaf } from './icons'

const POINTS = [
  { icon: Fish, key: 'p1' },
  { icon: ChartUp, key: 'p2' },
  { icon: Leaf, key: 'p3' },
] as const

const tonnes = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}k`)

function CatchChart({ data }: { data: { year: number; catch_metric_tons: number }[] }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="home-catch" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6384" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#FF6384" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="year" tick={{ fill: '#9CB6C4', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={36} />
        <YAxis tick={{ fill: '#9CB6C4', fontSize: 11 }} tickLine={false} axisLine={false} width={42} tickFormatter={tonnes} />
        <Tooltip
          cursor={{ stroke: 'rgba(255,99,132,0.4)' }}
          contentStyle={{ background: 'rgba(3,27,42,0.95)', border: '1px solid rgba(167,243,229,0.16)', borderRadius: 12, color: '#F4FAFC', fontSize: 12 }}
          labelStyle={{ color: '#9CB6C4' }}
          formatter={(v) => [`${fmt.int(Number(v))} t`, t('home.fisheries.tooltip')]}
        />
        <Area type="monotone" dataKey="catch_metric_tons" stroke="#FF6384" strokeWidth={2} fill="url(#home-catch)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function FisheriesSpotlight() {
  const { t } = useTranslation()
  const stats = usePlatformStats()
  const copy = useReveal()
  const { ref: chartRef, near } = useNearViewport('200px')
  const series = stats.catchSeries
  const first = series[0]
  const last = series.at(-1)

  return (
    <section id="fisheries" className="relative scroll-mt-20 overflow-hidden bg-[linear-gradient(180deg,#031B2A_0%,#052638_45%,#031B2A_100%)]">
      <div className="grid lg:min-h-[760px] lg:grid-cols-2">
        <div className="relative min-h-[420px] overflow-hidden lg:min-h-0">
          <img src={vessel} alt={t('home.fisheries.vesselAlt')}
            width={1310} height={849} loading="lazy" decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-[40%_center]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,27,42,0.15)_0%,rgba(3,27,42,0.35)_60%,#052638_100%)] max-lg:bg-[linear-gradient(180deg,rgba(3,27,42,0.1)_40%,#052638_100%)]" />
          {last && (
            <div className="glass float-a absolute top-[12%] left-[8%] rounded-2xl px-4 py-3">
              <p className="text-[10.5px] tracking-wider text-[var(--muted)] uppercase">{t('home.fisheries.landings', { year: last.year })}</p>
              <p className="mt-0.5 text-2xl font-semibold text-[var(--coral)]">{tonnes(last.catch_metric_tons)} t</p>
            </div>
          )}
          {first && last && (
            <div className="glass float-b absolute bottom-[14%] left-[16%] rounded-2xl px-4 py-3">
              <p className="text-[10.5px] tracking-wider text-[var(--muted)] uppercase">{t('home.fisheries.recordLength')}</p>
              <p className="mt-0.5 text-xl font-semibold">{t('home.fisheries.years', { n: last.year - first.year + 1 })}</p>
              <p className="text-[11px] text-[var(--muted)]">{first.year}–{last.year}</p>
            </div>
          )}
        </div>

        <div ref={copy} className="reveal flex flex-col justify-center px-4 py-20 sm:px-10 lg:px-16 xl:px-20">
          <p className="eyebrow !text-[var(--coral)]">{t('home.fisheries.eyebrow')}</p>
          <h2 className="font-display mt-4 text-4xl leading-[1.08] font-medium sm:text-5xl">
            {t('home.fisheries.line1')}
            <br />
            {t('home.fisheries.line2')}
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            {t('home.fisheries.body')}
          </p>

          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {POINTS.map(({ icon: Icon, key }) => (
              <li key={key} className="border-t border-[var(--glass-line)] pt-4">
                <Icon className="text-[var(--coral)]" />
                <p className="mt-2 text-sm font-semibold">{t(`home.fisheries.${key}`)}</p>
                <p className="mt-1 text-[13px] leading-snug text-[var(--muted)]">{t(`home.fisheries.${key}Text`)}</p>
              </li>
            ))}
          </ul>

          <div ref={chartRef} className="mt-9 rounded-2xl border border-[var(--glass-line)] bg-[rgba(3,27,42,0.45)] p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{t('home.fisheries.chartTitle')}</p>
              <p className="text-[11px] text-[var(--muted)]">
                <Trans i18nKey="home.fisheries.chartSource" components={{ name: <span translate="no" /> }} />
              </p>
            </div>
            <div className="h-44">
              {near && series.length > 0 ? (
                <CatchChart data={series} />
              ) : stats.failed ? (
                <p className="flex h-full items-center justify-center text-sm text-[var(--muted)]">{t('home.fisheries.unavailable')}</p>
              ) : (
                <div className="h-full animate-pulse rounded-xl bg-white/5" />
              )}
            </div>
          </div>

          <Link to="/fisheries" className="btn-coral mt-8 inline-flex w-fit items-center gap-2 rounded-full px-6 py-3.5 text-[15px]">
            {t('home.fisheries.cta')} <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}
