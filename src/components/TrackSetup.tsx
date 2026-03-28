import { useState, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GPSPoint, Corner, Lap, TrackProfile } from '../types'

interface StartFinishLine {
  lat1: number; lng1: number; lat2: number; lng2: number
}

interface TrackSetupProps {
  points: GPSPoint[]
  autoDetected: StartFinishLine | null
  onComplete: (data: {
    startFinishLine: StartFinishLine
    laps: Lap[]
    corners: Corner[]
    trackName?: string
  }) => void
  detectLaps: (points: GPSPoint[], sf: StartFinishLine) => Lap[]
  detectCorners: (points: GPSPoint[]) => Corner[]
  matchedProfile?: TrackProfile | null
  defaultTrackName?: string
}

type Stage = 'sf' | 'corners'
type SFMode = 'auto' | 'manual'
// Max distance in meters from track to register a corner click
const MAX_CLICK_DISTANCE = 30

function createMarkerIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function createCornerIcon(name: string, canDelete: boolean) {
  return L.divIcon({
    className: '',
    html: `<div style="background:#7c3aed;color:white;font-size:11px;font-weight:bold;padding:3px 6px;border-radius:4px;white-space:nowrap;border:1px solid #a78bfa;cursor:${canDelete ? 'pointer' : 'default'}">${name}${canDelete ? ' ✕' : ''}</div>`,
    iconSize: [canDelete ? 46 : 34, 20],
    iconAnchor: [canDelete ? 23 : 17, 10],
  })
}

function speedToColor(speed: number, minSpeed: number, maxSpeed: number): string {
  const range = maxSpeed - minSpeed || 1
  const ratio = (speed - minSpeed) / range
  if (ratio < 0.5) {
    const t = ratio * 2
    return `rgb(255,${Math.round(255 * t)},0)`
  } else {
    const t = (ratio - 0.5) * 2
    return `rgb(${Math.round(255 * (1 - t))},255,0)`
  }
}

function haversineDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap()
  // Only fit on first render
  const [fitted, setFitted] = useState(false)
  if (bounds && !fitted) {
    map.fitBounds(bounds, { padding: [30, 30] })
    setFitted(true)
  }
  return null
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onClick(e.latlng.lat, e.latlng.lng) } })
  return null
}

