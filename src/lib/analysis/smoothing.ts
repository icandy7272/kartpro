import type { GPSPoint } from '../../types'

const MAX_REASONABLE_ACCELERATION = 30 // m/s^2, generous for karting with GPS noise
const MAX_REASONABLE_SPEED = 50 // m/s (~180 km/h, well above karting max)

/**
 * Remove outlier points that indicate GPS glitches:
 * - Impossible speed jumps between consecutive points
 * - Unreasonably high speeds
 */
function removeOutliers(points: GPSPoint[]): GPSPoint[] {
  if (points.length < 3) return [...points]

  const filtered: GPSPoint[] = [points[0]]

  for (let i = 1; i < points.length; i++) {
    const prev = filtered[filtered.length - 1]
    const curr = points[i]
    const dt = (curr.time - prev.time) / 1000 // seconds

    if (dt <= 0) continue // skip duplicate timestamps

    // Check for unreasonable speed
    if (curr.speed > MAX_REASONABLE_SPEED) continue

    // Check for impossible acceleration
    const acceleration = Math.abs(curr.speed - prev.speed) / dt
    if (acceleration > MAX_REASONABLE_ACCELERATION && dt < 2) continue

    // Check for teleportation (huge position jump)
    const dlat = curr.lat - prev.lat
    const dlng = curr.lng - prev.lng
    const approxDistDeg = Math.sqrt(dlat * dlat + dlng * dlng)
    // At equator 1 degree ~ 111km, even at high lat this catches large jumps
    const maxDegPerSecond = MAX_REASONABLE_SPEED / 111000
    if (approxDistDeg / dt > maxDegPerSecond * 3) continue

    filtered.push(curr)
  }

  return filtered
}

/**
 * Apply a moving average filter to smooth GPS coordinates.
 * Speed, time, and altitude are preserved from original points.
 */
export function smoothGPSData(points: GPSPoint[], windowSize: number = 5): GPSPoint[] {
  if (points.length === 0) return []

  const cleaned = removeOutliers(points)
  if (cleaned.length < windowSize) return cleaned

  const halfWindow = Math.floor(windowSize / 2)
  const smoothed: GPSPoint[] = []

  for (let i = 0; i < cleaned.length; i++) {
    const start = Math.max(0, i - halfWindow)
    const end = Math.min(cleaned.length - 1, i + halfWindow)
    const count = end - start + 1

    let latSum = 0
    let lngSum = 0

    for (let j = start; j <= end; j++) {
      latSum += cleaned[j].lat
      lngSum += cleaned[j].lng
    }

    smoothed.push({
      lat: latSum / count,
      lng: lngSum / count,
      speed: cleaned[i].speed,
      time: cleaned[i].time,
      altitude: cleaned[i].altitude,
    })
  }

  return smoothed
}
