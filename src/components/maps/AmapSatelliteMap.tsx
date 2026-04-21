import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  applyAmapSatelliteDisplayCalibration,
  AMAP_SATELLITE_OVERLAY_OFFSET_METERS,
  convertPointArrayToGcj02,
  gcj02ToWgs84,
  removeAmapSatelliteDisplayCalibration,
} from '../../lib/map/coord-transform'
import { loadAmapJsApi, type AMapMapInstance, type AMapMouseEventLike, type AMapNamespace } from '../../lib/map/amap-loader'
import type { SatelliteCalibrationMeters } from '../../lib/map/satellite-calibration'

type LatLngTuple = [number, number]
const AMAP_CONVERT_BATCH_SIZE = 40
type FitViewPadding = [number, number, number, number]

interface PolylineOverlay {
  color: string
  dashArray?: string
  id: string
  includeInFit?: boolean
  opacity?: number
  positions: LatLngTuple[]
  weight: number
}

interface CircleOverlay {
  center: LatLngTuple
  fillColor: string
  fillOpacity?: number
  id: string
  includeInFit?: boolean
  radius: number
  strokeColor?: string
  strokeOpacity?: number
  strokeWeight?: number
}

interface HtmlMarkerOverlay {
  draggable?: boolean
  html: string
  id: string
  includeInFit?: boolean
  offset?: [number, number]
  onClick?: () => void
  onDragEnd?: (lat: number, lng: number) => void
  position: LatLngTuple
}

interface AmapSatelliteMapProps {
  amapKey: string
  circleOverlays?: CircleOverlay[]
  className?: string
  fitPoints?: Array<{ lat: number; lng: number }>
  fitViewMaxZoom?: number
  fitViewPadding?: FitViewPadding
  fitViewPaddingRatio?: number
  htmlMarkers?: HtmlMarkerOverlay[]
  onMapClick?: (lat: number, lng: number) => void
  polylines?: PolylineOverlay[]
  satelliteCalibration?: SatelliteCalibrationMeters
  style?: CSSProperties
}

function toGcjTuple(
  position: LatLngTuple,
  calibration: SatelliteCalibrationMeters = AMAP_SATELLITE_OVERLAY_OFFSET_METERS
): [number, number] {
  const calibrated = applyAmapSatelliteDisplayCalibration({ lat: position[0], lng: position[1] }, calibration)
  const converted = convertPointArrayToGcj02([calibrated])[0]
  return [converted.lng, converted.lat]
}

function toWgsTuple(
  position: [number, number],
  calibration: SatelliteCalibrationMeters = AMAP_SATELLITE_OVERLAY_OFFSET_METERS
): LatLngTuple {
  const converted = gcj02ToWgs84({ lat: position[1], lng: position[0] })
  const restored = removeAmapSatelliteDisplayCalibration(converted, calibration)
  return [restored.lat, restored.lng]
}

function positionKey([lat, lng]: LatLngTuple): string {
  return `${lat.toFixed(8)},${lng.toFixed(8)}`
}

function buildViewportKey(points: Array<{ lat: number; lng: number }>): string {
  if (points.length === 0) {
    return 'empty'
  }

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  for (const point of points) {
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
  }

  return [
    points.length,
    minLat.toFixed(6),
    maxLat.toFixed(6),
    minLng.toFixed(6),
    maxLng.toFixed(6),
  ].join(':')
}

function resolveFitViewPadding(
  container: HTMLDivElement | null,
  fitViewPadding?: FitViewPadding,
  fitViewPaddingRatio?: number
): FitViewPadding | undefined {
  if (fitViewPadding) {
    return fitViewPadding
  }

  if (!container || fitViewPaddingRatio == null || fitViewPaddingRatio <= 0) {
    return undefined
  }

  const rect = container.getBoundingClientRect()
  const width = rect.width || container.clientWidth || 0
  const height = rect.height || container.clientHeight || 0

  if (width <= 0 || height <= 0) {
    return undefined
  }

  const verticalPadding = Math.round(height * fitViewPaddingRatio)
  const horizontalPadding = Math.round(width * fitViewPaddingRatio)

  return [verticalPadding, horizontalPadding, verticalPadding, horizontalPadding]
}

