import { DEFAULT_AMAP_SATELLITE_CALIBRATION, type SatelliteCalibrationMeters } from './satellite-calibration'

interface LatLngLike {
  lat: number
  lng: number
}

const PI = Math.PI
const A = 6378245.0
const EE = 6.693421622965943e-3
const METERS_PER_DEGREE_LAT = 111320

export { DEFAULT_AMAP_SATELLITE_CALIBRATION as AMAP_SATELLITE_OVERLAY_OFFSET_METERS }

function transformLat(x: number, y: number): number {
  let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  ret += ((20 * Math.sin(y * PI) + 40 * Math.sin((y / 3) * PI)) * 2) / 3
  ret += ((160 * Math.sin((y / 12) * PI) + 320 * Math.sin((y * PI) / 30)) * 2) / 3
  return ret
}

function transformLng(x: number, y: number): number {
  let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2) / 3
  ret += ((20 * Math.sin(x * PI) + 40 * Math.sin((x / 3) * PI)) * 2) / 3
  ret += ((150 * Math.sin((x / 12) * PI) + 300 * Math.sin((x / 30) * PI)) * 2) / 3
  return ret
}

export function isInsideChina(point: LatLngLike): boolean {
  return point.lng >= 72.004 && point.lng <= 137.8347 && point.lat >= 0.8293 && point.lat <= 55.8271
}

export function wgs84ToGcj02<T extends LatLngLike>(point: T): T {
  if (!isInsideChina(point)) {
    return { ...point }
  }

  const dLat = transformLat(point.lng - 105.0, point.lat - 35.0)
  const dLng = transformLng(point.lng - 105.0, point.lat - 35.0)
  const radLat = (point.lat / 180.0) * PI
  const magic = Math.sin(radLat)
  const magicSquared = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magicSquared)

  const adjustedLat =
    point.lat +
    (dLat * 180.0) /
      (((A * (1 - EE)) / (magicSquared * sqrtMagic)) * PI)
  const adjustedLng =
    point.lng +
    (dLng * 180.0) /
      ((A / sqrtMagic) * Math.cos(radLat) * PI)

  return {
    ...point,
    lat: adjustedLat,
    lng: adjustedLng,
  }
}

export function gcj02ToWgs84<T extends LatLngLike>(point: T): T {
  if (!isInsideChina(point)) {
    return { ...point }
  }

  let correctedLat = point.lat
  let correctedLng = point.lng

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const converted = wgs84ToGcj02({
      ...point,
      lat: correctedLat,
      lng: correctedLng,
    })

    correctedLat -= converted.lat - point.lat
    correctedLng -= converted.lng - point.lng
  }

  return {
    ...point,
    lat: correctedLat,
    lng: correctedLng,
  }
}

function applyMeterOffset<T extends LatLngLike>(
  point: T,
  offset: SatelliteCalibrationMeters
): T {
  const latOffset = offset.northMeters / METERS_PER_DEGREE_LAT
  const lngMetersPerDegree = METERS_PER_DEGREE_LAT * Math.cos((point.lat * PI) / 180)
  const lngOffset = lngMetersPerDegree === 0 ? 0 : offset.eastMeters / lngMetersPerDegree

  return {
    ...point,
    lat: point.lat + latOffset,
    lng: point.lng + lngOffset,
  }
}

export function applyAmapSatelliteDisplayCalibration<T extends LatLngLike>(
  point: T,
  calibration: SatelliteCalibrationMeters = DEFAULT_AMAP_SATELLITE_CALIBRATION
): T {
  return applyMeterOffset(point, calibration)
}

export function removeAmapSatelliteDisplayCalibration<T extends LatLngLike>(
  point: T,
  calibration: SatelliteCalibrationMeters = DEFAULT_AMAP_SATELLITE_CALIBRATION
): T {
  return applyMeterOffset(point, {
    northMeters: -calibration.northMeters,
    eastMeters: -calibration.eastMeters,
  })
}

export function convertPointArrayToGcj02<T extends LatLngLike>(points: T[]): T[] {
  return points.map((point) => wgs84ToGcj02(point))
}
