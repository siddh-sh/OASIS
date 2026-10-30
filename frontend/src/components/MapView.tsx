import { DivIcon, type LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
// Styles the cluster bubbles react-leaflet-cluster renders (the numbered
// circles grouping nearby stations) — without this, a cluster is a DOM node
// with no visual treatment at all: no circle, no background, no border,
// just an unstyled number easy to mistake for "the markers didn't load."
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, Marker, Polygon, Popup, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet'
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
 * common failure case. Display names are `map.kind.<kind>` in the
 * dictionaries.
 */
export const STATION_STYLES: Record<StationKind, { color: string; shape: string }> = {
  'satellite-grid': { color: '#0e7490', shape: 'circle' },
  'coastal-anchor': { color: '#b45309', shape: 'square' },
  'in-situ-buoy': { color: '#7c3aed', shape: 'diamond' },
  occurrence: { color: '#15803d', shape: 'circle' },
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

export interface Hemispheres {
  N: string
  S: string
  E: string
  W: string
}

/** 4 dp ≈ 11 m — enough to identify a station, not so much it's noise.
 *  Only the hemisphere letters are localised; the figures never change. */
export function formatCoords(lat: number, lon: number, h: Hemispheres): string {
  const ns = lat >= 0 ? h.N : h.S
  const ew = lon >= 0 ? h.E : h.W
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`
}

function useHemispheres(): Hemispheres {
  const { t } = useTranslation()
  return { N: t('map.hemisphere.N'), S: t('map.hemisphere.S'), E: t('map.hemisphere.E'), W: t('map.hemisphere.W') }
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
  /** Named region boundaries to shade — e.g. the state(s) a species was found in. */
  regionShapes?: { id: string | number; name: string; positions: [number, number][] }[]
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
/** Leaflet hard-codes the popup close button's label as "Close popup";
 *  relabel it in the UI language each time a popup opens. */
function PopupCloseLabel() {
  const { t } = useTranslation()
  useMapEvents({
    popupopen: (e) =>
      e.popup.getElement()?.querySelector('.leaflet-popup-close-button')?.setAttribute('aria-label', t('map.closePopup')),
  })
  return null
}

function CursorCoords() {
  const hemispheres = useHemispheres()
  const [pos, setPos] = useState<[number, number] | null>(null)
  useMapEvents({
    mousemove: (e) => setPos([e.latlng.lat, e.latlng.lng]),
    mouseout: () => setPos(null),
  })
  if (!pos) return null
  return (
    <div className="absolute bottom-8 left-3 z-[1000] rounded-lg border border-[var(--glass-line)] bg-[rgba(4,29,43,0.86)] px-2.5 py-1 font-mono text-[11px] text-ocean-200 shadow-[var(--glass-shadow)] backdrop-blur-md">
      {formatCoords(pos[0], pos[1], hemispheres)}
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
  regionShapes,
}: MapViewProps) {
  const { t, i18n } = useTranslation()
  const hemispheres = useHemispheres()
  const markerEls = markers.map((m) => {
    const coords = formatCoords(m.lat, m.lon, hemispheres)
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
    <div style={{ height, position: 'relative' }} data-lenis-prevent>
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={MIN_ZOOM}
        maxBounds={INDIA_BOUNDS}
        // 1.0 makes the boundary solid rather than elastic, so the user
        // cannot drag past it and snap back.
        maxBoundsViscosity={1.0}
        scrollWheelZoom
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        {/* Leaflet builds the control once, so it is re-keyed on the
            language to pick up the translated button titles. */}
        <ZoomControl
          key={i18n.language}
          position="topleft"
          zoomInTitle={t('map.zoomIn')}
          zoomOutTitle={t('map.zoomOut')}
        />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          bounds={INDIA_BOUNDS}
          noWrap
        />
        {regionShapes?.map((r) => (
          <Polygon
            key={r.id}
            positions={r.positions}
            pathOptions={{ color: '#15803d', weight: 1.5, fillColor: '#15803d', fillOpacity: 0.12 }}
          >
            <Popup>
              <div className="text-xs font-medium">{r.name}</div>
            </Popup>
          </Polygon>
        ))}
        {cluster ? <MarkerClusterGroup chunkedLoading>{markerEls}</MarkerClusterGroup> : markerEls}
        <CursorCoords />
        <PopupCloseLabel />
      </MapContainer>

      {legend && kindsPresent.length > 0 && (
        <div className="absolute right-3 bottom-8 z-[1000] rounded-xl border border-[var(--glass-line)] bg-[rgba(4,29,43,0.86)] px-3.5 py-2.5 text-xs shadow-[var(--glass-shadow)] backdrop-blur-md">
          <div className="mb-1.5 text-[10px] font-semibold tracking-[0.16em] text-turquoise uppercase">{t('map.legendTitle')}</div>
          <ul className="flex flex-col gap-1">
            {kindsPresent.map((k) => (
              <li key={k} className="flex items-center gap-2 text-ocean-100">
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
                {t(`map.kind.${k}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
