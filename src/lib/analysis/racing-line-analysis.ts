import type { GPSPoint, Corner, Lap, LapAnalysis, RacingLineDeviation, BrakeThrottlePoint, CornerLineAnalysis, RacingLineAnalysis } from '../../types'
import { projectToXY, pairwiseDistances, cumulativeDistance, smoothedCurvature, type XYPoint } from './corner-detection'

// ---- Lateral deviation ----

/**
 * Project a single GPS point to XY using a given origin.
 */
function projectPointToXY(p: GPSPoint, lat0: number, lng0: number, cosLat0: number): XYPoint {
  const R = 6_371_000
  return {
    x: ((p.lng - lng0) * Math.PI / 180) * R * cosLat0,
    y: ((p.lat - lat0) * Math.PI / 180) * R,
  }
}

/**
 * Find the perpendicular projection of point P onto segment (A, B).
 * Returns { t, dist, signedDist } where t is the parameter along the segment,
 * dist is the absolute distance, and signedDist is positive if P is to the left
 * of the direction A→B.
 */
function projectPointToSegment(
  p: XYPoint, a: XYPoint, b: XYPoint
): { t: number; dist: number; signedDist: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-12) {
    const d = Math.hypot(p.x - a.x, p.y - a.y)
    return { t: 0, dist: d, signedDist: d }
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  const dist = Math.hypot(p.x - projX, p.y - projY)
  // Cross product sign: positive = P is to the left of A→B
  const cross = dx * (p.y - a.y) - dy * (p.x - a.x)
  return { t, dist, signedDist: cross >= 0 ? dist : -dist }
}

/**
 * Compute lateral deviations of comparison lap points relative to reference lap
 * within a corner region.
 */
function computeCornerDeviations(
  refPoints: GPSPoint[],
  compPoints: GPSPoint[],
  refCorner: Corner,
  compCorner: Corner,
): RacingLineDeviation[] {
  // Compute shared origin from reference points
  const allRef = refPoints.slice(refCorner.startIndex, refCorner.endIndex + 1)
  let sumLat = 0, sumLng = 0
  for (const p of allRef) { sumLat += p.lat; sumLng += p.lng }
  const lat0 = sumLat / allRef.length
  const lng0 = sumLng / allRef.length
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180)

  // Project reference corner points
  const refXY: XYPoint[] = []
  for (let i = refCorner.startIndex; i <= refCorner.endIndex; i++) {
    refXY.push(projectPointToXY(refPoints[i], lat0, lng0, cosLat0))
  }

  // Compute arc lengths along reference
  const refSegLens = pairwiseDistances(refXY)
  const refArc = cumulativeDistance(refSegLens)

  // Project comparison corner points and find deviations
  const deviations: RacingLineDeviation[] = []
  let lastMatchedSeg = 0

  for (let i = compCorner.startIndex; i <= compCorner.endIndex; i++) {
    const p = projectPointToXY(compPoints[i], lat0, lng0, cosLat0)

    // Search for closest segment near last matched
    let bestDist = Infinity
    let bestSigned = 0
    let bestArc = 0
    const searchStart = Math.max(0, lastMatchedSeg - 5)
    const searchEnd = Math.min(refXY.length - 2, lastMatchedSeg + 20)

    for (let s = searchStart; s <= searchEnd; s++) {
      const { t, dist, signedDist } = projectPointToSegment(p, refXY[s], refXY[s + 1])
      if (dist < bestDist) {
        bestDist = dist
        bestSigned = signedDist
        bestArc = refArc[s] + t * refSegLens[s]
        lastMatchedSeg = s
      }
    }

    deviations.push({
      pointIndex: i,
      lateralOffset: bestSigned,
      refArcLength: bestArc,
    })
  }

  // Apply 7-point moving average smoothing to lateral offsets
  const smoothed = smoothArray(deviations.map(d => d.lateralOffset), 3)
  for (let i = 0; i < deviations.length; i++) {
    deviations[i].lateralOffset = smoothed[i]
  }

  return deviations
}

function smoothArray(arr: number[], halfWindow: number): number[] {
  return arr.map((_, i) => {
    const lo = Math.max(0, i - halfWindow)
    const hi = Math.min(arr.length - 1, i + halfWindow)
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += arr[j]
    return sum / (hi - lo + 1)
  })
}

// ---- Braking/throttle point detection ----

