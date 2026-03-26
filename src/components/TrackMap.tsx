import { useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Lap, Corner } from '../types'

interface TrackMapProps {
  laps: Lap[]
  selectedLapIds: number[]
  corners: Corner[]
  fastestLapId: number
}

const LAP_COLORS = [
  '#ef4444', // red (fastest)
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

function speedToColor(speed: number, minSpeed: number, maxSpeed: number): string {
  const range = maxSpeed - minSpeed || 1
  const ratio = (speed - minSpeed) / range
  // green -> yellow -> red
  if (ratio < 0.5) {
    const t = ratio * 2
    const r = Math.round(255 * t)
    const g = 255
    return `rgb(${r},${g},0)`
  } else {
    const t = (ratio - 0.5) * 2
    const r = 255
    const g = Math.round(255 * (1 - t))
    return `rgb(${r},${g},0)`
  }
}

function createCornerIcon(name: string) {
  return L.divIcon({
    className: '',
    html: `<div style="background:#7c3aed;color:white;font-size:10px;font-weight:bold;padding:2px 5px;border-radius:4px;white-space:nowrap;border:1px solid #a78bfa;">${name}</div>`,
    iconSize: [30, 18],
    iconAnchor: [15, 9],
  })
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20] })
    }
  }, [map, bounds])
  return null
}

export default function TrackMap({ laps, selectedLapIds, corners, fastestLapId }: TrackMapProps) {
  const selectedLaps = useMemo(
    () => laps.filter((l) => selectedLapIds.includes(l.id)),
    [laps, selectedLapIds]
  )

  const bounds = useMemo(() => {
    const allPoints = selectedLaps.flatMap((l) => l.points)
    if (allPoints.length === 0) {
      const fallback = laps.flatMap((l) => l.points)
      if (fallback.length === 0) return null
      const lats = fallback.map((p) => p.lat)
      const lngs = fallback.map((p) => p.lng)
      return L.latLngBounds([Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)])
    }
    const lats = allPoints.map((p) => p.lat)
    const lngs = allPoints.map((p) => p.lng)
    return L.latLngBounds([Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)])
  }, [selectedLaps, laps])

  // Speed-colored segments for the primary selected lap
  const speedSegments = useMemo(() => {
    if (selectedLaps.length === 0) return []
    const lap = selectedLaps[0]
    const speeds = lap.points.map((p) => p.speed)
    const sorted = [...speeds].sort((a, b) => a - b)
    const minSpeed = sorted[Math.floor(sorted.length * 0.05)] ?? 0
    const maxSpeed = sorted[Math.floor(sorted.length * 0.95)] ?? 1

    const segments: Array<{ positions: [number, number][]; color: string }> = []
    for (let i = 0; i < lap.points.length - 1; i++) {
      const avgSpeed = (lap.points[i].speed + lap.points[i + 1].speed) / 2
      segments.push({
        positions: [
          [lap.points[i].lat, lap.points[i].lng],
          [lap.points[i + 1].lat, lap.points[i + 1].lng],
        ],
        color: speedToColor(avgSpeed, minSpeed, maxSpeed),
      })
    }
    return segments
  }, [selectedLaps])

  // Corner markers using the fastest lap's points
  const cornerMarkers = useMemo(() => {
    const fastest = laps.find((l) => l.id === fastestLapId)
    if (!fastest) return []
    return corners
      .filter((c) => c.startIndex < fastest.points.length && c.endIndex < fastest.points.length)
      .map((c) => {
        const midIdx = Math.floor((c.startIndex + c.endIndex) / 2)
        const point = fastest.points[Math.min(midIdx, fastest.points.length - 1)]
        return { corner: c, lat: point.lat, lng: point.lng }
      })
  }, [corners, laps, fastestLapId])

  const defaultCenter: [number, number] = bounds
    ? [bounds.getCenter().lat, bounds.getCenter().lng]
    : [0, 0]

  if (laps.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <p className="text-gray-500">No lap data available</p>
      </div>
    )
  }

  return (
    <MapContainer center={defaultCenter} zoom={16} className="h-full w-full" zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      <FitBounds bounds={bounds} />

      {/* Speed-colored track for primary selection */}
      {selectedLaps.length === 1 &&
        speedSegments.map((seg, i) => (
          <Polyline key={i} positions={seg.positions} color={seg.color} weight={4} opacity={0.9} />
        ))}

      {/* Multiple lap overlay */}
      {selectedLaps.length > 1 &&
        selectedLaps.map((lap, idx) => {
          const positions = lap.points.map((p) => [p.lat, p.lng] as [number, number])
          const color = lap.id === fastestLapId ? LAP_COLORS[0] : LAP_COLORS[(idx % (LAP_COLORS.length - 1)) + 1]
          return (
            <Polyline
              key={lap.id}
              positions={positions}
              color={color}
              weight={3}
              opacity={0.8}
            />
          )
        })}

      {/* Corner markers */}
      {cornerMarkers.map((cm) => (
        <Marker
          key={cm.corner.id}
          position={[cm.lat, cm.lng]}
          icon={createCornerIcon(cm.corner.name)}
        />
      ))}
    </MapContainer>
  )
}
