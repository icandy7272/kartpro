import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyAmapSatelliteDisplayCalibration, wgs84ToGcj02 } from '../../../lib/map/coord-transform'
import AmapSatelliteMap from '../AmapSatelliteMap'

const mapInstance = {
  add: vi.fn(),
  clearMap: vi.fn(),
  destroy: vi.fn(),
  off: vi.fn(),
  on: vi.fn(),
  setCenter: vi.fn(),
  setFitView: vi.fn(),
}

const polylineConstructor = vi.fn(function Polyline(options: Record<string, unknown>) {
  return options
})
const markerOn = vi.fn()
const markerConstructor = vi.fn(function Marker(options: Record<string, unknown>) {
  return {
    on: markerOn,
    options,
  }
})
const satelliteLayerConstructor = vi.fn(function Satellite() {
  return {}
})
const mapConstructor = vi.fn(function Map() {
  return mapInstance
})

let resolveLoader: ((value: unknown) => void) | null = null
let loadedNamespace: unknown = null

vi.mock('../../../lib/map/amap-loader', () => ({
  loadAmapJsApi: vi.fn(
    () => {
      if (loadedNamespace) {
        return Promise.resolve(loadedNamespace)
      }

      return new Promise((resolve) => {
        resolveLoader = (value) => {
          loadedNamespace = value
          resolve(value)
        }
      })
    }
  ),
}))

