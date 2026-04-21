import { useState, useMemo, useEffect, useCallback } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Lap, Corner, BrakeThrottlePoint } from '../types'
import { getLapColor } from '../lib/lap-colors'
import { DEFAULT_MAP_MODE_BY_SURFACE, type MapMode } from '../lib/map/map-modes'
import { resolveLeafletFitBoundsPadding, resolveLeafletViewportSize } from '../lib/map/fit-padding'
import { getLeafletTileLayerProps, resolveMapModeProvider } from '../lib/map/map-tile-config'
import MapModeSwitcher from './maps/MapModeSwitcher'
import SatelliteCalibrationControl from './maps/SatelliteCalibrationControl'
import TrackAlignmentLayer from './maps/TrackAlignmentLayer'
import AmapSatelliteMap from './maps/AmapSatelliteMap'
import { useAmapSatelliteCalibration } from './maps/useAmapSatelliteCalibration'

const DEFAULT_FIT_BOUNDS_PADDING: [number, number] = [20, 20]
const DEFAULT_FIT_BOUNDS_PADDING_RATIO = 0.075
const SATELLITE_FIT_VIEW_PADDING_RATIO = 0.075
const SATELLITE_FIT_VIEW_MAX_ZOOM = 20

interface TrackMapProps {
  laps: Lap[]
  selectedLapIds: number[]
  corners: Corner[]
  fastestLapId: number
  isAddingCorner?: boolean
  onAddCorner?: (lat: number, lng: number) => void
  onDeleteCorner?: (cornerId: number) => void
  hoverPositions?: Array<{ lat: number; lng: number; color: string }> | null
  startFinishLine?: { lat1: number; lng1: number; lat2: number; lng2: number } | null
  brakePoints?: BrakeThrottlePoint[]
  throttlePoints?: BrakeThrottlePoint[]
}

function speedToColor(speed: number, minSpeed: number, maxSpeed: number): string {
  const range = maxSpeed - minSpeed || 1
  const ratio = (speed - minSpeed) / range
  // 慢=红色, 快=绿色
  if (ratio < 0.5) {
    // red → yellow (slow → medium)
    const t = ratio * 2
    return `rgb(255,${Math.round(255 * t)},0)`
  } else {
    // yellow → green (medium → fast)
    const t = (ratio - 0.5) * 2
    return `rgb(${Math.round(255 * (1 - t))},255,0)`
  }
}

function createCornerIcon(name: string, canDelete: boolean) {
  return L.divIcon({
    className: '',
    html: createCornerLabelHtml(name, canDelete),
    iconSize: [canDelete ? 42 : 30, 18],
    iconAnchor: [canDelete ? 21 : 15, 9],
  })
}

function createCornerLabelHtml(name: string, canDelete: boolean) {
  return `<div style="background:#7c3aed;color:white;font-size:10px;font-weight:bold;padding:2px 5px;border-radius:4px;white-space:nowrap;border:1px solid #a78bfa;cursor:${canDelete ? 'pointer' : 'default'}">${name}${canDelete ? ' ✕' : ''}</div>`
}

function createBrakePointHtml() {
  return '<div style="width:10px;height:10px;background:#ef4444;border:1.5px solid #fff;transform:rotate(0deg)"></div>'
}

function createThrottlePointHtml() {
  return '<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid #22c55e;filter:drop-shadow(0 0 1px #fff)"></div>'
}

function FitBounds({
  bounds,
  padding,
  paddingRatio,
}: {
  bounds: L.LatLngBounds | null
  padding: [number, number]
  paddingRatio?: number
}) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) {
      return
    }

    const effectivePadding = resolveLeafletFitBoundsPadding(
      resolveLeafletViewportSize(map.getSize(), map.getContainer()),
      padding,
      paddingRatio
    )
    map.fitBounds(bounds, { padding: effectivePadding })
  }, [map, bounds, padding, paddingRatio])
  return null
}

