import type { GPSPoint, Corner } from '../../types'

const R_EARTH_M = 6_371_000.0

// ---- Geometry helpers ----

export interface XYPoint {
  x: number
  y: number
}

/**
 * Project GPS coordinates to local XY plane (meters) using equirectangular projection.
 * Uses the centroid of all points as origin.
 */
export function projectToXY(points: GPSPoint[]): XYPoint[] {
  const n = points.length
  let sumLat = 0
  let sumLng = 0
  for (const p of points) {
    sumLat += p.lat
    sumLng += p.lng
  }
  const lat0 = sumLat / n
  const lng0 = sumLng / n
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180)

  return points.map((p) => ({
    x: ((p.lng - lng0) * Math.PI / 180) * R_EARTH_M * cosLat0,
    y: ((p.lat - lat0) * Math.PI / 180) * R_EARTH_M,
  }))
}

/**
 * Compute pairwise Euclidean distances between consecutive XY points.
 */
export function pairwiseDistances(xy: XYPoint[]): number[] {
  const dists: number[] = []
  for (let i = 0; i < xy.length - 1; i++) {
    const dx = xy[i + 1].x - xy[i].x
    const dy = xy[i + 1].y - xy[i].y
    dists.push(Math.hypot(dx, dy))
  }
  return dists
}

/**
 * Compute cumulative arc-length distances.
 */
export function cumulativeDistance(segLengths: number[]): number[] {
  const arc = [0.0]
  for (const d of segLengths) {
    arc.push(arc[arc.length - 1] + d)
  }
  return arc
}

/**
 * Unwrap an angle difference to [-pi, pi].
 */
function unwrapAngle(delta: number): number {
  return ((delta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
}

/**
 * Compute heading at each point using a sliding window (linear, non-circular).
 * halfStep controls how far ahead/behind we look.
 */
export function linearHeadings(xy: XYPoint[], halfStep: number = 3): number[] {
  const n = xy.length
  const headings: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - halfStep)
    const b = Math.min(n - 1, i + halfStep)
    const dx = xy[b].x - xy[a].x
    const dy = xy[b].y - xy[a].y
    headings[i] = Math.atan2(dy, dx)
  }
  return headings
}

/**
 * Compute smoothed curvature (rad/m) at each point.
 * 1. Compute headings with a sliding window
 * 2. Compute raw curvature = heading_change / segment_distance
 * 3. Smooth curvature with a moving average
 */
export function smoothedCurvature(
  xy: XYPoint[],
  segLengths: number[],
  smoothingHalfWindowM: number = 7.5,
  headingHalfStep: number = 3,
): { curvature: number[]; headings: number[]; smoothHalfSamples: number } {
  const n = xy.length

  // Median segment spacing
  const sortedSegs = [...segLengths].sort((a, b) => a - b)
  const spacing = sortedSegs[Math.floor(sortedSegs.length / 2)]
  const smoothHalfSamples = Math.max(3, Math.round(smoothingHalfWindowM / spacing))

  // Compute headings
  const headings = linearHeadings(xy, headingHalfStep)

  // Raw curvature: heading change / distance
  const rawCurvature: number[] = new Array(n).fill(0)
  for (let i = 1; i < n; i++) {
    const dist = segLengths[i - 1]
    rawCurvature[i] = unwrapAngle(headings[i] - headings[i - 1]) / Math.max(dist, 1e-6)
  }

  // Smooth curvature with moving average (linear, clamped at edges)
  const smoothed: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - smoothHalfSamples)
    const hi = Math.min(n - 1, i + smoothHalfSamples)
    let sum = 0
    for (let k = lo; k <= hi; k++) {
      sum += rawCurvature[k]
    }
    smoothed[i] = sum / (hi - lo + 1)
  }

  return { curvature: smoothed, headings, smoothHalfSamples }
}

// ---- Corner region detection ----

interface Region {
  start: number
  end: number
}

/**
 * Find contiguous regions where |curvature| >= threshold and length >= minCornerLengthM.
 */