describe('AmapSatelliteMap', () => {
  beforeEach(() => {
    loadedNamespace = null
    resolveLoader = null
    vi.clearAllMocks()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
      ({
        bottom: 800,
        height: 800,
        left: 0,
        right: 1000,
        top: 0,
        width: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    )
  })

  it('fits to overlay geometry after the async AMap instance finishes loading', async () => {
    render(
      <AmapSatelliteMap
        amapKey="test-key"
        className="h-full w-full"
        fitPoints={[
          { lat: 24.056, lng: 116.455 },
          { lat: 24.057, lng: 116.456 },
        ]}
        polylines={[
          {
            color: '#22c55e',
            id: 'track-line',
            positions: [
              [24.056, 116.455],
              [24.057, 116.456],
            ],
            weight: 4,
          },
        ]}
      />
    )

    expect(mapConstructor).not.toHaveBeenCalled()
    expect(mapInstance.setFitView).not.toHaveBeenCalled()

    await act(async () => {
      loadedNamespace = {
        CircleMarker: vi.fn(),
        Map: mapConstructor,
        Marker: markerConstructor,
        Pixel: vi.fn(),
        Polyline: polylineConstructor,
        Text: vi.fn(),
        TileLayer: {
          Satellite: satelliteLayerConstructor,
        },
      }
      resolveLoader?.(loadedNamespace)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mapConstructor).toHaveBeenCalledTimes(1)
      expect(polylineConstructor).toHaveBeenCalledTimes(1)
      expect(mapInstance.add).toHaveBeenCalledTimes(1)
      expect(mapInstance.setFitView).toHaveBeenCalledTimes(1)
    })
  })

  it('supports ratio-based fit padding so the track can shrink by a predictable amount inside the current viewport', async () => {
    render(
      <AmapSatelliteMap
        amapKey="test-key"
        className="h-full w-full"
        fitPoints={[
          { lat: 24.056, lng: 116.455 },
          { lat: 24.057, lng: 116.456 },
        ]}
        fitViewMaxZoom={20}
        fitViewPaddingRatio={0.075}
        polylines={[
          {
            color: '#22c55e',
            id: 'track-line',
            positions: [
              [24.056, 116.455],
              [24.057, 116.456],
            ],
            weight: 4,
          },
        ]}
      />
    )

    await act(async () => {
      loadedNamespace = {
        CircleMarker: vi.fn(),
        Map: mapConstructor,
        Marker: markerConstructor,
        Pixel: vi.fn(),
        Polyline: polylineConstructor,
        Text: vi.fn(),
        TileLayer: {
          Satellite: satelliteLayerConstructor,
        },
      }
      resolveLoader?.(loadedNamespace)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mapInstance.setFitView).toHaveBeenCalledWith(expect.any(Array), false, [60, 75, 60, 75], 20)
    })
  })

  it('ignores overlays marked out of fit calculations so offset labels do not zoom the track out', async () => {
    render(
      <AmapSatelliteMap
        amapKey="test-key"
        className="h-full w-full"
        fitPoints={[
          { lat: 24.056, lng: 116.455 },
          { lat: 24.057, lng: 116.456 },
        ]}
        fitViewPadding={[4, 4, 4, 4]}
        htmlMarkers={[
          {
            html: '<div>T1</div>',
            id: 'corner-label',
            includeInFit: false,
            position: [24.1, 116.5],
          },
        ]}
        polylines={[
          {
            color: '#22c55e',
            id: 'track-line',
            positions: [
              [24.056, 116.455],
              [24.057, 116.456],
            ],
            weight: 4,
          },
        ]}
      />
    )

    await act(async () => {
      loadedNamespace = {
        CircleMarker: vi.fn(),
        Map: mapConstructor,
        Marker: markerConstructor,
        Pixel: vi.fn(),
        Polyline: polylineConstructor,
        Text: vi.fn(),
        TileLayer: {
          Satellite: satelliteLayerConstructor,
        },
      }
      resolveLoader?.(loadedNamespace)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mapInstance.setFitView).toHaveBeenCalledTimes(1)
    })

    const fitOverlays = mapInstance.setFitView.mock.calls[0]?.[0]
    expect(fitOverlays).toHaveLength(1)
    expect(fitOverlays[0]).toMatchObject({ strokeColor: '#22c55e' })
  })

  it('keeps the current viewport when only the satellite calibration changes', async () => {
    const props = {
      amapKey: 'test-key',
      className: 'h-full w-full',
      fitPoints: [
        { lat: 24.056, lng: 116.455 },
        { lat: 24.057, lng: 116.456 },
      ],
      polylines: [
        {
          color: '#22c55e',
          id: 'track-line',
          positions: [
            [24.056, 116.455] as [number, number],
            [24.057, 116.456] as [number, number],
          ],
          weight: 4,
        },
      ],
    }

    const { rerender } = render(
      <AmapSatelliteMap
        {...props}
        satelliteCalibration={{ eastMeters: 0, northMeters: -3 }}
      />
    )

    await act(async () => {
      loadedNamespace = {
        CircleMarker: vi.fn(),
        Map: mapConstructor,
        Marker: markerConstructor,
        Pixel: vi.fn(),
        Polyline: polylineConstructor,
        Text: vi.fn(),
        TileLayer: {
          Satellite: satelliteLayerConstructor,
        },
      }
      resolveLoader?.(loadedNamespace)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mapInstance.setFitView).toHaveBeenCalledTimes(1)
    })

    rerender(
      <AmapSatelliteMap
        {...props}
        satelliteCalibration={{ eastMeters: 1, northMeters: -3 }}
      />
    )

    await waitFor(() => {
      expect(mapInstance.add).toHaveBeenCalledTimes(2)
    })

    expect(mapInstance.setFitView).toHaveBeenCalledTimes(1)
  })

  it('converts AMap click coordinates back to WGS84 before notifying the app layer', async () => {
    const handleMapClick = vi.fn()
    const originalPoint = { lat: 40.05731178333333, lng: 116.45516608333334 }
    const displayedPoint = wgs84ToGcj02(applyAmapSatelliteDisplayCalibration(originalPoint))

    render(
      <AmapSatelliteMap
        amapKey="test-key"
        className="h-full w-full"
        fitPoints={[
          originalPoint,
        ]}
        onMapClick={handleMapClick}
      />
    )

    await act(async () => {
      loadedNamespace = {
        CircleMarker: vi.fn(),
        Map: mapConstructor,
        Marker: markerConstructor,
        Pixel: vi.fn(),
        Polyline: polylineConstructor,
        Text: vi.fn(),
        TileLayer: {
          Satellite: satelliteLayerConstructor,
        },
      }
      resolveLoader?.(loadedNamespace)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mapInstance.on).toHaveBeenCalled()
    })

    const clickHandler = mapInstance.on.mock.calls.find(([eventName]) => eventName === 'click')?.[1]
    expect(clickHandler).toBeTypeOf('function')

    act(() => {
      clickHandler({
        lnglat: {
          getLat: () => displayedPoint.lat,
          getLng: () => displayedPoint.lng,
        },
      })
    })

    expect(handleMapClick).toHaveBeenCalledWith(
      expect.closeTo(originalPoint.lat, 5),
      expect.closeTo(originalPoint.lng, 5)
    )
  })

  it('converts draggable marker coordinates back to WGS84 on drag end', async () => {
    const handleDragEnd = vi.fn()
    const originalPoint = { lat: 40.05731178333333, lng: 116.45516608333334 }
    const displayedPoint = wgs84ToGcj02(applyAmapSatelliteDisplayCalibration(originalPoint))

    render(
      <AmapSatelliteMap
        amapKey="test-key"
        className="h-full w-full"
        fitPoints={[originalPoint]}
        htmlMarkers={[
          {
            draggable: true,
            html: '<div>T1</div>',
            id: 'corner-label',
            onDragEnd: handleDragEnd,
            position: [originalPoint.lat, originalPoint.lng],
          },
        ]}
      />
    )

    await act(async () => {
      loadedNamespace = {
        CircleMarker: vi.fn(),
        Map: mapConstructor,
        Marker: markerConstructor,
        Pixel: vi.fn(),
        Polyline: polylineConstructor,
        Text: vi.fn(),
        TileLayer: {
          Satellite: satelliteLayerConstructor,
        },
      }
      resolveLoader?.(loadedNamespace)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(markerConstructor).toHaveBeenCalled()
      expect(markerOn).toHaveBeenCalledWith('dragend', expect.any(Function))
    })

    expect(markerConstructor.mock.calls[0][0]).toMatchObject({ draggable: true })
    const dragEndHandler = markerOn.mock.calls.find(([eventName]) => eventName === 'dragend')?.[1]
    expect(dragEndHandler).toBeTypeOf('function')

    act(() => {
      dragEndHandler({
        lnglat: {
          getLat: () => displayedPoint.lat,
          getLng: () => displayedPoint.lng,
        },
      })
    })

    expect(handleDragEnd).toHaveBeenCalledWith(
      expect.closeTo(originalPoint.lat, 5),
      expect.closeTo(originalPoint.lng, 5)
    )
  })
})
