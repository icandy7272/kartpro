export interface SatelliteCalibrationMeters {
  eastMeters: number
  northMeters: number
}

export type SatelliteCalibrationDirection = 'north' | 'south' | 'west' | 'east'

export const DEFAULT_AMAP_SATELLITE_CALIBRATION: SatelliteCalibrationMeters = {
  eastMeters: 0,
  northMeters: -3,
}

export const AMAP_SATELLITE_CALIBRATION_STEP_METERS = 1
const AMAP_SATELLITE_CALIBRATION_STORAGE_KEY = 'kartpro-amap-satellite-calibration-v1'
const AMAP_SATELLITE_CALIBRATION_MAX_METERS = 15

function clamp(value: number): number {
  return Math.max(-AMAP_SATELLITE_CALIBRATION_MAX_METERS, Math.min(AMAP_SATELLITE_CALIBRATION_MAX_METERS, value))
}

export function getStoredAmapSatelliteCalibration(): SatelliteCalibrationMeters {
  if (typeof window === 'undefined') {
    return DEFAULT_AMAP_SATELLITE_CALIBRATION
  }

  try {
    const raw = window.localStorage.getItem(AMAP_SATELLITE_CALIBRATION_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_AMAP_SATELLITE_CALIBRATION
    }

    const parsed = JSON.parse(raw) as Partial<SatelliteCalibrationMeters>
    return {
      eastMeters: clamp(parsed.eastMeters ?? DEFAULT_AMAP_SATELLITE_CALIBRATION.eastMeters),
      northMeters: clamp(parsed.northMeters ?? DEFAULT_AMAP_SATELLITE_CALIBRATION.northMeters),
    }
  } catch {
    return DEFAULT_AMAP_SATELLITE_CALIBRATION
  }
}

export function saveAmapSatelliteCalibration(calibration: SatelliteCalibrationMeters): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    AMAP_SATELLITE_CALIBRATION_STORAGE_KEY,
    JSON.stringify({
      eastMeters: clamp(calibration.eastMeters),
      northMeters: clamp(calibration.northMeters),
    })
  )
}

export function nudgeAmapSatelliteCalibration(
  calibration: SatelliteCalibrationMeters,
  direction: SatelliteCalibrationDirection
): SatelliteCalibrationMeters {
  switch (direction) {
    case 'north':
      return { ...calibration, northMeters: clamp(calibration.northMeters + AMAP_SATELLITE_CALIBRATION_STEP_METERS) }
    case 'south':
      return { ...calibration, northMeters: clamp(calibration.northMeters - AMAP_SATELLITE_CALIBRATION_STEP_METERS) }
    case 'west':
      return { ...calibration, eastMeters: clamp(calibration.eastMeters - AMAP_SATELLITE_CALIBRATION_STEP_METERS) }
    case 'east':
      return { ...calibration, eastMeters: clamp(calibration.eastMeters + AMAP_SATELLITE_CALIBRATION_STEP_METERS) }
  }
}
