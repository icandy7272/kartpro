import type { GPSPoint } from '../../types'

// ---- Constants ----

const R_EARTH_M = 6_371_000.0
const PIT_FINISH_BIAS = 0.90

// ---- Types ----

interface XYPoint {
  x: number
  y: number
}

interface LapCandidate {
  start: number
  end: number
  lapTimeS: number
  lapLenM: number
  closureDistM: number
  closureHeadingRad: number
}

interface CornerRegion {
  start: number
  end: number
}

interface Straight {
  fromCorner: number
  toCorner: number
  lengthM: number
  midArcM: number
  startIdx: number
  endIdx: number
}

export interface TrackAnalysisCorner {
  name: string
  startIndex: number
  apexIndex: number
  endIndex: number
  startDistance: number
  apexDistance: number
  endDistance: number
  length: number
  direction: 'left' | 'right'
  angleDeg: number
}

export interface TrackAnalysisResult {
  representativeLap: {
    startIndex: number
    endIndex: number
    lapTime: number
    lapLength: number
  }
  startFinishLine: {
    lat1: number
    lng1: number
    lat2: number
    lng2: number
    arcPosition: number
    source: 'longest_straight' | 'pit_biased'
  }
  corners: TrackAnalysisCorner[]
  trackLength: number
  sampleSpacing: number
  threshold: number
  thresholdBand: [number, number]
}

// ---- Geometry helpers ----

function projectPoints(points: GPSPoint[]): XYPoint[] {
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

function unprojectPoint(xy: XYPoint, refPoints: GPSPoint[]): { lat: number; lng: number } {
  const n = refPoints.length
  let sumLat = 0
  let sumLng = 0
  for (const p of refPoints) {
    sumLat += p.lat
    sumLng += p.lng
  }
  const lat0 = sumLat / n
  const lng0 = sumLng / n
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180)

  const lat = lat0 + (xy.y / R_EARTH_M) * (180 / Math.PI)
  const lng = lng0 + (xy.x / (R_EARTH_M * cosLat0)) * (180 / Math.PI)
  return { lat, lng }
}

function pairwiseDistances(xy: XYPoint[]): number[] {
  const dists: number[] = []
  for (let i = 0; i < xy.length - 1; i++) {
    dists.push(Math.hypot(xy[i + 1].x - xy[i].x, xy[i + 1].y - xy[i].y))
  }
  return dists
}

function cumulativeDistance(segLengths: number[]): number[] {
  const arc = [0.0]
  for (const d of segLengths) {
    arc.push(arc[arc.length - 1] + d)
  }
  return arc
}

