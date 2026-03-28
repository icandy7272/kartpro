import type { GPSPoint, Lap } from '../../types'

interface StartFinishLine {
  lat1: number
  lng1: number
  lat2: number
  lng2: number
}

/**
 * Check if two line segments intersect.
 * Segment 1: (p1, p2), Segment 2: (p3, p4)
 * Returns the parameter t along segment 1 if they intersect, or null.
 */
function segmentIntersection(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number
): number | null {
  const d1x = p2x - p1x
  const d1y = p2y - p1y
  const d2x = p4x - p3x
  const d2y = p4y - p3y

  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-12) return null // parallel

  const t = ((p3x - p1x) * d2y - (p3y - p1y) * d2x) / denom
  const u = ((p3x - p1x) * d1y - (p3y - p1y) * d1x) / denom

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return t
  }

  return null
}

/**
 * Haversine distance in meters between two lat/lng points.
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Calculate total distance of a set of GPS points in meters.
 */
function totalDistance(points: GPSPoint[]): number {
  let dist = 0
  for (let i = 1; i < points.length; i++) {
    dist += haversineDistance(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
  }
  return dist
}

/**
 * Widen the start/finish line perpendicular to the track direction to account for GPS noise.
 * Takes the SF line endpoints and extends them outward by a tolerance in meters.
 */
function widenStartFinishLine(sf: StartFinishLine, toleranceMeters: number): StartFinishLine {
  const dx = sf.lat2 - sf.lat1
  const dy = sf.lng2 - sf.lng1
  const len = Math.sqrt(dx * dx + dy * dy)

  if (len < 1e-10) return sf

  // Extend the line by tolerance on each end (in degrees, approximate)
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos(((sf.lat1 + sf.lat2) / 2 * Math.PI) / 180)

  const extLat = (toleranceMeters * dx) / (len * metersPerDegLat)
  const extLng = (toleranceMeters * dy) / (len * metersPerDegLng)

  return {
    lat1: sf.lat1 - extLat,
    lng1: sf.lng1 - extLng,
    lat2: sf.lat2 + extLat,
    lng2: sf.lng2 + extLng,
  }
}

/**
 * Detect laps by finding crossings of the start/finish line.
 */
export function detectLaps(
  points: GPSPoint[],
  startFinish: StartFinishLine
): Lap[] {
  if (points.length < 10) return []

  // Widen the SF line by 3 meters on each side for GPS tolerance
  const sf = widenStartFinishLine(startFinish, 3)

  // Find all crossings with interpolated times
  interface Crossing {
    index: number
    t: number  // interpolation parameter 0-1 between points[index] and points[index+1]
    exactTime: number  // interpolated time in ms
  }
  const crossings: Crossing[] = []
  const MIN_CROSSING_INTERVAL_MS = 10000 // at least 10s between crossings to avoid double-count

  for (let i = 0; i < points.length - 1; i++) {
    const t = segmentIntersection(
      points[i].lat, points[i].lng,
      points[i + 1].lat, points[i + 1].lng,
      sf.lat1, sf.lng1,
      sf.lat2, sf.lng2
    )

    if (t !== null) {
      // Interpolate exact crossing time
      const exactTime = points[i].time + t * (points[i + 1].time - points[i].time)

      // Check minimum interval from last crossing
      if (crossings.length > 0) {
        const lastCrossing = crossings[crossings.length - 1]
        const timeDiff = exactTime - lastCrossing.exactTime
        if (timeDiff < MIN_CROSSING_INTERVAL_MS) continue
      }
      console.log(`[LAP-DETECT] Crossing at index ${i}, t=${t.toFixed(6)}, time_A=${points[i].time}, time_B=${points[i+1].time}, exactTime=${exactTime.toFixed(3)}, interval=${points[i+1].time - points[i].time}ms`)
      crossings.push({ index: i, t, exactTime })
    }
  }

  // Build laps from consecutive crossings
  const laps: Lap[] = []

  for (let i = 0; i < crossings.length - 1; i++) {
    const startCrossing = crossings[i]
    const endCrossing = crossings[i + 1]
    const startIdx = startCrossing.index
    const endIdx = endCrossing.index
    const lapPoints = points.slice(startIdx, endIdx + 1)

    if (lapPoints.length < 5) continue

    // Use interpolated crossing times for precise duration
    const startTime = startCrossing.exactTime
    const endTime = endCrossing.exactTime
    const duration = (endTime - startTime) / 1000
    console.log(`[LAP-DETECT] Lap ${laps.length + 1}: startTime=${startTime.toFixed(3)}, endTime=${endTime.toFixed(3)}, duration=${duration.toFixed(6)}s`)
    const dist = totalDistance(lapPoints)
    const speeds = lapPoints.map((p) => p.speed)
    const maxSpeed = Math.max(...speeds)
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length

    // Filter out obviously invalid laps (too short distance for a kart track)
    if (dist < 100 || duration < 15) continue

    laps.push({
      id: laps.length + 1,
      points: lapPoints,
      startTime,
      endTime,
      duration,
      distance: dist,
      maxSpeed,
      avgSpeed,
    })
  }

  return laps
}

/**
 * Auto-detect the start/finish line by finding the point where the track
 * overlaps itself the most (highest density of nearby points from different
 * time periods in the session).
 */
export function autoDetectStartFinish(
  points: GPSPoint[]
): StartFinishLine | null {
  if (points.length < 100) return null

  // Divide the track into time-based segments
  const totalTime = points[points.length - 1].time - points[0].time
  if (totalTime < 60000) return null // need at least 60 seconds of data

  // Grid-based density approach: divide the bounding box into cells
  // and find which cells have points from the most distinct time segments
  const segmentDuration = 30000 // 30-second segments
  const numSegments = Math.floor(totalTime / segmentDuration)
  if (numSegments < 2) return null

  // Assign each point a segment index
  const startTimeMs = points[0].time
  const pointSegments = points.map((p) => Math.floor((p.time - startTimeMs) / segmentDuration))

  // Find bounding box
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }

  // Use a grid resolution that gives approximately 2-meter cells
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos(((minLat + maxLat) / 2 * Math.PI) / 180)
  const cellSizeLat = 2 / metersPerDegLat
  const cellSizeLng = 2 / metersPerDegLng

  const gridRows = Math.ceil((maxLat - minLat) / cellSizeLat) + 1
  const gridCols = Math.ceil((maxLng - minLng) / cellSizeLng) + 1

  // Cap grid size to avoid excessive memory usage
  if (gridRows * gridCols > 1000000) return null

  // For each cell, track which time segments have points in it
  const cellSegments: Map<number, Set<number>> = new Map()
  const cellPoints: Map<number, GPSPoint[]> = new Map()

  for (let i = 0; i < points.length; i++) {
    const row = Math.floor((points[i].lat - minLat) / cellSizeLat)
    const col = Math.floor((points[i].lng - minLng) / cellSizeLng)
    const key = row * gridCols + col

    if (!cellSegments.has(key)) {
      cellSegments.set(key, new Set())
      cellPoints.set(key, [])
    }
    cellSegments.get(key)!.add(pointSegments[i])
    cellPoints.get(key)!.push(points[i])
  }

  // Find the cell with the most distinct time segments
  let bestKey = -1
  let bestCount = 0
  for (const [key, segments] of cellSegments) {
    if (segments.size > bestCount) {
      bestCount = segments.size
      bestKey = key
    }
  }

  if (bestKey === -1 || bestCount < 2) return null

  // Get the centroid of the best cell's points
  const bestPoints = cellPoints.get(bestKey)!
  const centerLat = bestPoints.reduce((s, p) => s + p.lat, 0) / bestPoints.length
  const centerLng = bestPoints.reduce((s, p) => s + p.lng, 0) / bestPoints.length

  // Determine the predominant heading at this point to create a perpendicular SF line
  // Find points near the centroid and compute their average heading
  const nearbyIndices: number[] = []
  for (let i = 0; i < points.length; i++) {
    const d = haversineDistance(points[i].lat, points[i].lng, centerLat, centerLng)
    if (d < 5) {
      nearbyIndices.push(i)
    }
  }

  if (nearbyIndices.length < 2) return null

  // Average heading from consecutive nearby points
  let avgDx = 0
  let avgDy = 0
  let headingCount = 0
  for (const idx of nearbyIndices) {
    if (idx + 1 < points.length) {
      avgDx += points[idx + 1].lat - points[idx].lat
      avgDy += points[idx + 1].lng - points[idx].lng
      headingCount++
    }
  }

  if (headingCount === 0) return null

  avgDx /= headingCount
  avgDy /= headingCount

  // Perpendicular direction
  const perpDx = -avgDy
  const perpDy = avgDx
  const perpLen = Math.sqrt(perpDx * perpDx + perpDy * perpDy)

  if (perpLen < 1e-12) return null

  // Create a SF line ~10 meters wide perpendicular to track direction
  const halfWidth = 5 // meters
  const extLat = (halfWidth / metersPerDegLat) * (perpDx / perpLen)
  const extLng = (halfWidth / metersPerDegLng) * (perpDy / perpLen)

  return {
    lat1: centerLat - extLat,
    lng1: centerLng - extLng,
    lat2: centerLat + extLat,
    lng2: centerLng + extLng,
  }
}