function ClickHandler({ onAddCorner }: { onAddCorner: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onAddCorner(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function TrackMap({
  laps, selectedLapIds, corners, fastestLapId,
  isAddingCorner, onAddCorner, onDeleteCorner,
  hoverPositions, startFinishLine,
  brakePoints, throttlePoints,
}: TrackMapProps) {
  const [mapMode, setMapMode] = useState<MapMode>(DEFAULT_MAP_MODE_BY_SURFACE.analysis)
  const {
    adjustSatelliteCalibration,
    resetSatelliteCalibration,
    satelliteCalibration,
  } = useAmapSatelliteCalibration()

  const selectedLaps = useMemo(
    () => laps.filter((l) => selectedLapIds.includes(l.id)),
    [laps, selectedLapIds]
  )

  const referenceLap = useMemo(
    () => selectedLaps[0] ?? laps.find((lap) => lap.id === fastestLapId) ?? laps[0] ?? null,
    [fastestLapId, laps, selectedLaps]
  )

  const bounds = useMemo(() => {
    const allPoints = selectedLaps.flatMap((l) => l.points)
    const pts = allPoints.length > 0 ? allPoints : laps.flatMap((l) => l.points)
    if (pts.length === 0) return null
    const lats = pts.map((p) => p.lat)
    const lngs = pts.map((p) => p.lng)
    return L.latLngBounds([Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)])
  }, [selectedLaps, laps])

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
        positions: [[lap.points[i].lat, lap.points[i].lng], [lap.points[i + 1].lat, lap.points[i + 1].lng]],
        color: speedToColor(avgSpeed, minSpeed, maxSpeed),
      })
    }
    return segments
  }, [selectedLaps])

  // Store user-dragged label positions (cornerId -> {lat, lng})
  const [draggedPositions, setDraggedPositions] = useState<Record<number, { lat: number; lng: number }>>({})

  const cornerMarkers = useMemo(() => {
    const fastest = laps.find((l) => l.id === fastestLapId)
    if (!fastest) return []
    const metersPerDegLat = 111320
    const metersPerDegLng = 111320 * Math.cos(((fastest.points[0]?.lat ?? 0) * Math.PI) / 180)
    const offsetMeters = 25

    return corners
      .filter((c) => c.startIndex < fastest.points.length && c.endIndex < fastest.points.length)
      .map((c) => {
        const midIdx = Math.floor((c.startIndex + c.endIndex) / 2)
        const trackPoint = fastest.points[Math.min(midIdx, fastest.points.length - 1)]

        // Check if user has dragged this label
        if (draggedPositions[c.id]) {
          return { corner: c, trackLat: trackPoint.lat, trackLng: trackPoint.lng, labelLat: draggedPositions[c.id].lat, labelLng: draggedPositions[c.id].lng }
        }

        // Auto-offset: perpendicular to track direction, on outside of curve
        const prevIdx = Math.max(0, midIdx - 3)
        const nextIdx = Math.min(fastest.points.length - 1, midIdx + 3)
        const prev = fastest.points[prevIdx]
        const next = fastest.points[nextIdx]
        const dx = next.lng - prev.lng
        const dy = next.lat - prev.lat
        const len = Math.sqrt(dx * dx + dy * dy)

        let perpLat = dx / (len || 1)
        let perpLng = -dy / (len || 1)
        if (c.direction === 'left') { perpLat = -perpLat; perpLng = -perpLng }

        const labelLat = trackPoint.lat + (perpLat * offsetMeters) / metersPerDegLat
        const labelLng = trackPoint.lng + (perpLng * offsetMeters) / metersPerDegLng

        return { corner: c, trackLat: trackPoint.lat, trackLng: trackPoint.lng, labelLat, labelLng }
      })
  }, [corners, laps, fastestLapId, draggedPositions])

  const handleLabelDragEnd = useCallback((cornerId: number, lat: number, lng: number) => {
    setDraggedPositions(prev => ({ ...prev, [cornerId]: { lat, lng } }))
  }, [])

  const defaultCenter: [number, number] = bounds
    ? [bounds.getCenter().lat, bounds.getCenter().lng]
    : [0, 0]
  const mapProvider = resolveMapModeProvider(mapMode, {
    amapJsApiKey: import.meta.env.VITE_AMAP_JSAPI_KEY,
  })
  const tileLayerProps = mapProvider.kind === 'leaflet-raster'
    ? getLeafletTileLayerProps(mapProvider.tileConfig)
    : null
  const fitPoints = selectedLaps.length > 0 ? selectedLaps.flatMap((lap) => lap.points) : laps.flatMap((lap) => lap.points)

  if (laps.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <p className="text-gray-500">暂无圈速数据</p>
      </div>
    )
  }

  const mapContent = mapProvider.kind === 'amap-jsapi' && mapMode === 'satellite'
    ? (
      <AmapSatelliteMap
        amapKey={mapProvider.key}
        circleOverlays={[
          ...corners.flatMap((corner) => {
            const fastest = laps.find((lap) => lap.id === fastestLapId)
            if (!fastest || corner.startIndex >= fastest.points.length || corner.endIndex >= fastest.points.length) {
              return []
            }
            const entryPoint = fastest.points[corner.startIndex]
            const exitPoint = fastest.points[corner.endIndex]
            const apexIndex = corner.apexIndex ?? Math.floor((corner.startIndex + corner.endIndex) / 2)
            const apexPoint = fastest.points[Math.min(apexIndex, fastest.points.length - 1)]
            return [
              { id: `entry-${corner.id}`, center: [entryPoint.lat, entryPoint.lng] as [number, number], fillColor: '#2563eb', radius: 5, strokeColor: '#ffffff', strokeWeight: 1.5 },
              { id: `apex-${corner.id}`, center: [apexPoint.lat, apexPoint.lng] as [number, number], fillColor: '#dc2626', radius: 6, strokeColor: '#ffffff', strokeWeight: 1.5 },
              { id: `exit-${corner.id}`, center: [exitPoint.lat, exitPoint.lng] as [number, number], fillColor: '#0891b2', radius: 5, strokeColor: '#ffffff', strokeWeight: 1.5 },
            ]
          }),
          ...(hoverPositions ?? []).map((hoverPosition, index) => ({
            id: `hover-${index}`,
            center: [hoverPosition.lat, hoverPosition.lng] as [number, number],
            fillColor: hoverPosition.color,
            radius: 8,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          })),
        ]}
        className="h-full w-full"
        fitPoints={fitPoints}
        fitViewMaxZoom={SATELLITE_FIT_VIEW_MAX_ZOOM}
        fitViewPaddingRatio={SATELLITE_FIT_VIEW_PADDING_RATIO}
        htmlMarkers={[
          ...cornerMarkers.map((cornerMarker) => ({
            id: `corner-label-${cornerMarker.corner.id}`,
            html: createCornerLabelHtml(cornerMarker.corner.name, !!onDeleteCorner),
            includeInFit: false,
            draggable: true,
            offset: [0, 0] as [number, number],
            onClick: onDeleteCorner && !isAddingCorner ? () => onDeleteCorner(cornerMarker.corner.id) : undefined,
            onDragEnd: (lat: number, lng: number) => handleLabelDragEnd(cornerMarker.corner.id, lat, lng),
            position: [cornerMarker.labelLat, cornerMarker.labelLng] as [number, number],
          })),
          ...(brakePoints ?? []).map((brakePoint, index) => ({
            id: `brake-${index}`,
            html: createBrakePointHtml(),
            offset: [0, 0] as [number, number],
            position: [brakePoint.lat, brakePoint.lng] as [number, number],
          })),
          ...(throttlePoints ?? []).map((throttlePoint, index) => ({
            id: `throttle-${index}`,
            html: createThrottlePointHtml(),
            offset: [0, 0] as [number, number],
            position: [throttlePoint.lat, throttlePoint.lng] as [number, number],
          })),
        ]}
        onMapClick={isAddingCorner && onAddCorner ? onAddCorner : undefined}
        satelliteCalibration={satelliteCalibration}
        polylines={[
          ...(startFinishLine ? [{
            color: '#facc15',
            dashArray: '6,4',
            id: 'start-finish',
            opacity: 0.8,
            positions: [
              [startFinishLine.lat1, startFinishLine.lng1],
              [startFinishLine.lat2, startFinishLine.lng2],
            ] as [number, number][],
            weight: 3,
          }] : []),
          ...(selectedLaps.length === 1
            ? speedSegments.map((segment, index) => ({
                color: segment.color,
                id: `speed-segment-${index}`,
                opacity: 0.9,
                positions: segment.positions,
                weight: 4,
              }))
            : selectedLaps.map((lap) => ({
                color: getLapColor(lap.id, selectedLapIds, fastestLapId),
                id: `lap-${lap.id}`,
                opacity: 0.8,
                positions: lap.points.map((point) => [point.lat, point.lng] as [number, number]),
                weight: 3,
              }))),
          ...cornerMarkers.map((cornerMarker) => ({
            color: '#7c3aed',
            dashArray: '3,3',
            id: `connector-${cornerMarker.corner.id}`,
            includeInFit: false,
            opacity: 0.4,
            positions: [
              [cornerMarker.trackLat, cornerMarker.trackLng],
              [cornerMarker.labelLat, cornerMarker.labelLng],
            ] as [number, number][],
            weight: 1,
          })),
        ]}
      />
    )
    : (
      <MapContainer
        center={defaultCenter}
        zoom={16}
        className="h-full w-full"
        zoomControl={false}
        style={{ cursor: isAddingCorner ? 'crosshair' : undefined }}
      >
        {tileLayerProps && <TileLayer {...tileLayerProps} />}
        <FitBounds
          bounds={bounds}
          padding={DEFAULT_FIT_BOUNDS_PADDING}
          paddingRatio={DEFAULT_FIT_BOUNDS_PADDING_RATIO}
        />

        {referenceLap && <TrackAlignmentLayer mode={mapMode} points={referenceLap.points} />}

        {/* Click handler for adding corners */}
        {isAddingCorner && onAddCorner && <ClickHandler onAddCorner={onAddCorner} />}

        {/* Start/Finish line */}
        {startFinishLine && (
          <Polyline
            positions={[
              [startFinishLine.lat1, startFinishLine.lng1],
              [startFinishLine.lat2, startFinishLine.lng2],
            ]}
            color="#facc15"
            weight={3}
            opacity={0.8}
            dashArray="6,4"
          />
        )}

        {/* Speed-colored track for single selection */}
        {selectedLaps.length === 1 &&
          speedSegments.map((seg, i) => (
            <Polyline key={i} positions={seg.positions} color={seg.color} weight={4} opacity={0.9} />
          ))}

        {/* Multiple lap overlay */}
        {selectedLaps.length > 1 &&
          selectedLaps.map((lap) => {
            const positions = lap.points.map((p) => [p.lat, p.lng] as [number, number])
            const color = getLapColor(lap.id, selectedLapIds, fastestLapId)
            return <Polyline key={lap.id} positions={positions} color={color} weight={3} opacity={0.8} />
          })}

        {/* Corner geometry markers: entry, apex, exit */}
        {corners.map((c) => {
          const fastest = laps.find((l) => l.id === fastestLapId)
          if (!fastest || c.startIndex >= fastest.points.length || c.endIndex >= fastest.points.length) return null
          const entryPt = fastest.points[c.startIndex]
          const exitPt = fastest.points[c.endIndex]
          const apexIdx = c.apexIndex ?? Math.floor((c.startIndex + c.endIndex) / 2)
          const apexPt = fastest.points[Math.min(apexIdx, fastest.points.length - 1)]
          return (
            <span key={`geo-${c.id}`}>
              {/* Entry point - blue */}
              <CircleMarker
                center={[entryPt.lat, entryPt.lng]}
                radius={5}
                pathOptions={{ color: '#ffffff', fillColor: '#2563eb', fillOpacity: 1, weight: 1.5 }}
              />
              {/* Apex point - red */}
              <CircleMarker
                center={[apexPt.lat, apexPt.lng]}
                radius={6}
                pathOptions={{ color: '#ffffff', fillColor: '#dc2626', fillOpacity: 1, weight: 1.5 }}
              />
              {/* Exit point - cyan */}
              <CircleMarker
                center={[exitPt.lat, exitPt.lng]}
                radius={5}
                pathOptions={{ color: '#ffffff', fillColor: '#0891b2', fillOpacity: 1, weight: 1.5 }}
              />
            </span>
          )
        })}

        {/* Corner markers with offset labels and connector lines */}
        {cornerMarkers.map((cm) => (
          <span key={cm.corner.id}>
            <Polyline
              positions={[[cm.trackLat, cm.trackLng], [cm.labelLat, cm.labelLng]]}
              color="#7c3aed"
              weight={1}
              opacity={0.4}
              dashArray="3,3"
            />
            <Marker
              position={[cm.labelLat, cm.labelLng]}
              icon={createCornerIcon(cm.corner.name, !!onDeleteCorner)}
              draggable={true}
              eventHandlers={{
                dragend: (e) => {
                  const pos = e.target.getLatLng()
                  handleLabelDragEnd(cm.corner.id, pos.lat, pos.lng)
                },
                ...(onDeleteCorner && !isAddingCorner ? {
                  click: (e: L.LeafletMouseEvent) => {
                    L.DomEvent.stopPropagation(e.originalEvent)
                    onDeleteCorner(cm.corner.id)
                  },
                } : {}),
              }}
            />
          </span>
        ))}

        {/* Map legend */}
        {corners.length > 0 && (
          <div className="leaflet-bottom leaflet-left" style={{ pointerEvents: 'none' }}>
            <div className="leaflet-control" style={{ pointerEvents: 'auto', background: 'rgba(17,24,39,0.85)', borderRadius: 8, padding: '8px 12px', margin: 10, fontSize: 11, color: '#d1d5db', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#2563eb', border: '1.5px solid #fff' }}></span>
                <span>入弯点</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#dc2626', border: '1.5px solid #fff' }}></span>
                <span>弯心 (Apex)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: (brakePoints?.length || throttlePoints?.length) ? 4 : 0 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#0891b2', border: '1.5px solid #fff' }}></span>
                <span>出弯点</span>
              </div>
              {(brakePoints?.length || throttlePoints?.length) ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', border: '1.5px solid #fff' }}></span>
                    <span>刹车点</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '9px solid #22c55e' }}></span>
                    <span>油门点</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Brake point markers — red squares */}
        {brakePoints && brakePoints.map((bp, i) => (
          <Marker
            key={`brake-${i}`}
            position={[bp.lat, bp.lng]}
            icon={L.divIcon({
              className: '',
              html: createBrakePointHtml(),
              iconSize: [10, 10],
              iconAnchor: [5, 5],
            })}
          />
        ))}

        {/* Throttle point markers — green triangles */}
        {throttlePoints && throttlePoints.map((tp, i) => (
          <Marker
            key={`throttle-${i}`}
            position={[tp.lat, tp.lng]}
            icon={L.divIcon({
              className: '',
              html: createThrottlePointHtml(),
              iconSize: [12, 10],
              iconAnchor: [6, 5],
            })}
          />
        ))}

        {/* Hover position markers — one per selected lap */}
        {hoverPositions && hoverPositions.map((hp, i) => (
          <CircleMarker
            key={`hover-${i}`}
            center={[hp.lat, hp.lng]}
            radius={8}
            pathOptions={{ color: '#ffffff', fillColor: hp.color, fillOpacity: 1, weight: 2 }}
          />
        ))}
      </MapContainer>
    )

  return (
    <div className="relative h-full w-full">
      {mapContent}
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
        <div className="pointer-events-auto">
          <MapModeSwitcher onChange={setMapMode} value={mapMode} />
        </div>
        {mapProvider.kind === 'amap-jsapi' && mapMode === 'satellite' && (
          <div className="pointer-events-auto">
            <SatelliteCalibrationControl
              calibration={satelliteCalibration}
              onAdjust={adjustSatelliteCalibration}
              onReset={resetSatelliteCalibration}
            />
          </div>
        )}
      </div>
    </div>
  )
}