function unwrapAngle(delta: number): number {
  return ((delta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

// ---- Circular (closed-loop) helpers ----

function sampleHeadingsCircular(points: XYPoint[], halfStep: number): number[] {
  const n = points.length
  const headings: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const a = ((i - halfStep) % n + n) % n
    const b = ((i + halfStep) % n + n) % n
    const dx = points[b].x - points[a].x
    const dy = points[b].y - points[a].y
    headings[i] = Math.atan2(dy, dx)
  }
  return headings
}

function smoothedCurvatureCircular(
  points: XYPoint[],
  smoothingHalfWindowM: number = 7.5,
  headingHalfStep: number = 3,
): {
  smoothed: number[]
  headings: number[]
  seg: number[]
  spacing: number
  smoothHalfSamples: number
} {
  const n = points.length
  const seg = pairwiseDistances(points)
  // Add wrap-around segment
  seg.push(Math.hypot(points[0].x - points[n - 1].x, points[0].y - points[n - 1].y))

  const spacing = median(seg.slice(0, -1))
  const smoothHalfSamples = Math.max(3, Math.round(smoothingHalfWindowM / spacing))

  const headings = sampleHeadingsCircular(points, headingHalfStep)

  // Raw curvature
  const curvature: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const nxt = (i + 1) % n
    curvature[nxt] = unwrapAngle(headings[nxt] - headings[i]) / Math.max(seg[i], 1e-6)
  }

  // Smooth with moving average (circular)
  const smoothed: number[] = []
  for (let i = 0; i < n; i++) {
    let sum = 0
    let count = 0
    for (let k = -smoothHalfSamples; k <= smoothHalfSamples; k++) {
      sum += curvature[((i + k) % n + n) % n]
      count++
    }
    smoothed.push(sum / count)
  }

  return { smoothed, headings, seg, spacing, smoothHalfSamples }
}

// ---- Circular distance ----

function circularDistance(arc: number[], trackLen: number, startIdx: number, endIdx: number): number {
  if (endIdx >= startIdx) {
    return arc[endIdx] - arc[startIdx]
  }
  return trackLen - arc[startIdx] + arc[endIdx]
}

// ---- Corner detection (circular) ----

function detectCornersCircular(
  arc: number[],
  trackLen: number,
  absCurvature: number[],
  threshold: number,
  minCornerLengthM: number = 10.0,
): CornerRegion[] {
  const n = absCurvature.length
  const mask = absCurvature.map((v) => v >= threshold)

  if (!mask.some(Boolean)) return []
  if (mask.every(Boolean)) {
    return trackLen >= minCornerLengthM ? [{ start: 0, end: n - 1 }] : []
  }

  // Find a starting point that is NOT in a corner
  let start0 = 0
  for (let i = 0; i < n; i++) {
    if (!mask[i]) {
      start0 = i
      break
    }
  }

  const corners: CornerRegion[] = []
  let active = false
  let startIdx = 0

  for (let step = 1; step <= n; step++) {
    const idx = (start0 + step) % n
    if (mask[idx] && !active) {
      startIdx = idx
      active = true
    }
    const nextIdx = (idx + 1) % n
    if (active && !mask[nextIdx]) {
      const endIdx = idx
      if (circularDistance(arc, trackLen, startIdx, endIdx) >= minCornerLengthM) {
        corners.push({ start: startIdx, end: endIdx })
      }
      active = false
    }
  }

  return corners
}

// ---- Threshold sweep ----

function sweepThreshold(
  arc: number[],
  trackLen: number,
  absCurvature: number[],
  minCornerLengthM: number = 10.0,
): Array<[number, number]> {
  const sweep: Array<[number, number]> = []
  for (let i = 5; i <= 30; i++) {
    const threshold = i / 1000
    const corners = detectCornersCircular(arc, trackLen, absCurvature, threshold, minCornerLengthM)
    sweep.push([threshold, corners.length])
  }
  return sweep
}

function selectThreshold(
  sweep: Array<[number, number]>,
  targetCount: number,
): { threshold: number | null; band: [number, number] | null } {
  const thresholds = sweep.filter(([, count]) => count === targetCount).map(([t]) => t)
  if (thresholds.length === 0) {
    return { threshold: null, band: null }
  }

  // Group into contiguous bands
  const bands: number[][] = []
  let band = [thresholds[0]]
  for (let i = 1; i < thresholds.length; i++) {
    if (Math.round((thresholds[i] - band[band.length - 1]) * 1000) === 1) {
      band.push(thresholds[i])
    } else {
      bands.push(band)
      band = [thresholds[i]]
    }
  }
  bands.push(band)

  // Pick the longest band
  const best = bands.reduce((a, b) => (a.length >= b.length ? a : b))
  const selected = Math.round(best[Math.floor(best.length / 2)] * 1000) / 1000
  return { threshold: selected, band: [best[0], best[best.length - 1]] }
}

// ---- Representative lap selection ----

function chooseRepresentativeLap(
  points: XYPoint[],
  timestamps: number[],
): LapCandidate {
  const seg = pairwiseDistances(points)
  const arc = cumulativeDistance(seg)

  // Compute headings for loop closure check
  const headings: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    headings.push(Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x))
  }
  headings.push(headings[headings.length - 1])

  const candidates: LapCandidate[] = []
  for (let i = 0; i < points.length; i += 80) {
    for (let j = i + 700; j < Math.min(i + 2200, points.length); j++) {
      const closureDist = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)
      if (closureDist > 1.5) continue

      const closureHeading = Math.abs(unwrapAngle(headings[i] - headings[j]))
      if (closureHeading > (12 * Math.PI) / 180) continue

      const lapTimeS = (timestamps[j] - timestamps[i]) / 1000.0
      if (lapTimeS < 49 || lapTimeS > 55) continue

      candidates.push({
        start: i,
        end: j,
        lapTimeS,
        lapLenM: arc[j] - arc[i],
        closureDistM: closureDist,
        closureHeadingRad: closureHeading,
      })
    }
  }

  if (candidates.length === 0) {
    throw new Error('No representative lap candidates found. Ensure data contains complete laps in the 49-55s range.')
  }

  // Sort by closeness to 52s, then closure distance, then heading
  const shortList = [...candidates]
    .sort((a, b) => {
      const dA = Math.abs(a.lapTimeS - 52.0)
      const dB = Math.abs(b.lapTimeS - 52.0)
      if (dA !== dB) return dA - dB
      if (a.closureDistM !== b.closureDistM) return a.closureDistM - b.closureDistM
      return a.closureHeadingRad - b.closureHeadingRad
    })
    .slice(0, 80)

  const medianLen = median(shortList.map((c) => c.lapLenM))
  return shortList.reduce((best, c) =>
    Math.abs(c.lapLenM - medianLen) < Math.abs(best.lapLenM - medianLen) ? c : best
  )
}

