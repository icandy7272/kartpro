import { useState, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GPSPoint } from '../types'

interface StartFinishPickerProps {
  points: GPSPoint[]
  autoDetected: { lat1: number; lng1: number; lat2: number; lng2: number } | null
  onConfirm: (line: { lat1: number; lng1: number; lat2: number; lng2: number }) => void
}

function createMarkerIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function StartFinishPicker({ points, autoDetected, onConfirm }: StartFinishPickerProps) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [manualPoints, setManualPoints] = useState<Array<{ lat: number; lng: number }>>([])

  const bounds = useMemo(() => {
    if (points.length === 0) return undefined
    const lats = points.map((p) => p.lat)
    const lngs = points.map((p) => p.lng)
    return L.latLngBounds(
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    )
  }, [points])

  const trackPositions = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points])

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (mode !== 'manual') return
      setManualPoints((prev) => {
        if (prev.length >= 2) return [{ lat, lng }]
        return [...prev, { lat, lng }]
      })
    },
    [mode]
  )

  const handleConfirmAuto = useCallback(() => {
    if (autoDetected) {
      onConfirm(autoDetected)
    }
  }, [autoDetected, onConfirm])

  const handleConfirmManual = useCallback(() => {
    if (manualPoints.length === 2) {
      onConfirm({
        lat1: manualPoints[0].lat,
        lng1: manualPoints[0].lng,
        lat2: manualPoints[1].lat,
        lng2: manualPoints[1].lng,
      })
    }
  }, [manualPoints, onConfirm])

  const sfLinePositions = useMemo(() => {
    if (mode === 'auto' && autoDetected) {
      return [
        [autoDetected.lat1, autoDetected.lng1] as [number, number],
        [autoDetected.lat2, autoDetected.lng2] as [number, number],
      ]
    }
    if (mode === 'manual' && manualPoints.length === 2) {
      return manualPoints.map((p) => [p.lat, p.lng] as [number, number])
    }
    return null
  }, [mode, autoDetected, manualPoints])

  if (points.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">没有可用的 GPS 数据。</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <h2 className="text-xl font-bold text-gray-100 mb-2">设置起终点线</h2>
        <p className="text-gray-400 text-sm mb-4">
          在赛道上标记起终点线的位置，用于检测圈数。
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => setMode('auto')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'auto'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            自动检测
          </button>
          <button
            onClick={() => {
              setMode('manual')
              setManualPoints([])
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'manual'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            手动标记
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        <MapContainer
          bounds={bounds}
          className="h-full w-full"
          style={{ minHeight: 'calc(100vh - 200px)' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          <Polyline positions={trackPositions} color="#7c3aed" weight={3} opacity={0.8} />

          {sfLinePositions && (
            <Polyline positions={sfLinePositions} color="#f59e0b" weight={4} opacity={1} />
          )}

          {mode === 'manual' &&
            manualPoints.map((p, i) => (
              <Marker
                key={i}
                position={[p.lat, p.lng]}
                icon={createMarkerIcon(i === 0 ? '#22c55e' : '#ef4444')}
              />
            ))}

          {mode === 'auto' && autoDetected && (
            <>
              <Marker
                position={[autoDetected.lat1, autoDetected.lng1]}
                icon={createMarkerIcon('#22c55e')}
              />
              <Marker
                position={[autoDetected.lat2, autoDetected.lng2]}
                icon={createMarkerIcon('#ef4444')}
              />
            </>
          )}

          {mode === 'manual' && <ClickHandler onMapClick={handleMapClick} />}
        </MapContainer>

        {mode === 'manual' && manualPoints.length < 2 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/90 border border-gray-700 rounded-lg px-4 py-2">
            <p className="text-gray-300 text-sm">
              点击地图放置第 {manualPoints.length + 1} 个点（共 2 个）
            </p>
          </div>
        )}
      </div>

      <div className="bg-gray-900 border-t border-gray-800 px-6 py-4 flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {mode === 'auto' && !autoDetected && '未能自动检测起终点线，请尝试手动标记。'}
          {mode === 'auto' && autoDetected && '自动检测的起终点线以黄色显示。'}
          {mode === 'manual' && manualPoints.length < 2 && `还需在地图上放置 ${2 - manualPoints.length} 个点。`}
          {mode === 'manual' && manualPoints.length === 2 && '起终点线已定义，点击确认继续。'}
        </div>

        <button
          onClick={mode === 'auto' ? handleConfirmAuto : handleConfirmManual}
          disabled={
            (mode === 'auto' && !autoDetected) || (mode === 'manual' && manualPoints.length < 2)
          }
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          确认起终点线
        </button>
      </div>
    </div>
  )
}
