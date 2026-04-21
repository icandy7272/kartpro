import { describe, expect, it } from 'vitest'
import {
  AMAP_SATELLITE_OVERLAY_OFFSET_METERS,
  applyAmapSatelliteDisplayCalibration,
  convertPointArrayToGcj02,
  gcj02ToWgs84,
  isInsideChina,
  removeAmapSatelliteDisplayCalibration,
  wgs84ToGcj02,
} from '../coord-transform'
import { resolveMapModeProvider } from '../map-tile-config'

describe('coord-transform', () => {
  it('converts wgs84 points inside China for AMap-backed rendering', () => {
    const point = { lat: 31.2304, lng: 121.4737 }

    expect(isInsideChina(point)).toBe(true)

    const converted = wgs84ToGcj02(point)

    expect(converted.lat).not.toBe(point.lat)
    expect(converted.lng).not.toBe(point.lng)
  })

  it('keeps points outside China unchanged', () => {
    const point = { lat: 35.6764, lng: 139.65 }

    expect(isInsideChina(point)).toBe(false)
    expect(wgs84ToGcj02(point)).toEqual(point)
  })

  it('converts a point array without changing its length or order', () => {
    const points = [
      { lat: 31.2304, lng: 121.4737 },
      { lat: 31.2305, lng: 121.4738 },
    ]

    const converted = convertPointArrayToGcj02(points)

    expect(converted).toHaveLength(2)
    expect(converted[0].lat).not.toBe(points[0].lat)
    expect(converted[1].lng).not.toBe(points[1].lng)
  })

  it('approximately converts GCJ-02 points back to WGS84 for write-back interactions', () => {
    const original = { lat: 40.05731178333333, lng: 116.45516608333334 }
    const gcj = wgs84ToGcj02(original)
    const roundTrip = gcj02ToWgs84(gcj)

    expect(roundTrip.lat).toBeCloseTo(original.lat, 5)
    expect(roundTrip.lng).toBeCloseTo(original.lng, 5)
  })

  it('applies a small southward satellite display calibration that can be reversed for write-back', () => {
    const original = { lat: 40.05731178333333, lng: 116.45516608333334 }

    expect(AMAP_SATELLITE_OVERLAY_OFFSET_METERS.northMeters).toBeLessThan(0)

    const calibrated = applyAmapSatelliteDisplayCalibration(original)
    const restored = removeAmapSatelliteDisplayCalibration(calibrated)

    expect(calibrated.lat).toBeLessThan(original.lat)
    expect(restored.lat).toBeCloseTo(original.lat, 6)
    expect(restored.lng).toBeCloseTo(original.lng, 6)
  })
})

describe('resolveMapModeProvider', () => {
  it('uses AMap for satellite mode when a JSAPI key is available', () => {
    expect(resolveMapModeProvider('satellite', { amapJsApiKey: 'test-key' })).toMatchObject({
      kind: 'amap-jsapi',
      key: 'test-key',
    })
  })

  it('falls back to leaflet raster tiles when AMap is not configured', () => {
    expect(resolveMapModeProvider('satellite')).toMatchObject({
      kind: 'leaflet-raster',
    })
  })
})