// ---- Rotate points so finish line is at index 0 ----

function rotatePoints(points: XYPoint[], finishIdx: number): XYPoint[] {
  return [...points.slice(finishIdx), ...points.slice(0, finishIdx), points[finishIdx]]
}

// ---- Linear heading (non-circular, clamped edges) ----

function linearHeading(points: XYPoint[], halfStep: number = 3): number[] {
  const n = points.length
  const headings: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - halfStep)
    const b = Math.min(n - 1, i + halfStep)
    headings[i] = Math.atan2(points[b].y - points[a].y, points[b].x - points[a].x)
  }
  return headings
}

// ---- Linear corner region detection ----

function detectLinearRegions(
  curvature: number[],
  arc: number[],
  threshold: number,
  minCornerLengthM: number = 10.0,
): CornerRegion[] {
  const mask = curvature.map((v) => Math.abs(v) >= threshold)
  const regions: CornerRegion[] = []
  let active = false
  let startIdx = 0

  for (let i = 0; i < mask.length; i++) {
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
  if (active) {
    const endIdx = mask.length - 1
    if (arc[endIdx] - arc[startIdx] >= minCornerLengthM) {
      regions.push({ start: startIdx, end: endIdx })
    }
  }

  return regions
}

// ---- Region angle ----

function regionAngle(headings: number[], start: number, end: number): number {
  let angle = 0
  for (let i = start; i < end; i++) {
    angle += unwrapAngle(headings[i + 1] - headings[i])
  }
  return angle
}

// ---- Longest straight (circular) ----

function longestStraight(
  corners: CornerRegion[],
  arc: number[],
  trackLen: number,
): { best: Straight; all: Straight[] } {
  const straights: Straight[] = []
  for (let i = 0; i < corners.length; i++) {
    const nextStart = corners[(i + 1) % corners.length].start
    const endIdx = corners[i].end
    const lengthM = circularDistance(arc, trackLen, endIdx, nextStart)
    const startM = arc[endIdx]
    const midM = (startM + lengthM / 2.0) % trackLen
    straights.push({
      fromCorner: i + 1,
      toCorner: (i + 1) % corners.length + 1,
      lengthM,
      midArcM: midM,
      startIdx: endIdx,
      endIdx: nextStart,
    })
  }
  const best = straights.reduce((a, b) => (a.lengthM >= b.lengthM ? a : b))
  return { best, all: straights }
}

// ---- Off-track detection helpers ----

function nearestPointOnPolyline(
  point: XYPoint,
  polyline: XYPoint[],
): { dist: number; arc: number; seg: number } {
  let bestD2 = Infinity
  let bestArc = 0
  let bestSeg = 0
  let acc = 0

  for (let i = 0; i < polyline.length - 1; i++) {
    const ax = polyline[i].x, ay = polyline[i].y
    const bx = polyline[i + 1].x, by = polyline[i + 1].y
    const dx = bx - ax, dy = by - ay
    const segLen2 = dx * dx + dy * dy
    let t = 0
    if (segLen2 > 0) {
      t = ((point.x - ax) * dx + (point.y - ay) * dy) / segLen2
      t = Math.max(0, Math.min(1, t))
    }
    const qx = ax + t * dx
    const qy = ay + t * dy
    const d2 = (point.x - qx) ** 2 + (point.y - qy) ** 2
    const segLen = Math.sqrt(segLen2)
    if (d2 < bestD2) {
      bestD2 = d2
      bestArc = acc + segLen * t
      bestSeg = i
    }
    acc += segLen
  }

  return { dist: Math.sqrt(bestD2), arc: bestArc, seg: bestSeg }
}

function offtrackSegmentsForThreshold(
  distances: number[],
  threshold: number,
  minSamples: number = 20,
): Array<[number, number]> {
  const segments: Array<[number, number]> = []
  let active = false
  let startIdx = 0

  for (let i = 0; i < distances.length; i++) {
    const off = distances[i] > threshold
    if (off && !active) {
      startIdx = i
      active = true
    } else if (active && !off) {
      const endIdx = i - 1
      if (endIdx - startIdx + 1 >= minSamples) {
        segments.push([startIdx, endIdx])
      }
      active = false
    }
  }
  if (active) {
    const endIdx = distances.length - 1
    if (endIdx - startIdx + 1 >= minSamples) {
      segments.push([startIdx, endIdx])
    }
  }

  return segments
}

function choosePitThreshold(
  distances: number[],
): { threshold: number; segments: Array<[number, number]> } | null {
  const candidates: Array<{ threshold: number; segments: Array<[number, number]> }> = []

  for (const threshold of [3, 4, 5, 6, 7, 8, 10, 12, 15]) {
    const segments = offtrackSegmentsForThreshold(distances, threshold, 100)
    if (
      segments.length === 2 &&
      segments[0][0] === 0 &&
      segments[segments.length - 1][1] === distances.length - 1
    ) {
      candidates.push({ threshold, segments })
    }
  }

  if (candidates.length === 0) return null

  // Find longest contiguous band
  const bands: Array<Array<{ threshold: number; segments: Array<[number, number]> }>> = []
  let band = [candidates[0]]
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].threshold - band[band.length - 1].threshold === 1) {
      band.push(candidates[i])
    } else {
      bands.push(band)
      band = [candidates[i]]
    }
  }
  bands.push(band)

  const bestBand = bands.reduce((a, b) => (a.length >= b.length ? a : b))
  return bestBand[Math.floor(bestBand.length / 2)]
}