export default function TrackSetup({ points, autoDetected, onComplete, detectLaps, detectCorners, matchedProfile, defaultTrackName }: TrackSetupProps) {
  const [stage, setStage] = useState<Stage>('sf')
  const [sfMode, setSFMode] = useState<SFMode>('auto')
  const [manualPoints, setManualPoints] = useState<Array<{ lat: number; lng: number }>>([])
  const [sfLine, setSFLine] = useState<StartFinishLine | null>(null)
  const [laps, setLaps] = useState<Lap[]>([])
  const [corners, setCorners] = useState<Corner[]>([])
  const [error, setError] = useState<string | null>(null)
  const [trackName, setTrackName] = useState(defaultTrackName ?? '未命名赛道')

  const bounds = useMemo(() => {
    if (points.length === 0) return null
    const lats = points.map((p) => p.lat)
    const lngs = points.map((p) => p.lng)
    return L.latLngBounds(
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    )
  }, [points])

  const trackPositions = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points])

  // Speed segments for the fastest lap
  const fastestLap = useMemo(() => {
    if (laps.length === 0) return null
    return laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), laps[0])
  }, [laps])

  const speedSegments = useMemo(() => {
    if (!fastestLap) return []
    const pts = fastestLap.points
    const speeds = pts.map((p) => p.speed)
    const sorted = [...speeds].sort((a, b) => a - b)
    const minSpeed = sorted[Math.floor(sorted.length * 0.05)] ?? 0
    const maxSpeed = sorted[Math.floor(sorted.length * 0.95)] ?? 1
    const segments: Array<{ positions: [number, number][]; color: string }> = []
    for (let i = 0; i < pts.length - 1; i++) {
      const avgSpeed = (pts[i].speed + pts[i + 1].speed) / 2
      segments.push({
        positions: [[pts[i].lat, pts[i].lng], [pts[i + 1].lat, pts[i + 1].lng]],
        color: speedToColor(avgSpeed, minSpeed, maxSpeed),
      })
    }
    return segments
  }, [fastestLap])

  const cornerMarkers = useMemo(() => {
    if (!fastestLap) return []
    const metersPerDegLat = 111320
    const metersPerDegLng = 111320 * Math.cos(((fastestLap.points[0]?.lat ?? 0) * Math.PI) / 180)
    const offsetMeters = 25 // label offset distance from track

    return corners
      .filter((c) => c.startIndex < fastestLap.points.length && c.endIndex < fastestLap.points.length)
      .map((c) => {
        const midIdx = Math.floor((c.startIndex + c.endIndex) / 2)
        const trackPoint = fastestLap.points[Math.min(midIdx, fastestLap.points.length - 1)]

        // Calculate track direction at this point
        const prevIdx = Math.max(0, midIdx - 3)
        const nextIdx = Math.min(fastestLap.points.length - 1, midIdx + 3)
        const prev = fastestLap.points[prevIdx]
        const next = fastestLap.points[nextIdx]
        const dx = next.lng - prev.lng
        const dy = next.lat - prev.lat
        const len = Math.sqrt(dx * dx + dy * dy)

        // Perpendicular direction (offset to outside of curve)
        let perpLat = dx / (len || 1) // perpendicular: swap and negate
        let perpLng = -dy / (len || 1)

        // Use corner direction to place label on outside of turn
        if (c.direction === 'left') {
          perpLat = -perpLat
          perpLng = -perpLng
        }

        const labelLat = trackPoint.lat + (perpLat * offsetMeters) / metersPerDegLat
        const labelLng = trackPoint.lng + (perpLng * offsetMeters) / metersPerDegLng

        return {
          corner: c,
          trackLat: trackPoint.lat,
          trackLng: trackPoint.lng,
          labelLat,
          labelLng,
        }
      })
  }, [corners, fastestLap])

  // ---- SF Line handlers ----
  const handleSFMapClick = useCallback((lat: number, lng: number) => {
    if (stage === 'sf' && sfMode === 'manual') {
      setManualPoints((prev) => {
        if (prev.length >= 2) return [{ lat, lng }]
        return [...prev, { lat, lng }]
      })
    }
  }, [stage, sfMode])

  const handleConfirmSF = useCallback(() => {
    let sf: StartFinishLine | null = null
    if (sfMode === 'auto' && autoDetected) {
      sf = autoDetected
    } else if (sfMode === 'manual' && manualPoints.length === 2) {
      sf = {
        lat1: manualPoints[0].lat, lng1: manualPoints[0].lng,
        lat2: manualPoints[1].lat, lng2: manualPoints[1].lng,
      }
    }
    if (!sf) return

    const detectedLaps = detectLaps(points, sf)
    if (detectedLaps.length === 0) {
      setError('未检测到圈数，请调整起终点线位置。')
      return
    }

    const fastest = detectedLaps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), detectedLaps[0])
    const detectedCorners = detectCorners(fastest.points)

    setSFLine(sf)
    setLaps(detectedLaps)
    setCorners(detectedCorners)
    setError(null)
    setStage('corners')
  }, [sfMode, autoDetected, manualPoints, points, detectLaps, detectCorners])

  // ---- Corner editing handlers ----
  const handleCornerMapClick = useCallback((lat: number, lng: number) => {
    if (stage !== 'corners' || !fastestLap) return

    // Find closest point on track
    let closestIdx = 0
    let closestDist = Infinity
    for (let i = 0; i < fastestLap.points.length; i++) {
      const d = haversineDistance(fastestLap.points[i], { lat, lng })
      if (d < closestDist) { closestDist = d; closestIdx = i }
    }

    // Ignore clicks too far from the track
    if (closestDist > MAX_CLICK_DISTANCE) return

    const halfSize = 8
    const startIdx = Math.max(0, closestIdx - halfSize)
    const endIdx = Math.min(fastestLap.points.length - 1, closestIdx + halfSize)
    const cornerPoints = fastestLap.points.slice(startIdx, endIdx + 1)
    const speeds = cornerPoints.map(p => p.speed)
    const minSpd = Math.min(...speeds)
    const entryIdx = Math.max(0, startIdx - 1)
    const exitIdx = Math.min(fastestLap.points.length - 1, endIdx + 1)

    const newCorners = [...corners]
    const midIdx = Math.floor((startIdx + endIdx) / 2)
    const newCorner: Corner = {
      id: 0,
      name: '',
      startIndex: startIdx,
      endIndex: endIdx,
      midpointIndex: midIdx,
      apexIndex: midIdx,
      direction: 'left',
      angle: 0,
      type: '弯道',
      entrySpeed: fastestLap.points[entryIdx].speed * 3.6,
      minSpeed: minSpd * 3.6,
      exitSpeed: fastestLap.points[exitIdx].speed * 3.6,
      duration: (fastestLap.points[endIdx].time - fastestLap.points[startIdx].time) / 1000,
    }

    newCorners.push(newCorner)
    newCorners.sort((a, b) => a.startIndex - b.startIndex)

    const renumbered = newCorners.map((c, i) => ({
      ...c,
      id: i + 1,
      name: `T${i + 1}`,
    }))

    setCorners(renumbered)
  }, [stage, fastestLap, corners])

  const handleDeleteCorner = useCallback((cornerId: number) => {
    const filtered = corners.filter(c => c.id !== cornerId)
    const renumbered = filtered.map((c, i) => ({
      ...c,
      id: i + 1,
      name: `T${i + 1}`,
    }))
    setCorners(renumbered)
  }, [corners])

  const handleComplete = useCallback(() => {
    if (!sfLine || laps.length === 0) return
    onComplete({ startFinishLine: sfLine, laps, corners, trackName: trackName.trim() || '未命名赛道' })
  }, [sfLine, laps, corners, onComplete, trackName])

  const handleBackToSF = useCallback(() => {
    setStage('sf')
    setLaps([])
    setCorners([])
    setSFLine(null)
    setError(null)
  }, [])

  // ---- Current SF line positions for display ----
  const sfLinePositions = useMemo(() => {
    if (stage === 'corners' && sfLine) {
      return [[sfLine.lat1, sfLine.lng1] as [number, number], [sfLine.lat2, sfLine.lng2] as [number, number]]
    }
    if (sfMode === 'auto' && autoDetected) {
      return [[autoDetected.lat1, autoDetected.lng1] as [number, number], [autoDetected.lat2, autoDetected.lng2] as [number, number]]
    }
    if (sfMode === 'manual' && manualPoints.length === 2) {
      return manualPoints.map((p) => [p.lat, p.lng] as [number, number])
    }
    return null
  }, [stage, sfLine, sfMode, autoDetected, manualPoints])

  if (points.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">没有可用的 GPS 数据。</p>
      </div>
    )
  }

  const isCornerStage = stage === 'corners'

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-gray-100">
            {isCornerStage ? '赛道设置' : '设置起终点线'}
          </h2>
          {isCornerStage && (
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span className="text-green-400 font-medium">{laps.length} 圈</span>
              <span>|</span>
              <span className="text-purple-400 font-medium">{corners.length} 个弯道</span>
              <span>|</span>
              <span>最快 {laps.reduce((best, l) => l.duration < best ? l.duration : best, Infinity).toFixed(3)}s</span>
            </div>
          )}
        </div>

        <p className="text-gray-400 text-sm mb-3">
          {isCornerStage
            ? '检查弯道标记是否正确，可以添加或删除弯道。确认后开始分析。'
            : '在赛道上标记起终点线的位置，用于检测圈数。'}
        </p>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          {!isCornerStage && (
            <>
              <button
                onClick={() => setSFMode('auto')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  sfMode === 'auto' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                自动检测
              </button>
              <button
                onClick={() => { setSFMode('manual'); setManualPoints([]) }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  sfMode === 'manual' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                手动标记
              </button>
            </>
          )}

          {isCornerStage && (
            <button
              onClick={handleBackToSF}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            >
              ← 重设起终点
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/50 border-b border-red-700 px-6 py-2 flex items-center gap-3">
          <span className="text-red-400 font-bold text-sm">错误</span>
          <span className="text-red-200 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-100 text-sm">✕</button>
        </div>
      )}

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          bounds={bounds || undefined}
          className="h-full w-full"
          style={{ minHeight: 'calc(100vh - 230px)', cursor: (sfMode === 'manual' && stage === 'sf') || isCornerStage ? 'crosshair' : undefined }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <FitBounds bounds={bounds} />

          {/* Track line — plain purple in SF stage, speed-colored in corner stage */}
          {!isCornerStage && (
            <Polyline positions={trackPositions} color="#7c3aed" weight={3} opacity={0.8} />
          )}

          {isCornerStage && speedSegments.map((seg, i) => (
            <Polyline key={i} positions={seg.positions} color={seg.color} weight={4} opacity={0.9} />
          ))}

          {/* Start/Finish line */}
          {sfLinePositions && (
            <Polyline positions={sfLinePositions} color="#facc15" weight={4} opacity={1} dashArray={isCornerStage ? '6,4' : undefined} />
          )}

          {/* SF markers in SF stage */}
          {!isCornerStage && sfMode === 'manual' && manualPoints.map((p, i) => (
            <Marker key={i} position={[p.lat, p.lng]} icon={createMarkerIcon(i === 0 ? '#22c55e' : '#ef4444')} />
          ))}
          {!isCornerStage && sfMode === 'auto' && autoDetected && (
            <>
              <Marker position={[autoDetected.lat1, autoDetected.lng1]} icon={createMarkerIcon('#22c55e')} />
              <Marker position={[autoDetected.lat2, autoDetected.lng2]} icon={createMarkerIcon('#ef4444')} />
            </>
          )}

          {/* Corner markers with offset labels and connector lines */}
          {isCornerStage && cornerMarkers.map((cm) => (
            <span key={cm.corner.id}>
              {/* Connector line from label to track */}
              <Polyline
                positions={[
                  [cm.trackLat, cm.trackLng],
                  [cm.labelLat, cm.labelLng],
                ]}
                color="#7c3aed"
                weight={1}
                opacity={0.5}
                dashArray="3,3"
              />
              {/* Label at offset position */}
              <Marker
                position={[cm.labelLat, cm.labelLng]}
                icon={createCornerIcon(cm.corner.name, true)}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e.originalEvent)
                    handleDeleteCorner(cm.corner.id)
                  },
                }}
              />
            </span>
          ))}

          {/* Click handlers */}
          {!isCornerStage && sfMode === 'manual' && <ClickHandler onClick={handleSFMapClick} />}
          {isCornerStage && <ClickHandler onClick={handleCornerMapClick} />}
        </MapContainer>

        {/* Manual SF hint overlay */}
        {!isCornerStage && sfMode === 'manual' && manualPoints.length < 2 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/90 border border-gray-700 rounded-lg px-4 py-2">
            <p className="text-gray-300 text-sm">
              点击地图放置第 {manualPoints.length + 1} 个点（共 2 个）
            </p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="bg-gray-900 border-t border-gray-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            {!isCornerStage && sfMode === 'auto' && !autoDetected && '未能自动检测起终点线，请尝试手动标记。'}
            {!isCornerStage && sfMode === 'auto' && autoDetected && '自动检测的起终点线以黄色显示。'}
            {!isCornerStage && sfMode === 'manual' && manualPoints.length < 2 && `还需在地图上放置 ${2 - manualPoints.length} 个点。`}
            {!isCornerStage && sfMode === 'manual' && manualPoints.length === 2 && '起终点线已定义，点击下一步继续。'}
            {isCornerStage && '点击赛道添加弯道，点击删除弯道。'}
          </div>
          {isCornerStage && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">赛道名称：</label>
              <input
                type="text"
                value={trackName}
                onChange={(e) => setTrackName(e.target.value)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-purple-500 w-40"
                placeholder="未命名赛道"
              />
              {matchedProfile && (
                <span className="text-xs text-green-400 ml-1">已匹配已保存赛道</span>
              )}
            </div>
          )}
        </div>

        {!isCornerStage && (
          <button
            onClick={handleConfirmSF}
            disabled={(sfMode === 'auto' && !autoDetected) || (sfMode === 'manual' && manualPoints.length < 2)}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
          >
            下一步：检测弯道 →
          </button>
        )}

        {isCornerStage && (
          <button
            onClick={handleComplete}
            className="px-8 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors text-base"
          >
            保存赛道并开始分析
          </button>
        )}
      </div>
    </div>
  )
}