async function convertTuplesWithAmap(
  AMap: AMapNamespace,
  positions: LatLngTuple[],
  calibration: SatelliteCalibrationMeters = AMAP_SATELLITE_OVERLAY_OFFSET_METERS
): Promise<Map<string, [number, number]>> {
  const deduped = new Map<string, LatLngTuple>()

  for (const position of positions) {
    deduped.set(positionKey(position), position)
  }

  const fallbackConverted = new Map<string, [number, number]>()
  for (const position of deduped.values()) {
    fallbackConverted.set(positionKey(position), toGcjTuple(position, calibration))
  }

  if (!AMap.convertFrom || deduped.size === 0) {
    return fallbackConverted
  }

  try {
    const converted = new Map<string, [number, number]>()
    const ordered = Array.from(deduped.values())

    for (let index = 0; index < ordered.length; index += AMAP_CONVERT_BATCH_SIZE) {
      const batch = ordered.slice(index, index + AMAP_CONVERT_BATCH_SIZE)
      const batchResult = await new Promise<Array<[number, number]>>((resolve, reject) => {
        AMap.convertFrom?.(
          batch.map(([lat, lng]) => {
            const calibrated = applyAmapSatelliteDisplayCalibration({ lat, lng }, calibration)
            return [calibrated.lng, calibrated.lat] as [number, number]
          }),
          'gps',
          (status, result) => {
            if (status !== 'complete' || result.info !== 'ok' || !result.locations?.length) {
              reject(new Error('AMap convertFrom failed'))
              return
            }

            resolve(result.locations.map((location) => [location.getLng(), location.getLat()] as [number, number]))
          }
        )
      })

      if (batchResult.length !== batch.length) {
        throw new Error('AMap convertFrom length mismatch')
      }

      batch.forEach((position, batchIndex) => {
        converted.set(positionKey(position), batchResult[batchIndex])
      })
    }

    return converted
  } catch {
    return fallbackConverted
  }
}