function detectRegions(
  absCurvature: number[],
  arc: number[],
  threshold: number,
  minCornerLengthM: number = 10.0,
): Region[] {
  const n = absCurvature.length
  const mask = absCurvature.map((v) => v >= threshold)

  const regions: Region[] = []
  let active = false
  let startIdx = 0

  for (let i = 0; i < n; i++) {
    if (mask[i] && !active) {
      startIdx = i
      active = true
    } else if (active && !mask[i]) {
      const endIdx = i - 1
      if (arc[endIdx] - arc[startIdx] >= minCornerLengthM) {
        regions.push({ start: startIdx, end: endIdx })
      }
      active = false
    }
  }
  // Handle region extending to end
  if (active) {
    const endIdx = n - 1
    if (arc[endIdx] - arc[startIdx] >= minCornerLengthM) {
      regions.push({ start: startIdx, end: endIdx })
    }
  }

  return regions
}

// ---- Threshold sweep auto-calibration ----

interface SweepEntry {
  threshold: number
  count: number
}

/**
 * Sweep thresholds from 0.005 to 0.030 rad/m and count corners at each.
 */
function sweepThreshold(
  absCurvature: number[],
  arc: number[],
  minCornerLengthM: number = 10.0,
): SweepEntry[] {
  const sweep: SweepEntry[] = []
  for (let i = 5; i <= 30; i++) {
    const threshold = i / 1000
    const regions = detectRegions(absCurvature, arc, threshold, minCornerLengthM)
    sweep.push({ threshold, count: regions.length })
  }
  return sweep
}

/**
 * Find the best threshold by looking for stable bands of corner counts.
 * A "band" is a contiguous range of thresholds producing the same corner count.
 * We pick the band with count in [6, 15] that has the widest range (most stable),
 * and use the middle threshold of that band.
 */
function selectThreshold(sweep: SweepEntry[]): number | null {
  // Group into bands: contiguous threshold runs with the same count
  interface Band {
    count: number
    thresholds: number[]
  }
  const bands: Band[] = []

  for (const entry of sweep) {
    if (
      bands.length > 0 &&
      bands[bands.length - 1].count === entry.count &&
      Math.round((entry.threshold - bands[bands.length - 1].thresholds[bands[bands.length - 1].thresholds.length - 1]) * 1000) === 1
    ) {
      bands[bands.length - 1].thresholds.push(entry.threshold)
    } else {
      bands.push({ count: entry.count, thresholds: [entry.threshold] })
    }
  }

  // Filter to bands with count in [6, 15]
  const validBands = bands.filter((b) => b.count >= 6 && b.count <= 15)

  if (validBands.length === 0) {
    // Fallback: try any band with count >= 3
    const fallback = bands.filter((b) => b.count >= 3)
    if (fallback.length === 0) return null
    const best = fallback.reduce((a, b) => (a.thresholds.length > b.thresholds.length ? a : b))
    return best.thresholds[Math.floor(best.thresholds.length / 2)]
  }

  // Pick the widest band
  const best = validBands.reduce((a, b) => (a.thresholds.length > b.thresholds.length ? a : b))
  return best.thresholds[Math.floor(best.thresholds.length / 2)]
}

// ---- Accumulated angle for a region ----

function regionAngle(headings: number[], start: number, end: number): number {
  let angle = 0
  for (let i = start; i < end; i++) {
    angle += unwrapAngle(headings[i + 1] - headings[i])
  }
  return angle
}

// ---- Corner type classification ----

function classifyCorner(angleDeg: number): string {
  if (angleDeg >= 90) return '发卡弯'
  if (angleDeg >= 60) return '低速弯'
  if (angleDeg >= 30) return '中速弯'
  return '高速弯'
}

// ---- Main entry point ----

/**
 * Detect corners in a set of GPS points using curvature-based analysis.
 *
 * Algorithm:
 * 1. Project GPS to local XY (meters)
 * 2. Compute pairwise distances and cumulative arc length
 * 3. Compute smoothed curvature (rad/m)
 * 4. Run threshold sweep to auto-calibrate
 * 5. Detect corner regions above threshold
 * 6. For each region: direction, angle, apex, label
 */
