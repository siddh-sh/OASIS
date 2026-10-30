import clsx from 'clsx'

// Fixed, not random: the same layout on every render, so nothing shifts and
// React has nothing to reconcile. Bubbles are hollow rings (second reference
// video); particles are tiny solid motes.
const BUBBLES = [
  { l: 8, s: 14, d: 26, delay: -4, dx: 14 },
  { l: 21, s: 8, d: 32, delay: -18, dx: -10 },
  { l: 37, s: 18, d: 38, delay: -9, dx: 20 },
  { l: 55, s: 10, d: 29, delay: -22, dx: -14 },
  { l: 68, s: 22, d: 42, delay: -2, dx: 12 },
  { l: 82, s: 9, d: 27, delay: -14, dx: -8 },
  { l: 93, s: 15, d: 35, delay: -27, dx: 10 },
]
const MOTES = [
  { l: 4, d: 21, delay: -3 }, { l: 15, d: 25, delay: -11 }, { l: 29, d: 19, delay: -7 },
  { l: 46, d: 23, delay: -15 }, { l: 61, d: 20, delay: -5 }, { l: 74, d: 26, delay: -19 },
  { l: 88, d: 22, delay: -9 }, { l: 97, d: 24, delay: -13 },
]
const RAYS = [
  { left: '58%', r: '18deg', delay: '0s' },
  { left: '70%', r: '24deg', delay: '-4s' },
  { left: '82%', r: '30deg', delay: '-8s' },
]

interface OceanBackgroundProps {
  /** Optional photograph behind the gradients (the login page uses the reef). */
  image?: string
  /** Fewer, fainter effects — for data-dense screens. */
  calm?: boolean
  className?: string
}

/**
 * The underwater layer behind the app: deep gradient, ambient turquoise
 * light, slow light rays, drifting bubbles. Purely decorative, never
 * interactive, and frozen under prefers-reduced-motion (index.css).
 */
export function OceanBackground({ image, calm = false, className }: OceanBackgroundProps) {
  return (
    <div aria-hidden className={clsx('pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}>
      {image ? (
        <>
          <img src={image} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover object-[60%_40%]" />
          <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(3,29,42,0.94)_0%,rgba(3,29,42,0.78)_45%,rgba(3,29,42,0.55)_100%)]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#041f2e_0%,#031d2a_55%,#02141e_100%)]" />
      )}
      <div className="absolute -top-48 right-[-12%] h-[620px] w-[760px] rounded-full bg-[radial-gradient(closest-side,rgba(22,217,208,0.16),transparent)]" />
      <div className="absolute bottom-[-30%] left-[-10%] h-[560px] w-[680px] rounded-full bg-[radial-gradient(closest-side,rgba(7,81,106,0.45),transparent)]" />

      <div className={clsx('hidden md:block', calm && 'opacity-50')}>
        {RAYS.map((r) => (
          <span
            key={r.left}
            className="absolute -top-[20%] h-[140%] w-[110px] origin-top bg-[linear-gradient(180deg,rgba(167,243,229,0.10),rgba(167,243,229,0)_75%)] blur-md"
            style={{ left: r.left, ['--r' as string]: r.r, animation: `oasis-ray 9s ease-in-out ${r.delay} infinite alternate` }}
          />
        ))}
      </div>

      {BUBBLES.slice(0, calm ? 4 : BUBBLES.length).map((b, i) => (
        <span
          key={`b${i}`}
          className={clsx('absolute bottom-[-40px] rounded-full border border-[rgba(167,243,229,0.22)] bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.18),rgba(255,255,255,0)_60%)]', i > 3 && 'hidden md:block')}
          style={{
            left: `${b.l}%`, width: b.s, height: b.s,
            ['--dx' as string]: `${b.dx}px`, ['--o' as string]: 0.55,
            animation: `oasis-drift-up ${b.d}s linear ${b.delay}s infinite`,
          }}
        />
      ))}
      {!calm && MOTES.map((m, i) => (
        <span
          key={`m${i}`}
          className={clsx('absolute bottom-[-10px] h-[3px] w-[3px] rounded-full bg-[#a7f3e5]', i > 4 && 'hidden md:block')}
          style={{ left: `${m.l}%`, ['--o' as string]: 0.45, animation: `oasis-drift-up ${m.d}s linear ${m.delay}s infinite` }}
        />
      ))}
    </div>
  )
}
