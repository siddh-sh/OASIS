import { Fragment, useEffect, useRef, useState } from 'react'
import './OasisCursor.css'

const LABEL = 'OASIS'
const COPIES = 4
// Alternating per copy, per the reference badge: turquoise, then coral-pink.
const COLORS = ['#36E0D0', '#FF6384']

const HOVER_TARGETS = 'a, button, [role="button"], label, summary, select, [data-cursor]'
const PRIMARY_TARGETS = '[data-cursor="primary"]'
const TEXT_TARGETS = 'input, textarea, [contenteditable="true"]'

// How far the ring closes on the pointer each frame. High enough to feel
// attached, low enough to read as a soft trail.
const FOLLOW = 0.28

function canUseCustomCursor(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: fine) and (hover: hover) and (min-width: 768px)').matches
}

/**
 * Circular "OASIS" typographic cursor.
 *
 * Mount it on any page that should have it; it does nothing on touch
 * devices or narrow screens, and the native cursor is only hidden while it
 * is actually drawing. A small dot tracks the exact pointer position with no
 * lag, so precision never depends on the trailing ring.
 */
export function OasisCursor() {
  const ringRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const [enabled, setEnabled] = useState(canUseCustomCursor)

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine) and (hover: hover) and (min-width: 768px)')
    const update = () => setEnabled(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const ring = ringRef.current
    const dot = dotRef.current
    if (!enabled || !ring || !dot) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const root = document.documentElement
    root.classList.add('oasis-cursor-on')

    let tx = -100
    let ty = -100
    let x = tx
    let y = ty
    let frame = 0
    let shown = false

    const place = () => {
      ring.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }

    // Runs only while the ring is still catching up, then stops — no
    // permanent per-frame work while the pointer is idle.
    const tick = () => {
      x += (tx - x) * FOLLOW
      y += (ty - y) * FOLLOW
      if (Math.abs(tx - x) < 0.2 && Math.abs(ty - y) < 0.2) {
        x = tx
        y = ty
        place()
        frame = 0
        return
      }
      place()
      frame = requestAnimationFrame(tick)
    }

    const setVisible = (v: boolean) => {
      shown = v
      ring.style.opacity = v ? '1' : '0'
      dot.style.opacity = v ? '1' : '0'
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      tx = e.clientX
      ty = e.clientY
      dot.style.transform = `translate3d(${tx}px, ${ty}px, 0)`
      if (!shown) {
        x = tx
        y = ty
        place()
        setVisible(true)
      }
      if (reduced) {
        x = tx
        y = ty
        place()
      } else if (!frame) {
        frame = requestAnimationFrame(tick)
      }
    }

    const onOver = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null
      const overText = !!el?.closest(TEXT_TARGETS)
      ring.classList.toggle('is-hover', !overText && !!el?.closest(HOVER_TARGETS))
      ring.classList.toggle('is-primary', !overText && !!el?.closest(PRIMARY_TARGETS))
      // Over a text field the native I-beam takes over; drawing the ring on
      // top of it would just obscure the caret.
      ring.style.visibility = overText ? 'hidden' : 'visible'
      dot.style.visibility = overText ? 'hidden' : 'visible'
    }

    const onDown = () => {
      ring.classList.add('is-down')
      ring.classList.remove('is-pulse')
      // Force a reflow so the pulse restarts on rapid clicks.
      void ring.offsetWidth
      ring.classList.add('is-pulse')
    }
    const onUp = () => ring.classList.remove('is-down')
    const onLeave = () => setVisible(false)

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerover', onOver, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)

    return () => {
      cancelAnimationFrame(frame)
      root.classList.remove('oasis-cursor-on')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerover', onOver)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <>
      <div ref={ringRef} className="oasis-cursor" style={{ opacity: 0 }} aria-hidden>
        <div className="oasis-cursor-scale">
          <svg viewBox="0 0 100 100" width="72" height="72">
            <defs>
              <path id="oasis-cursor-path" d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0" />
            </defs>
            <circle cx="50" cy="50" r="46" fill="rgba(3,27,42,0.28)" stroke="rgba(167,243,229,0.18)" strokeWidth="0.8" />
            <g className="oasis-cursor-orbit">
              <text fontSize="11.5" fontWeight="700" letterSpacing="1.6"
                style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
                <textPath href="#oasis-cursor-path" textLength="224" lengthAdjust="spacing">
                  {Array.from({ length: COPIES }, (_, i) => (
                    <Fragment key={i}>
                      <tspan fill={COLORS[i % 2]}>{LABEL}</tspan>
                      <tspan fill="#A7F3E5" fontSize="8">{' ✦ '}</tspan>
                    </Fragment>
                  ))}
                </textPath>
              </text>
            </g>
            {/* Central marine star: a four-point compass rose. */}
            <path d="M50,41 L52.2,47.8 L59,50 L52.2,52.2 L50,59 L47.8,52.2 L41,50 L47.8,47.8 Z"
              fill="none" stroke="#36E0D0" strokeWidth="1.1" strokeLinejoin="round" opacity="0.9" />
          </svg>
        </div>
        <span className="oasis-cursor-pulse" />
      </div>
      <div ref={dotRef} className="oasis-cursor-dot" style={{ opacity: 0 }} aria-hidden />
    </>
  )
}
