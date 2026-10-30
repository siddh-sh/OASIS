import { useEffect, useRef, useState } from 'react'

/**
 * Eases a number from 0 (or its previous value) to `target` once.
 * Returns the target immediately under prefers-reduced-motion. Only the
 * displayed figure animates; the value itself is never altered.
 */
export function useCountUp(target: number | undefined, duration = 1100): number | undefined {
  const [value, setValue] = useState<number | undefined>(target)
  const from = useRef(0)

  useEffect(() => {
    if (target === undefined) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    const start = performance.now()
    const begin = from.current
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(begin + (target - begin) * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
      else from.current = target
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])

  return value
}
