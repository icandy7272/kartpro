import { describe, expect, it } from 'vitest'
import { detectLaps } from '../lap-detection'
import type { GPSPoint } from '../../../types'

function createSmallLoopPoints(lapCount: number, lapDurationMs: number, lapCircumferenceMeters: number): GPSPoint[] {
  const centerLat = 40
  const centerLng = 116.4585
  const pointsPerLap = 120
  const radiusMeters = lapCircumferenceMeters / (2 * Math.PI)
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos((centerLat * Math.PI) / 180)
  const radiusLat = radiusMeters / metersPerDegLat
  const radiusLng = radiusMeters / metersPerDegLng
  const totalPoints = lapCount * pointsPerLap
  const dt = lapDurationMs / pointsPerLap

  const points: GPSPoint[] = []

  for (let i = 0; i < totalPoints; i++) {
    const theta = Math.PI + (i / pointsPerLap) * 2 * Math.PI
    points.push({
      lat: centerLat + radiusLat * Math.sin(theta),
      lng: centerLng + radiusLng * Math.cos(theta),
      speed: lapCircumferenceMeters / (lapDurationMs / 1000),
      time: Math.round(i * dt),
      altitude: 0,
    })
  }

  return points
}

describe('detectLaps', () => {
  it('keeps valid short-loop laps when every detected lap is below the kart-track distance heuristic', () => {
    const points = createSmallLoopPoints(5, 20000, 60)
    const metersPerDegLng = 111320 * Math.cos((40 * Math.PI) / 180)
    const radialHalfWidthLng = 6 / metersPerDegLng
    const radiusLng = (60 / (2 * Math.PI)) / metersPerDegLng
    const startFinish = {
      lat1: 40,
      lng1: 116.4585 + radiusLng - radialHalfWidthLng,
      lat2: 40,
      lng2: 116.4585 + radiusLng + radialHalfWidthLng,
    }

    const laps = detectLaps(points, startFinish)

    expect(laps.length).toBeGreaterThanOrEqual(4)
    expect(laps.every((lap) => lap.distance >= 50)).toBe(true)
    expect(laps.every((lap) => lap.duration >= 19)).toBe(true)
  })
})