function circularPointAlong(
  startArc: number,
  endArc: number,
  ratio: number,
  trackLen: number,
): number {
  let dist = endArc - startArc
  if (dist < 0) dist += trackLen
  return (startArc + dist * ratio) % trackLen
}

function detectOfftrackSegments(
  allPoints: XYPoint[],
  template: XYPoint[],
): {
  distances: number[]
  nearest: Array<{ dist: number; arc: number; seg: number }>
  pitThreshold: number | null
  pitSegments: Array<[number, number]>
} {
  const nearest = allPoints.map((pt) => nearestPointOnPolyline(pt, template))
  const distances = nearest.map((n) => n.dist)

  const pitChoice = choosePitThreshold(distances)
  return {
    distances,
    nearest,
    pitThreshold: pitChoice?.threshold ?? null,
    pitSegments: pitChoice?.segments ?? [],
  }
}

// ---- Finish line geometry ----

function computeFinishLineGeometry(
  finishXY: XYPoint,
  headingAtFinish: number,
  refPoints: GPSPoint[],
): { lat1: number; lng1: number; lat2: number; lng2: number } {
  // Create perpendicular line ~5m each side
  const halfWidth = 5 // meters
  const perpAngle = headingAtFinish + Math.PI / 2

  const p1: XYPoint = {
    x: finishXY.x + Math.cos(perpAngle) * halfWidth,
    y: finishXY.y + Math.sin(perpAngle) * halfWidth,
  }
  const p2: XYPoint = {
    x: finishXY.x - Math.cos(perpAngle) * halfWidth,
    y: finishXY.y - Math.sin(perpAngle) * halfWidth,
  }

  const ll1 = unprojectPoint(p1, refPoints)
  const ll2 = unprojectPoint(p2, refPoints)

  return { lat1: ll1.lat, lng1: ll1.lng, lat2: ll2.lat, lng2: ll2.lng }
}

// ---- Main analysis function ----

