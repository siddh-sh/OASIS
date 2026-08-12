import { DivIcon, type LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'

// India coastal bbox center — matches the region every collector in
// data-pipeline/collectors targets (docs/developer-c-week1-flow.md).
const DEFAULT_CENTER: [number, number] = [15, 78]
const DEFAULT_ZOOM = 5

/**
 * Pan/zoom limit: India plus the water the data actually covers.
 *
 * Deliberately wider than a "just India" rectangle, because a tighter box
 * would make real records unreachable. Measured extents of what is loaded:
 *   in-situ RAMA buoys   lat -5.00 .. 15.00, lon 65.00 .. 95.00
 *   satellite grid       lat  6.03 .. 23.04, lon 68.03 .. 89.78
 *   species occurrences  lat  6.00 .. 34.09, lon 68.53 .. 95.40
 *
 * The buoys sit south of the equator (the RAMA array is equatorial, not
 * coastal — see schema.sql) and occurrences run up to 34°N, so a 5°N–25°N
 * box would silently hide both. These bounds contain everything with a
 * margin while still preventing a pan to Europe or the Americas.
 */
const INDIA_BOUNDS: LatLngBoundsExpression = [
  [-10, 60],
  [38, 100],
]
const MIN_ZOOM = 4

export type StationKind = 'satellite-grid' | 'coastal-anchor' | 'in-situ-buoy' | 'occurrence'

/**
 * Shape *and* colour differ per kind, never colour alone — roughly 1 in 12
 * men has some form of colour-vision deficiency, and red/green dots are the
 * common failure case.
 */
export const STATION_STYLES: Record<StationKind, { label: string; color: string; shape: string }> = {
  'satellite-grid': { label: 'Satellite grid cell', color: '#0e7490', shape: 'circle' },
  'coastal-anchor': { label: 'Coastal station', color: '#b45309', shape: 'square' },
  'in-situ-buoy': { label: 'Moored buoy', color: '#7c3aed', shape: 'diamond' },
  occurrence: { label: 'Species occurrence', color: '#15803d', shape: 'circle' },
}

function shapeCss(shape: string): string {
  if (shape === 'square') return 'border-radius:2px;'
  if (shape === 'diamond') return 'border-radius:2px;transform:rotate(45deg);'
  return 'border-radius:9999px;'
}

function markerIcon(kind: StationKind | undefined, colorClass: string | undefined, hoverText: string) {
  // The native `title` attribute is what actually delivers hover text here.
  // Leaflet's own tooltips do not work inside react-leaflet-cluster: a
  // <Tooltip> child never binds, a ref-time bindTooltip binds to a marker the
  // cluster has not yet placed on the map, and an eventHandlers mouseover
  // never fires at all (verified — click on the same marker fires, hover does
  // not, so the cluster is swallowing pointer-move events). `title` is
  // rendered by the browser and cannot be intercepted.
  const title = escapeHtml(hoverText)
  // Legacy callers pass a Tailwind colorClass; newer ones pass a kind.
  if (!kind) {
    return new DivIcon({
      className: '',
      html: `<span title="${title}" class="block h-3 w-3 rounded-full border-2 border-white shadow ${colorClass ?? 'bg-ocean-500'}"></span>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    })
  }
  const { color, shape } = STATION_STYLES[kind]
  return new DivIcon({
    className: '',
    html: `<span title="${title}" style="display:block;height:12px;width:12px;background:${color};border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.4);${shapeCss(shape)}"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

/** Titles come from the database, so they are escaped before going into
 *  the tooltip's innerHTML. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

/** 4 dp ≈ 11 m — enough to identify a station, not so much it's noise. */
export function formatCoords(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`
}

export interface MapMarker {
  id: string | number
  lat: number
  lon: number
  kind?: StationKind
  colorClass?: string
  /** Short label shown above the coordinates on hover. */
  title?: string
  popup?: React.ReactNode
}

interface MapViewProps {
  markers: MapMarker[]
  height?: number | string
  center?: [number, number]
  zoom?: number
  cluster?: boolean
  /** Show the station-type key. Off where every marker is the same kind. */
  legend?: boolean
}

/**
 * Live lat/lon under the pointer.
 *
 * This is the "area hover" half of the coordinate requirement: markers carry
 * their own exact stored position, but for the water between them — where
 * satellite grid cells and anomalies live — the meaningful answer is where
 * the cursor actually is. Uses map-level mousemove, which works regardless of
 * what the cluster plugin does to marker events.
 */
function CursorCoords() {
  const [pos, setPos] = useState<[number, number] | null>(null)
  useMapEvents({
    mousemove: (e) => setPos([e.latlng.lat, e.latlng.lng]),
    mouseout: () => setPos(null),
  })
  if (!pos) return null
  return (
    <div className="absolute bottom-4 left-3 z-[1000] rounded-md border border-ocean-200 bg-white/95 px-2 py-1 font-mono text-[11px] text-ocean-700 shadow dark:border-ocean-700 dark:bg-ocean-950/95 dark:text-ocean-300">
      {formatCoords(pos[0], pos[1])}
    </div>
  )
}

export function MapView({
  markers,
  height = 400,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  cluster = true,
  legend = false,
}: MapViewProps) {
  const markerEls = markers.map((m) => {
    const coords = formatCoords(m.lat, m.lon)
    return (
      <Marker
        key={m.id}
        position={[m.lat, m.lon]}
        icon={markerIcon(m.kind, m.colorClass, m.title ? `${m.title} — ${coords}` : coords)}
      >
        <Popup>
          <div className="text-xs">
            {m.title && <div className="font-medium">{m.title}</div>}
            {/* Exact stored position of this point, not an interpolation. */}
            <div className="font-mono text-ocean-600">{coords}</div>
            {m.popup && <div className="mt-1">{m.popup}</div>}
          </div>
        </Popup>
      </Marker>
    )
  })

  const kindsPresent = Array.from(
    new Set(markers.map((m) => m.kind).filter((k): k is StationKind => Boolean(k))),
  )

  return (
    <div style={{ height, position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={MIN_ZOOM}
        maxBounds={INDIA_BOUNDS}
        // 1.0 makes the boundary solid rather than elastic, so the user
        // cannot drag past it and snap back.
        maxBoundsViscosity={1.0}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          bounds={INDIA_BOUNDS}
          noWrap
        />
        {cluster ? <MarkerClusterGroup chunkedLoading>{markerEls}</MarkerClusterGroup> : markerEls}
        <CursorCoords />
      </MapContainer>

      {legend && kindsPresent.length > 0 && (
        <div className="absolute bottom-4 right-3 z-[1000] rounded-md border border-ocean-200 bg-white/95 px-3 py-2 text-xs shadow dark:border-ocean-700 dark:bg-ocean-950/95">
          <div className="mb-1 font-medium text-ocean-950 dark:text-ocean-50">Station type</div>
          <ul className="flex flex-col gap-1">
            {kindsPresent.map((k) => (
              <li key={k} className="flex items-center gap-2 text-ocean-600 dark:text-ocean-300">
                <span
                  style={{
                    display: 'inline-block',
                    height: 10,
                    width: 10,
                    background: STATION_STYLES[k].color,
                    border: '2px solid #fff',
                    boxShadow: '0 1px 2px rgba(0,0,0,.4)',
                    ...(STATION_STYLES[k].shape === 'square' ? { borderRadius: 2 } : {}),
                    ...(STATION_STYLES[k].shape === 'diamond'
                      ? { borderRadius: 2, transform: 'rotate(45deg)' }
                      : {}),
                    ...(STATION_STYLES[k].shape === 'circle' ? { borderRadius: 9999 } : {}),
                  }}
                />
                {STATION_STYLES[k].label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
