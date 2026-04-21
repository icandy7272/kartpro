import { Pane, Polyline } from 'react-leaflet'
import type { MapMode } from '../../lib/map/map-modes'

interface TrackPointLike {
  lat: number
  lng: number
}

interface TrackAlignmentLayerProps {
  mode: MapMode
  points: TrackPointLike[]
}

export default function TrackAlignmentLayer({ mode, points }: TrackAlignmentLayerProps) {
  if (mode !== 'align' || points.length < 2) {
    return null
  }

  const positions = points.map((point) => [point.lat, point.lng] as [number, number])

  return (
    <Pane name="track-alignment-pane" style={{ zIndex: 350 }}>
      <Polyline
        pathOptions={{ color: '#e2e8f0', lineCap: 'round', lineJoin: 'round', opacity: 0.18, weight: 26 }}
        positions={positions}
      />
      <Polyline
        pathOptions={{ color: '#94a3b8', lineCap: 'round', lineJoin: 'round', opacity: 0.32, weight: 16 }}
        positions={positions}
      />
    </Pane>
  )
}
