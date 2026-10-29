import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { oceanApi } from '@/api/ocean'
import { useFisheriesSummary } from '@/hooks/useFisheriesData'
import { useMolecularRecords } from '@/hooks/useMolecularData'
import { useOceanReadingsSummary, useOceanStations } from '@/hooks/useOceanData'
import { useSpeciesList } from '@/hooks/useSpeciesData'
import { useWeatherObservations } from '@/hooks/useWeatherData'

/**
 * Adds `is-visible` once the element scrolls into view, then stops
 * observing — a one-shot reveal, not a scroll-linked animation.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) {
      el.classList.add('is-visible')
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible')
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return ref
}

/** True once the element has come within `margin` of the viewport. Used to defer fetches. */
export function useNearViewport<T extends HTMLElement = HTMLDivElement>(margin = '400px') {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    if (!('IntersectionObserver' in window)) {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [margin, near])
  return { ref, near }
}

/**
 * The same figures the dashboard's KPI row shows, through the very same
 * hooks — so the homepage and /dashboard share one cache and can never
 * disagree. Every endpoint here is public.
 */
export function usePlatformStats() {
  const stations = useOceanStations({ limit: 500 })
  const sst = useOceanReadingsSummary('sst')
  const species = useSpeciesList({ limit: 1 })
  const molecular = useMolecularRecords({ limit: 1 })
  const weather = useWeatherObservations({ limit: 1 })
  const fisheries = useFisheriesSummary()
  const totals = fisheries.data?.national_totals ?? []
  return {
    stations,
    stationCount: stations.data?.total,
    avgSst: sst.data?.[0]?.avg_value ?? undefined,
    sstCount: sst.data?.[0]?.count,
    speciesCount: species.data?.total,
    molecularCount: molecular.data?.total,
    weatherCount: weather.data?.total,
    catchSeries: totals,
    latestCatch: totals.at(-1),
    loading: stations.isLoading || sst.isLoading || species.isLoading,
    failed: stations.isError && sst.isError && species.isError,
  }
}

/** Latest satellite SST per grid cell, joined to cell positions. */
export function useSatelliteSst(enabled: boolean) {
  return useQuery({
    queryKey: ['home', 'satellite-sst'],
    queryFn: async () => {
      const [cells, latest] = await Promise.all([
        oceanApi.stations({ station_type: 'satellite-grid', limit: 1000 }),
        oceanApi.latestReadings({ station_type: 'satellite-grid' }),
      ])
      const sst = new Map(latest.map((r) => [r.station_id, r.sst]))
      return cells.items
        .map((c) => ({ lat: c.lat, lon: c.lon, sst: sst.get(c.station_id) }))
        .filter((c): c is { lat: number; lon: number; sst: number } => c.sst != null)
    },
    staleTime: 30 * 60 * 1000,
    enabled,
  })
}

export function formatCount(n: number | undefined): string {
  return n === undefined ? '—' : n.toLocaleString()
}
