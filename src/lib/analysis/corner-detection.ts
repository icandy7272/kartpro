import type { Lap, Corner } from '../../types'

/**
 * Calculate bearing in degrees from point (lat1, lng1) to (lat2, lng2).
 */
function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const lat1Rad = (lat1 * Math.PI) / 180
  const lat2Rad = (lat2 * Math.PI) / 180

  const y = Math.sin(dLng) * Math.cos(lat2Rad)
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)

  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Compute the smallest signed angle difference between two bearings.
 * Returns value in range [-180, 180].
 */
function angleDiff(a: number, b: number): number {
  let diff = b - a
  while (diff > 180) diff -= 360
  while (diff < -180) diff += 360
  return diff
}

/**
 * Detect corners in a lap using heading change rate.
 * A corner is a contiguous region where the heading change rate exceeds a threshold.
 */
export function detectCorners(lap: Lap): Corner[] {
  const points = lap.points
  if (points.length < 10) return []

  // Compute bearing at each point (using next point)
  const bearings: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    bearings.push(
      bearing(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng)
    )
  }
  bearings.push(bearings[bearings.length - 1]) // duplicate last

  // Compute heading change rate (degrees per second)
  const headingRates: number[] = new Array(points.length).fill(0)
  for (let i = 1; i < bearings.length; i++) {
    const dt = (points[i].time - points[i - 1].time) / 1000
    if (dt > 0) {
      headingRates[i] = Math.abs(angleDiff(bearings[i - 1], bearings[i])) / dt
    }
  }

  // Smooth the heading rate with a small window to reduce noise
  const smoothWindow = 3
  const smoothedRates: number[] = new Array(points.length).fill(0)
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - Math.floor(smoothWindow / 2))
    const end = Math.min(points.length - 1, i + Math.floor(smoothWindow / 2))
    let sum = 0
    for (let j = start; j <= end; j++) {
      sum += headingRates[j]
    }
    smoothedRates[i] = sum / (end - start + 1)
  }

  // Threshold for corner detection: heading rate > 15 deg/s
  const CORNER_THRESHOLD = 15
  // Minimum number of consecutive points to be a corner
  const MIN_CORNER_POINTS = 3
  // Minimum gap between corners (in points)
  const MIN_GAP = 5

  // Find contiguous regions above threshold
  const regions: Array<{ start: number; end: number }> = []
  let inCorner = false
  let regionStart = 0

  for (let i = 0; i < points.length; i++) {
    if (smoothedRates[i] >= CORNER_THRESHOLD) {
      if (!inCorner) {
        regionStart = i
        inCorner = true
      }
    } else {
      if (inCorner) {
        if (i - regionStart >= MIN_CORNER_POINTS) {
          regions.push({ start: regionStart, end: i - 1 })
        }
        inCorner = false
      }
    }
  }
  // Handle corner that extends to end
  if (inCorner && points.length - regionStart >= MIN_CORNER_POINTS) {
    regions.push({ start: regionStart, end: points.length - 1 })
  }

  // Merge regions that are very close together (likely the same corner)
  const merged: Array<{ start: number; end: number }> = []
  for (const region of regions) {
    if (merged.length > 0 && region.start - merged[merged.length - 1].end < MIN_GAP) {
      merged[merged.length - 1].end = region.end
    } else {
      merged.push({ ...region })
    }
  }

  // Build Corner objects
  const corners: Corner[] = merged.map((region, idx) => {
    const cornerPoints = points.slice(region.start, region.end + 1)
    const speeds = cornerPoints.map((p) => p.speed)
    const minSpeed = Math.min(...speeds)

    // Entry speed: speed at the start of the corner (or 1 point before if available)
    const entryIdx = Math.max(0, region.start - 1)
    const entrySpeed = points[entryIdx].speed

    // Exit speed: speed at the end of the corner (or 1 point after if available)
    const exitIdx = Math.min(points.length - 1, region.end + 1)
    const exitSpeed = points[exitIdx].speed

    const startTime = points[region.start].time
    const endTime = points[region.end].time
    const duration = (endTime - startTime) / 1000

    return {
      id: idx + 1,
      name: `T${idx + 1}`,
      startIndex: region.start,
      endIndex: region.end,
      entrySpeed,
      minSpeed,
      exitSpeed,
      duration,
    }
  })

  return corners
}