export function detectCorners(points: GPSPoint[]): Corner[] {
  if (points.length < 20) return []

  // 1. Project to XY
  const xy = projectToXY(points)

  // 2. Pairwise distances and cumulative arc length
  const segLengths = pairwiseDistances(xy)
  const arc = cumulativeDistance(segLengths)

  // 3. Smoothed curvature
  const { curvature, headings } = smoothedCurvature(xy, segLengths)

  // 4. Absolute curvature for thresholding
  const absCurvature = curvature.map((v) => Math.abs(v))

  // 5. Threshold sweep auto-calibration
  const sweep = sweepThreshold(absCurvature, arc)
  const threshold = selectThreshold(sweep)
  if (threshold === null) {
    // Fallback: use a reasonable default
    return fallbackDetectCorners(points)
  }

  // 6. Detect regions
  const regions = detectRegions(absCurvature, arc, threshold)
  if (regions.length === 0) return []

  // 7. Build Corner objects
  const corners: Corner[] = regions.map((region, idx) => {
    // Apex: point with max |curvature| in region
    let apexIdx = region.start
    let maxCurv = 0
    for (let i = region.start; i <= region.end; i++) {
      if (absCurvature[i] > maxCurv) {
        maxCurv = absCurvature[i]
        apexIdx = i
      }
    }

    // Accumulated heading change for direction and angle
    const angle = regionAngle(headings, region.start, region.end)
    const angleDeg = Math.abs(angle * 180 / Math.PI)
    const direction: 'left' | 'right' = angle > 0 ? 'left' : 'right'

    // Speed info
    const cornerPoints = points.slice(region.start, region.end + 1)
    const speeds = cornerPoints.map((p) => p.speed)
    const minSpeed = Math.min(...speeds) * 3.6 // convert to km/h

    const entryIdx = Math.max(0, region.start - 1)
    const exitIdx = Math.min(points.length - 1, region.end + 1)
    const entrySpeed = points[entryIdx].speed * 3.6
    const exitSpeed = points[exitIdx].speed * 3.6

    const startTime = points[region.start].time
    const endTime = points[region.end].time
    const duration = (endTime - startTime) / 1000

    return {
      id: idx + 1,
      name: `T${idx + 1}`,
      startIndex: region.start,
      endIndex: region.end,
      midpointIndex: apexIdx, // use apex as midpoint
      apexIndex: apexIdx,
      apexDistance: arc[apexIdx],
      direction,
      angle: angleDeg,
      type: classifyCorner(angleDeg),
      entrySpeed,
      minSpeed,
      exitSpeed,
      duration,
    }
  })

  return corners
}

/**
 * Fallback corner detection using simple heading change rate.
 * Used when the threshold sweep fails to find a stable band.
 */
function fallbackDetectCorners(points: GPSPoint[]): Corner[] {
  if (points.length < 20) return []

  const xy = projectToXY(points)
  const segLengths = pairwiseDistances(xy)
  const arc = cumulativeDistance(segLengths)
  const { curvature, headings } = smoothedCurvature(xy, segLengths)
  const absCurvature = curvature.map((v) => Math.abs(v))

  // Use a fixed threshold of 0.010 rad/m as fallback
  const threshold = 0.010
  const regions = detectRegions(absCurvature, arc, threshold)

  return regions.map((region, idx) => {
    let apexIdx = region.start
    let maxCurv = 0
    for (let i = region.start; i <= region.end; i++) {
      if (absCurvature[i] > maxCurv) {
        maxCurv = absCurvature[i]
        apexIdx = i
      }
    }

    const angle = regionAngle(headings, region.start, region.end)
    const angleDeg = Math.abs(angle * 180 / Math.PI)
    const direction: 'left' | 'right' = angle > 0 ? 'left' : 'right'

    const cornerPoints = points.slice(region.start, region.end + 1)
    const speeds = cornerPoints.map((p) => p.speed)
    const minSpeed = Math.min(...speeds) * 3.6

    const entryIdx = Math.max(0, region.start - 1)
    const exitIdx = Math.min(points.length - 1, region.end + 1)

    return {
      id: idx + 1,
      name: `T${idx + 1}`,
      startIndex: region.start,
      endIndex: region.end,
      midpointIndex: apexIdx,
      apexIndex: apexIdx,
      apexDistance: arc[apexIdx],
      direction,
      angle: angleDeg,
      type: classifyCorner(angleDeg),
      entrySpeed: points[entryIdx].speed * 3.6,
      minSpeed,
      exitSpeed: points[exitIdx].speed * 3.6,
      duration: (points[region.end].time - points[region.start].time) / 1000,
    }
  })
}
