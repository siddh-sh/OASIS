import { DivIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'

// India coastal bbox center — matches the region every collector in
// data-pipeline/collectors targets (docs/developer-c-week1-flow.md).
const DEFAULT_CENTER: [number, number] = [15, 78]
const DEFAULT_ZOOM = 5

function dotIcon(colorClass: string) {
  return new DivIcon({
    className: '',
    html: `<span class="block h-3 w-3 rounded-full border-2 border-white shadow ${colorClass}"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

export interface MapMarker {
  id: string | number
  lat: number
  lon: number
  colorClass?: string
  popup?: React.ReactNode
}

interface MapViewProps {
  markers: MapMarker[]
  height?: number | string
  center?: [number, number]
  zoom?: number
  cluster?: boolean
}

export function MapView({ markers, height = 400, center = DEFAULT_CENTER, zoom = DEFAULT_ZOOM, cluster = true }: MapViewProps) {
  const markerEls = markers.map((m) => (
    <Marker key={m.id} position={[m.lat, m.lon]} icon={dotIcon(m.colorClass ?? 'bg-ocean-500')}>
      {m.popup && <Popup>{m.popup}</Popup>}
    </Marker>
  ))

  return (
    <div style={{ height }}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {cluster ? <MarkerClusterGroup chunkedLoading>{markerEls}</MarkerClusterGroup> : markerEls}
      </MapContainer>
    </div>
  )
}
