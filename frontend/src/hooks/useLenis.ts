import Lenis from 'lenis'
import { useEffect, type RefObject } from 'react'

/**
 * Lenis smooth scrolling for one scroll container (or the window, when no
 * refs are given). One instance per call site, destroyed on unmount.
 *
 * Inner scrollers are left alone: anything inside a Leaflet map, or marked
 * `data-lenis-prevent`, keeps native wheel and touch behaviour, so map zoom,
 * chat histories and scrollable lists work exactly as before.
 */
export function useLenis(
  wrapper?: RefObject<HTMLElement | null>,
  content?: RefObject<HTMLElement | null>,
  { anchors = false }: { anchors?: boolean } = {},
) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Touch devices already have momentum scrolling; leave them native.
    if (!window.matchMedia('(pointer: fine)').matches) return
    const wrapperEl = wrapper?.current
    const contentEl = content?.current
    if (wrapper && (!wrapperEl || !contentEl)) return

    const lenis = new Lenis({
      ...(wrapperEl && contentEl ? { wrapper: wrapperEl, content: contentEl } : {}),
      autoRaf: true,
      lerp: 0.12,
      anchors,
      prevent: (node) => Boolean(node.closest?.('.leaflet-container, [data-lenis-prevent]')),
    })
    return () => lenis.destroy()
  }, [wrapper, content, anchors])
}
