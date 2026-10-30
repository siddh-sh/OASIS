import clsx from 'clsx'
import { createElement, useEffect, useState } from 'react'

/**
 * Optional Spline scene. Set VITE_SPLINE_SCENE_URL to a published scene
 * (the `.splinecode` URL from Spline's Export → Code panel) to replace the
 * CSS globe with it. The viewer script is fetched only then, only when this
 * component mounts, and only on devices with WebGL.
 */
const SCENE_URL = import.meta.env.VITE_SPLINE_SCENE_URL as string | undefined
const VIEWER_SRC = 'https://unpkg.com/@splinetool/viewer@1/build/spline-viewer.js'

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function useSplineViewer(enabled: boolean): boolean {
  const [ready, setReady] = useState(() => Boolean(customElements.get('spline-viewer')))
  useEffect(() => {
    if (!enabled || ready) return
    let script = document.querySelector<HTMLScriptElement>(`script[src="${VIEWER_SRC}"]`)
    if (!script) {
      script = document.createElement('script')
      script.type = 'module'
      script.src = VIEWER_SRC
      document.head.appendChild(script)
    }
    customElements.whenDefined('spline-viewer').then(() => setReady(true))
  }, [enabled, ready])
  return ready
}

/**
 * A slowly turning ocean globe: graticule lines over a lit sphere with a
 * turquoise rim. CSS and SVG only — the fallback when no Spline scene is
 * configured, WebGL is missing, or motion is reduced.
 */
function CssGlobe({ size }: { size: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-[-18%] rounded-full bg-[radial-gradient(closest-side,rgba(22,217,208,0.22),transparent)]" />
      <div className="absolute inset-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_32%_30%,#1aa7b8_0%,#07516a_38%,#062b3c_70%,#031d2a_100%)] shadow-[inset_-14px_-18px_40px_rgba(0,0,0,0.55),inset_6px_8px_24px_rgba(167,243,229,0.18),0_0_40px_rgba(22,217,208,0.18)]">
        {/* Meridians drift sideways: two copies side by side make the loop seamless. */}
        <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="absolute inset-y-0 left-0 h-full w-[200%] opacity-40"
          style={{ animation: 'oasis-globe-turn 22s linear infinite' }}>
          {Array.from({ length: 16 }).map((_, i) => (
            <ellipse key={i} cx={6.25 + i * 12.5} cy="50" rx="3.2" ry="50" fill="none" stroke="#a7f3e5" strokeWidth="0.35" />
          ))}
        </svg>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-35">
          {[20, 35, 50, 65, 80].map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#a7f3e5" strokeWidth="0.35" />
          ))}
        </svg>
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_70%_75%,rgba(3,29,42,0.75),transparent_55%)]" />
      </div>
      <div className="absolute inset-0 rounded-full ring-1 ring-[rgba(22,217,208,0.35)]" />
    </div>
  )
}

export function OceanGlobe({ size = 120, className }: { size?: number; className?: string }) {
  const [canUseScene] = useState(
    () => Boolean(SCENE_URL) && hasWebGL() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const ready = useSplineViewer(canUseScene)

  return (
    <div aria-hidden className={clsx('pointer-events-none select-none', className)}>
      {canUseScene && ready ? (
        createElement('spline-viewer', { url: SCENE_URL, style: { width: size, height: size, display: 'block' } })
      ) : (
        <CssGlobe size={size} />
      )}
    </div>
  )
}