export function analyzeTrack(points: GPSPoint[]): TrackAnalysisResult {
  if (points.length < 100) {
    throw new Error('Not enough GPS points for track analysis.')
  }

  // 1. Project all points to XY
  const allXY = projectPoints(points)
  const timestamps = points.map((p) => p.time)

  // 2. Find representative lap
  const lap = chooseRepresentativeLap(allXY, timestamps)

  // 3. Extract lap points (circular: closed loop)
  const lapXY = allXY.slice(lap.start, lap.end + 1)

  // 4. Compute smoothed curvature on the circular lap
  const { smoothed, seg, spacing, smoothHalfSamples } = smoothedCurvatureCircular(lapXY)
  const trackLen = seg.reduce((a, b) => a + b, 0)
  const arc = cumulativeDistance(seg.slice(0, -1))

  // 5. Sweep threshold to find 10 corners
  const sweep = sweepThreshold(arc, trackLen, smoothed.map(Math.abs))

  let result = selectThreshold(sweep, 10)

  // If no band for 10 corners, try 9 then 11
  if (result.threshold === null) {
    result = selectThreshold(sweep, 9)
  }
  if (result.threshold === null) {
    result = selectThreshold(sweep, 11)
  }
  if (result.threshold === null) {
    throw new Error('Could not find a stable corner threshold band.')
  }

  const threshold = result.threshold
  const thresholdBand = result.band!

  // 6. Detect corners on circular lap
  const corners = detectCornersCircular(arc, trackLen, smoothed.map(Math.abs), threshold)

  // 7. Find longest straight -> finish line position
  const { best: finish } = longestStraight(corners, arc, trackLen)

  // 8. Find the point index closest to the finish line arc position
  let finishIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < lapXY.length; i++) {
    const d = Math.abs(
      ((arc[i] - finish.midArcM + trackLen / 2) % trackLen) - trackLen / 2
    )
    if (d < bestDist) {
      bestDist = d
      finishIdx = i
    }
  }

  // 9. Rotate lap so finish is at index 0
  let lapRot = rotatePoints(lapXY, finishIdx)

  // 10. Pit-biased finish line detection
  const offtrack = detectOfftrackSegments(allXY, lapRot)
  let finishSource: 'longest_straight' | 'pit_biased' = 'longest_straight'

  if (offtrack.pitThreshold !== null && offtrack.pitSegments.length === 2) {
    const pitOutSegment = offtrack.pitSegments[0]
    const pitInSegment = offtrack.pitSegments[1]
    const pitFinishArc = circularPointAlong(
      offtrack.nearest[pitInSegment[0]].arc,
      offtrack.nearest[pitOutSegment[1]].arc,
      PIT_FINISH_BIAS,
      trackLen,
    )

    const currentArc = cumulativeDistance(pairwiseDistances(lapRot))
    let pitFinishIdx = 0
    let bestPitDist = Infinity
    for (let i = 0; i < lapRot.length - 1; i++) {
      const d = Math.abs(
        ((currentArc[i] - pitFinishArc + trackLen / 2) % trackLen) - trackLen / 2
      )
      if (d < bestPitDist) {
        bestPitDist = d
        pitFinishIdx = i
      }
    }

    // Remove the duplicate last point before re-rotating
    lapRot = rotatePoints(lapRot.slice(0, -1), pitFinishIdx)
    finishSource = 'pit_biased'
  }

  // 11. Re-compute curvature on rotated lap (linear, not circular)
  const seg2 = pairwiseDistances(lapRot)
  const arc2 = cumulativeDistance(seg2)
  const headings2 = linearHeading(lapRot)

  const curvature2: number[] = new Array(lapRot.length).fill(0)
  for (let i = 1; i < lapRot.length; i++) {
    curvature2[i] = unwrapAngle(headings2[i] - headings2[i - 1]) / Math.max(seg2[i - 1], 1e-6)
  }

  const smoothed2: number[] = new Array(lapRot.length).fill(0)
  for (let i = 0; i < lapRot.length; i++) {
    const lo = Math.max(0, i - smoothHalfSamples)
    const hi = Math.min(lapRot.length - 1, i + smoothHalfSamples)
    let sum = 0
    for (let k = lo; k <= hi; k++) {
      sum += curvature2[k]
    }
    smoothed2[i] = sum / (hi - lo + 1)
  }

  // 12. Detect corners on rotated lap (linear)
  const regions2 = detectLinearRegions(smoothed2, arc2, threshold)

  // 13. Build reported corners
  const reportedCorners: TrackAnalysisCorner[] = regions2.map((region, idx) => {
    let apexIdx = region.start
    let maxAbsCurv = 0
    for (let i = region.start; i <= region.end; i++) {
      if (Math.abs(smoothed2[i]) > maxAbsCurv) {
        maxAbsCurv = Math.abs(smoothed2[i])
        apexIdx = i
      }
    }

    const angle = regionAngle(headings2, region.start, region.end)

    return {
      name: `T${idx + 1}`,
      startIndex: region.start,
      apexIndex: apexIdx,
      endIndex: region.end,
      startDistance: arc2[region.start],
      apexDistance: arc2[apexIdx],
      endDistance: arc2[region.end],
      length: arc2[region.end] - arc2[region.start],
      direction: (angle > 0 ? 'left' : 'right') as 'left' | 'right',
      angleDeg: Math.abs(angle * 180 / Math.PI),
    }
  })

  // 14. Compute start/finish line geometry in lat/lng
  // Use the heading at the first point of the rotated lap
  const finishHeading = linearHeading(lapRot, 3)[0]
  const finishXY = lapRot[0]
  const sfLine = computeFinishLineGeometry(finishXY, finishHeading, points)

  // Compute the arc position of the finish line (which is 0 on the rotated lap)
  const sfArcPosition = 0

  return {
    representativeLap: {
      startIndex: lap.start,
      endIndex: lap.end,
      lapTime: lap.lapTimeS,
      lapLength: lap.lapLenM,
    },
    startFinishLine: {
      ...sfLine,
      arcPosition: sfArcPosition,
      source: finishSource,
    },
    corners: reportedCorners,
    trackLength: trackLen,
    sampleSpacing: spacing,
    threshold,
    thresholdBand,
  }
}
