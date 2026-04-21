import { useCallback, useState } from 'react'
import {
  DEFAULT_AMAP_SATELLITE_CALIBRATION,
  getStoredAmapSatelliteCalibration,
  nudgeAmapSatelliteCalibration,
  saveAmapSatelliteCalibration,
  type SatelliteCalibrationDirection,
} from '../../lib/map/satellite-calibration'

export function useAmapSatelliteCalibration() {
  const [satelliteCalibration, setSatelliteCalibration] = useState(() => getStoredAmapSatelliteCalibration())

  const adjustSatelliteCalibration = useCallback((direction: SatelliteCalibrationDirection) => {
    setSatelliteCalibration((previous) => {
      const next = nudgeAmapSatelliteCalibration(previous, direction)
      saveAmapSatelliteCalibration(next)
      return next
    })
  }, [])

  const resetSatelliteCalibration = useCallback(() => {
    saveAmapSatelliteCalibration(DEFAULT_AMAP_SATELLITE_CALIBRATION)
    setSatelliteCalibration(DEFAULT_AMAP_SATELLITE_CALIBRATION)
  }, [])

  return {
    adjustSatelliteCalibration,
    resetSatelliteCalibration,
    satelliteCalibration,
  }
}