/**
 * Compute smoothed acceleration (m/s^2) between consecutive points.
 */
function computeAccelerations(points: GPSPoint[], start: number, end: number): { idx: number; accel: number }[] {
  const result: { idx: number; accel: number }[] = []
  for (let i = start; i <= end; i++) {
    if (i <= 0 || i >= points.length) continue
    const dt = (points[i].time - points[i - 1].time) / 1000
    if (dt > 0) {
      result.push({ idx: i, accel: (points[i].speed - points[i - 1].speed) / dt })
    }
  }
  // Smooth with 3-point moving average
  const smoothed = smoothArray(result.map(r => r.accel), 1)
  return result.map((r, i) => ({ idx: r.idx, accel: smoothed[i] }))
}

/**
 * Detect braking point before a corner.
 * Strategy: find the point before corner entry where speed starts consistently dropping.
 * Uses the steepest deceleration point and traces back to where braking began.
 */
function detectBrakePoint(
  points: GPSPoint[],
  cornerStartIdx: number,
  buffer: number = 50,
): BrakeThrottlePoint | null {
  const searchStart = Math.max(1, cornerStartIdx - buffer)
  const accels = computeAccelerations(points, searchStart, cornerStartIdx)

  if (accels.length < 3) return null

  // Find the peak deceleration point
  let minAccel = 0
  let minIdx = -1
  for (const a of accels) {
    if (a.accel < minAccel) {
      minAccel = a.accel
      minIdx = a.idx
    }
  }

  // Need at least some meaningful deceleration (> 0.3 m/s^2)
  if (minAccel > -0.3 || minIdx < 0) return null

  // Trace backward from peak deceleration to find where braking started
  // (where speed was still roughly constant or increasing)
  let brakeStartIdx = minIdx
  for (let i = accels.length - 1; i >= 0; i--) {
    if (accels[i].idx > minIdx) continue
    if (accels[i].accel >= -0.1) {
      brakeStartIdx = accels[i].idx
      break
    }
  }

  return {
    pointIndex: brakeStartIdx,
    lat: points[brakeStartIdx].lat,
    lng: points[brakeStartIdx].lng,
    trackDistance: 0,
    speed: points[brakeStartIdx].speed * 3.6,
  }
}

/**
 * Detect throttle point after apex.
 * Strategy: find where sustained acceleration begins after the apex.
 */
function detectThrottlePoint(
  points: GPSPoint[],
  apexIdx: number,
  cornerEndIdx: number,
  buffer: number = 50,
): BrakeThrottlePoint | null {
  const searchEnd = Math.min(points.length - 1, cornerEndIdx + buffer)
  const accels = computeAccelerations(points, apexIdx, searchEnd)

  if (accels.length < 3) return null

  // Find the peak acceleration point
  let maxAccel = 0
  let maxIdx = -1
  for (const a of accels) {
    if (a.accel > maxAccel) {
      maxAccel = a.accel
      maxIdx = a.idx
    }
  }

  // Need at least some meaningful acceleration (> 0.3 m/s^2)
  if (maxAccel < 0.3 || maxIdx < 0) return null

  // Trace backward to find where acceleration started
  let throttleStartIdx = maxIdx
  for (const a of accels) {
    if (a.idx > maxIdx) break
    if (a.accel <= 0.1) {
      throttleStartIdx = a.idx
    }
  }

  return {
    pointIndex: throttleStartIdx,
    lat: points[throttleStartIdx].lat,
    lng: points[throttleStartIdx].lng,
    trackDistance: 0,
    speed: points[throttleStartIdx].speed * 3.6,
  }
}

// ---- Curvature consistency ----

/**
 * Compute curvature consistency score between two trajectories at a corner.
 * Uses Pearson correlation of curvature profiles.
 * Returns 0-100 (100 = identical profiles).
 */