export default function AmapSatelliteMap({
  amapKey,
  circleOverlays = [],
  className,
  fitPoints = [],
  fitViewMaxZoom,
  fitViewPadding,
  fitViewPaddingRatio,
  htmlMarkers = [],
  onMapClick,
  polylines = [],
  satelliteCalibration = AMAP_SATELLITE_OVERLAY_OFFSET_METERS,
  style,
}: AmapSatelliteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<AMapMapInstance | null>(null)
  const clickHandlerRef = useRef<((event: AMapMouseEventLike) => void) | null>(null)
  const lastViewportKeyRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const viewportKey = useMemo(() => buildViewportKey(fitPoints), [fitPoints])

  const convertedFitPoints = useMemo(
    () => convertPointArrayToGcj02(
      fitPoints.map((point) => applyAmapSatelliteDisplayCalibration(point, satelliteCalibration))
    ),
    [fitPoints, satelliteCalibration]
  )

  useEffect(() => {
    let cancelled = false
    setMapReady(false)
    lastViewportKeyRef.current = null

    async function setupMap() {
      if (!containerRef.current) {
        return
      }

      try {
        const AMap = await loadAmapJsApi(amapKey)
        if (cancelled || !containerRef.current) {
          return
        }

        mapRef.current = new AMap.Map(containerRef.current, {
          center: [121.4737, 31.2304],
          layers: [new AMap.TileLayer.Satellite()],
          resizeEnable: true,
          viewMode: '2D',
          zoom: 17,
          zooms: [3, 20],
        })

        setError(null)
        setMapReady(true)
      } catch (setupError) {
        if (!cancelled) {
          setError(setupError instanceof Error ? setupError.message : '高德地图加载失败')
        }
      }
    }

    void setupMap()

    return () => {
      cancelled = true
      if (mapRef.current) {
        if (clickHandlerRef.current) {
          mapRef.current.off('click', clickHandlerRef.current)
        }
        mapRef.current.destroy()
        mapRef.current = null
      }
    }
  }, [amapKey])

  useEffect(() => {
    if (!mapReady) {
      return
    }

    const map = mapRef.current
    if (!map) {
      return
    }

    let cancelled = false

    async function renderOverlays() {
      try {
        const AMap = await loadAmapJsApi(amapKey)
        if (!mapRef.current || cancelled) {
          return
        }

        const convertedPositions = await convertTuplesWithAmap(AMap, [
          ...polylines.flatMap((polyline) => polyline.positions),
          ...circleOverlays.map((circle) => circle.center),
          ...htmlMarkers.map((marker) => marker.position),
          ...fitPoints.map((point) => [point.lat, point.lng] as LatLngTuple),
        ], satelliteCalibration)

        if (!mapRef.current || cancelled) {
          return
        }

        const activeMap = mapRef.current
        const toConvertedTuple = (position: LatLngTuple): [number, number] =>
          convertedPositions.get(positionKey(position)) ?? toGcjTuple(position, satelliteCalibration)
        const shouldRefitViewport = lastViewportKeyRef.current !== viewportKey
        const effectiveFitViewPadding = resolveFitViewPadding(containerRef.current, fitViewPadding, fitViewPaddingRatio)

        activeMap.clearMap()

        const overlays: unknown[] = []
        const fitOverlays: unknown[] = []

        for (const polyline of polylines) {
          if (polyline.positions.length < 2) {
            continue
          }
          const polylineOverlay = new AMap.Polyline({
            lineCap: 'round',
            lineJoin: 'round',
            path: polyline.positions.map((position) => toConvertedTuple(position)),
            showDir: false,
            strokeColor: polyline.color,
            strokeOpacity: polyline.opacity ?? 1,
            strokeStyle: polyline.dashArray ? 'dashed' : 'solid',
            strokeWeight: polyline.weight,
          })
          overlays.push(polylineOverlay)
          if (polyline.includeInFit !== false) {
            fitOverlays.push(polylineOverlay)
          }
        }

        for (const circle of circleOverlays) {
          const circleOverlay = new AMap.CircleMarker({
            center: toConvertedTuple(circle.center),
            fillColor: circle.fillColor,
            fillOpacity: circle.fillOpacity ?? 1,
            radius: circle.radius,
            strokeColor: circle.strokeColor ?? '#ffffff',
            strokeOpacity: circle.strokeOpacity ?? 1,
            strokeWeight: circle.strokeWeight ?? 1.5,
          })
          overlays.push(circleOverlay)
          if (circle.includeInFit !== false) {
            fitOverlays.push(circleOverlay)
          }
        }

        for (const marker of htmlMarkers) {
          const overlay = new AMap.Marker({
            anchor: 'center',
            content: marker.html,
            draggable: marker.draggable ?? false,
            offset: marker.offset ? new AMap.Pixel(marker.offset[0], marker.offset[1]) : undefined,
            position: toConvertedTuple(marker.position),
          })

          if (marker.onClick) {
            ;(overlay as { on?: (name: string, handler: () => void) => void }).on?.('click', marker.onClick)
          }

          if (marker.onDragEnd) {
            ;(overlay as {
              on?: (name: string, handler: (event: AMapMouseEventLike) => void) => void
            }).on?.('dragend', (event: AMapMouseEventLike) => {
              const [lat, lng] = toWgsTuple([event.lnglat.getLng(), event.lnglat.getLat()], satelliteCalibration)
              marker.onDragEnd?.(lat, lng)
            })
          }

          overlays.push(overlay)
          if (marker.includeInFit !== false) {
            fitOverlays.push(overlay)
          }
        }

        if (overlays.length > 0) {
          activeMap.add(overlays)
          if (shouldRefitViewport) {
            activeMap.setFitView(
              fitOverlays.length > 0 ? fitOverlays : overlays,
              false,
              effectiveFitViewPadding,
              fitViewMaxZoom
            )
            lastViewportKeyRef.current = viewportKey
          }
        } else if (convertedFitPoints[0]) {
          if (shouldRefitViewport) {
            const center = convertedPositions.get(positionKey([fitPoints[0].lat, fitPoints[0].lng]))
            if (center) {
              activeMap.setCenter(center)
            } else {
              activeMap.setCenter([convertedFitPoints[0].lng, convertedFitPoints[0].lat])
            }
            lastViewportKeyRef.current = viewportKey
          }
        }

        if (clickHandlerRef.current) {
          activeMap.off('click', clickHandlerRef.current)
        }

        if (onMapClick) {
          clickHandlerRef.current = (event: AMapMouseEventLike) => {
            const [lat, lng] = toWgsTuple([event.lnglat.getLng(), event.lnglat.getLat()], satelliteCalibration)
            onMapClick(lat, lng)
          }
          activeMap.on('click', clickHandlerRef.current)
        } else {
          clickHandlerRef.current = null
        }
      } catch (overlayError) {
        if (!cancelled) {
          setError(overlayError instanceof Error ? overlayError.message : '高德地图渲染失败')
        }
      }
    }

    void renderOverlays()

    return () => {
      cancelled = true
    }
  }, [amapKey, circleOverlays, convertedFitPoints, fitPoints, fitViewMaxZoom, fitViewPadding, fitViewPaddingRatio, htmlMarkers, mapReady, onMapClick, polylines, satelliteCalibration, viewportKey])

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-900">
        <p className="max-w-sm text-center text-sm text-red-300">{error}</p>
      </div>
    )
  }

  return <div className={className} ref={containerRef} style={style} />
}
