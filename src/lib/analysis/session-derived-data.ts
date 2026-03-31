import type { Corner, GPSPoint, Lap, LapAnalysis, TrainingSession } from '../../types'
import { inferTrackSemantics } from './semantic-inference'

const DEFAULT_TRACK_SEMANTIC_VERSION = 1

function haversineDistance(a: GPSPoint, b: GPSPoint): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

function createApexReferenceLine(
  refPoints: GPSPoint[],
  apexIdx: number,
  widthDeg: number = 0.00005,
): { lat1: number; lng1: number; lat2: number; lng2: number } {
  const idx = Math.min(apexIdx, refPoints.length - 2)
  const dx = refPoints[Math.min(idx + 1, refPoints.length - 1)].lat - refPoints[Math.max(idx - 1, 0)].lat
  const dy = refPoints[Math.min(idx + 1, refPoints.length - 1)].lng - refPoints[Math.max(idx - 1, 0)].lng
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-12) {
    return {
      lat1: refPoints[idx].lat,
      lng1: refPoints[idx].lng,
      lat2: refPoints[idx].lat,
      lng2: refPoints[idx].lng,
    }
  }
  const perpLat = (-dy / len) * widthDeg
  const perpLng = (dx / len) * widthDeg
  return {
    lat1: refPoints[idx].lat - perpLat,
    lng1: refPoints[idx].lng - perpLng,
    lat2: refPoints[idx].lat + perpLat,
    lng2: refPoints[idx].lng + perpLng,
  }
}

function findCrossingTime(
  lapPoints: GPSPoint[],
  refLine: { lat1: number; lng1: number; lat2: number; lng2: number },
  searchCenter: number,
  searchRadius: number = 50,
): number | null {
  const startSearch = Math.max(0, searchCenter - searchRadius)
  const endSearch = Math.min(lapPoints.length - 2, searchCenter + searchRadius)

  let bestT: number | null = null
  let bestDist = Infinity

  for (let i = startSearch; i <= endSearch; i++) {
    const d1x = lapPoints[i + 1].lat - lapPoints[i].lat
    const d1y = lapPoints[i + 1].lng - lapPoints[i].lng
    const d2x = refLine.lat2 - refLine.lat1
    const d2y = refLine.lng2 - refLine.lng1
    const denom = d1x * d2y - d1y * d2x
    if (Math.abs(denom) < 1e-15) continue
    const qpx = refLine.lat1 - lapPoints[i].lat
    const qpy = refLine.lng1 - lapPoints[i].lng
    const t = (qpx * d2y - qpy * d2x) / denom
    const u = (qpx * d1y - qpy * d1x) / denom
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const dist = Math.abs(i - searchCenter)
      if (dist < bestDist) {
        bestDist = dist
        bestT = lapPoints[i].time + t * (lapPoints[i + 1].time - lapPoints[i].time)
      }
    }
  }
  return bestT
}

function analyzeLap(lap: Lap, corners: Corner[], refPoints: GPSPoint[]): LapAnalysis {
  const lapPoints = lap.points
  if (corners.length === 0) {
    return {
      lap,
      corners: [],
      sectorTimes: [],
      remainingTime: (lap.endTime - lap.startTime) / 1000,
    }
  }

  const entryRefLines = corners.map((corner) => {
    const entryIdx = Math.min(corner.startIndex, refPoints.length - 2)
    return createApexReferenceLine(refPoints, entryIdx)
  })

  const lapCorners: Corner[] = corners.map((corner) => {
    const refMidIdx = Math.min(Math.floor((corner.startIndex + corner.endIndex) / 2), refPoints.length - 1)
    const refPoint = refPoints[refMidIdx]

    let bestStart = 0
    let bestDist = Infinity
    for (let i = 0; i < lapPoints.length; i++) {
      const d = haversineDistance(lapPoints[i], refPoint)
      if (d < bestDist) {
        bestDist = d
        bestStart = i
      }
    }

    const halfLen = Math.floor((corner.endIndex - corner.startIndex) / 2)
    const start = Math.max(0, bestStart - halfLen)
    const end = Math.min(lapPoints.length - 1, bestStart + halfLen)

    let minSpd = Infinity
    for (let i = start; i <= end; i++) {
      minSpd = Math.min(minSpd, lapPoints[i].speed)
    }

    const entryIdx = Math.max(0, start - 3)
    const exitIdx = Math.min(lapPoints.length - 1, end + 3)

    return {
      ...corner,
      startIndex: start,
      endIndex: end,
      entrySpeed: lapPoints[entryIdx].speed * 3.6,
      minSpeed: minSpd * 3.6,
      exitSpeed: lapPoints[exitIdx].speed * 3.6,
      duration: 0,
    }
  })

  const entryTimes: (number | null)[] = lapCorners.map((corner, index) => {
    const searchCenter = corner.startIndex
    return findCrossingTime(lapPoints, entryRefLines[index], searchCenter)
  })

  for (let i = 0; i < lapCorners.length; i++) {
    const currentEntryTime = entryTimes[i]
    const previousEntryTime = i === 0 ? lap.startTime : entryTimes[i - 1]

    if (currentEntryTime !== null && previousEntryTime !== null) {
      lapCorners[i].duration = (currentEntryTime - previousEntryTime) / 1000
    } else {
      const sectorStart = i === 0 ? 0 : lapCorners[i - 1].startIndex
      const sectorEnd = lapCorners[i].startIndex
      if (sectorStart < lapPoints.length && sectorEnd < lapPoints.length) {
        lapCorners[i].duration = (lapPoints[sectorEnd].time - lapPoints[sectorStart].time) / 1000
      }
    }
  }

  const lastEntryTime = entryTimes[entryTimes.length - 1]
  const remainingTime = lastEntryTime !== null ? (lap.endTime - lastEntryTime) / 1000 : 0
  const sectorTimes = lapCorners.map((corner) => corner.duration)

  return { lap, corners: lapCorners, sectorTimes, remainingTime }
}

export function rebuildSessionDerivedData(args: {
  laps: Lap[]
  corners: Corner[]
  startFinishLine?: TrainingSession['startFinishLine']
  filename: string
  date: Date
  trackId?: string
}): Pick<TrainingSession, 'analyses' | 'trackSemantics'> {
  if (args.laps.length === 0) {
    return { analyses: [], trackSemantics: undefined }
  }

  const referenceLap = args.laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), args.laps[0])
  const analyses = args.laps.map((lap) => analyzeLap(lap, args.corners, referenceLap.points))

  if (args.corners.length === 0 || referenceLap.points.length < 2) {
    return {
      analyses,
      trackSemantics: undefined,
    }
  }

  const trackSemantics = inferTrackSemantics({
    trackId: args.trackId ?? args.filename,
    version: DEFAULT_TRACK_SEMANTIC_VERSION,
    sourceLapId: referenceLap.id,
    referenceLap,
    corners: args.corners,
  })

  return {
    analyses,
    trackSemantics,
  }
}