function computeCurvatureConsistency(
  refPoints: GPSPoint[],
  compPoints: GPSPoint[],
  refStart: number, refEnd: number,
  compStart: number, compEnd: number,
): number {
  const refSlice = refPoints.slice(refStart, refEnd + 1)
  const compSlice = compPoints.slice(compStart, compEnd + 1)

  if (refSlice.length < 5 || compSlice.length < 5) return 50

  const refXY = projectToXY(refSlice)
  const compXY = projectToXY(compSlice)

  const refSegs = pairwiseDistances(refXY)
  const compSegs = pairwiseDistances(compXY)

  const refCurv = smoothedCurvature(refXY, refSegs, 5).curvature
  const compCurv = smoothedCurvature(compXY, compSegs, 5).curvature

  // Resample both to same length (use shorter as target)
  const targetLen = Math.min(refCurv.length, compCurv.length, 50)
  const resampledRef = resample(refCurv, targetLen)
  const resampledComp = resample(compCurv, targetLen)

  // Pearson correlation
  const r = pearsonCorrelation(resampledRef, resampledComp)
  return Math.max(0, Math.round(r * 100))
}

function resample(arr: number[], targetLen: number): number[] {
  if (arr.length === targetLen) return arr
  const result: number[] = []
  for (let i = 0; i < targetLen; i++) {
    const srcIdx = (i / (targetLen - 1)) * (arr.length - 1)
    const lo = Math.floor(srcIdx)
    const hi = Math.min(lo + 1, arr.length - 1)
    const frac = srcIdx - lo
    result.push(arr[lo] * (1 - frac) + arr[hi] * frac)
  }
  return result
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length
  if (n < 3) return 0
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0
  for (let i = 0; i < n; i++) {
    sumA += a[i]; sumB += b[i]
    sumAB += a[i] * b[i]
    sumA2 += a[i] * a[i]
    sumB2 += b[i] * b[i]
  }
  const denom = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB))
  if (denom < 1e-12) return 1 // constant profiles = identical
  return (n * sumAB - sumA * sumB) / denom
}

// ---- Main entry point ----

/**
 * Analyze racing line of a comparison lap against a reference (fastest) lap.
 */
export function analyzeRacingLine(
  referenceLap: Lap,
  comparisonLap: Lap,
  refAnalysis: LapAnalysis,
  compAnalysis: LapAnalysis,
  corners: Corner[],
): RacingLineAnalysis {
  const cornerAnalyses: CornerLineAnalysis[] = []

  for (let ci = 0; ci < corners.length; ci++) {
    const refCorner = refAnalysis.corners[ci]
    const compCorner = compAnalysis.corners[ci]

    if (!refCorner || !compCorner) continue

    // Lateral deviations
    const deviations = computeCornerDeviations(
      referenceLap.points, comparisonLap.points,
      refCorner, compCorner,
    )

    const offsets = deviations.map(d => d.lateralOffset)
    const absOffsets = offsets.map(Math.abs)
    const meanDev = offsets.length > 0 ? offsets.reduce((s, v) => s + v, 0) / offsets.length : 0
    const maxDev = absOffsets.length > 0 ? Math.max(...absOffsets) : 0
    const variance = offsets.length > 1
      ? offsets.reduce((s, v) => s + (v - meanDev) ** 2, 0) / (offsets.length - 1)
      : 0
    const stdDev = Math.sqrt(variance)

    // Brake/throttle points
    const brakePoint = detectBrakePoint(comparisonLap.points, compCorner.startIndex)
    const throttlePoint = detectThrottlePoint(
      comparisonLap.points, compCorner.apexIndex, compCorner.endIndex
    )
    const refBrakePoint = detectBrakePoint(referenceLap.points, refCorner.startIndex)
    const refThrottlePoint = detectThrottlePoint(
      referenceLap.points, refCorner.apexIndex, refCorner.endIndex
    )

    // Curvature consistency
    const curvatureConsistency = computeCurvatureConsistency(
      referenceLap.points, comparisonLap.points,
      refCorner.startIndex, refCorner.endIndex,
      compCorner.startIndex, compCorner.endIndex,
    )

    cornerAnalyses.push({
      cornerName: corners[ci].name,
      meanDeviation: meanDev,
      maxDeviation: maxDev,
      stdDeviation: stdDev,
      deviations,
      brakePoint,
      throttlePoint,
      refBrakePoint,
      refThrottlePoint,
      curvatureConsistency,
    })
  }

  const overallConsistency = cornerAnalyses.length > 0
    ? Math.round(cornerAnalyses.reduce((s, c) => s + c.curvatureConsistency, 0) / cornerAnalyses.length)
    : 0

  return {
    referenceLapId: referenceLap.id,
    comparisonLapId: comparisonLap.id,
    corners: cornerAnalyses,
    overallConsistency,
  }
}
