import type { Corner, Lap, GPSPoint } from '../../types'
import type {
  CornerRelationship,
  CornerSemantic,
  StraightSemantic,
  TrackSemanticModel,
} from './semantic-types'

const EARTH_RADIUS_M = 6_371_000
const SHORT_CONNECTOR_MAX_M = 25

function distanceM(a: GPSPoint, b: GPSPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

function clampIndex(idx: number, n: number): number {
  if (n === 0) return 0
  if (idx < 0) return 0
  if (idx >= n) return n - 1
  return idx
}

function segmentDistanceCircular(points: GPSPoint[], fromIndex: number, toIndex: number): number {
  const n = points.length
  if (n < 2) return 0

  const from = clampIndex(fromIndex, n)
  const to = clampIndex(toIndex, n)
  if (from === to) return 0

  let total = 0
  if (to > from) {
    for (let i = from; i < to; i++) {
      total += distanceM(points[i], points[i + 1])
    }
    return total
  }

  for (let i = from; i < n - 1; i++) {
    total += distanceM(points[i], points[i + 1])
  }
  total += distanceM(points[n - 1], points[0])
  for (let i = 0; i < to; i++) {
    total += distanceM(points[i], points[i + 1])
  }
  return total
}

function toCornerSemantic(corner: Corner): CornerSemantic {
  return {
    cornerId: corner.id,
    name: corner.name,
    direction: corner.direction,
    type: corner.type,
    startIndex: corner.startIndex,
    endIndex: corner.endIndex,
    apexIndex: corner.apexIndex,
  }
}

export function buildTrackSkeleton(args: {
  corners: Corner[]
  referenceLap: Lap
}): Pick<TrackSemanticModel, 'corners' | 'straights' | 'relationships'> {
  const orderedCorners = [...args.corners].sort((a, b) => a.startIndex - b.startIndex)

  if (orderedCorners.length === 0) {
    return {
      corners: [],
      straights: [],
      relationships: [],
    }
  }

  const corners = orderedCorners.map(toCornerSemantic)
  const straights: StraightSemantic[] = []
  const relationships: CornerRelationship[] = []

  for (let i = 0; i < orderedCorners.length; i++) {
    const fromCorner = orderedCorners[i]
    const toCorner = orderedCorners[(i + 1) % orderedCorners.length]
    const wrapsLap = i === orderedCorners.length - 1

    const lengthM = segmentDistanceCircular(
      args.referenceLap.points,
      fromCorner.endIndex,
      toCorner.startIndex,
    )

    straights.push({
      fromCornerId: fromCorner.id,
      toCornerId: toCorner.id,
      fromCornerName: fromCorner.name,
      toCornerName: toCorner.name,
      startIndex: fromCorner.endIndex,
      endIndex: toCorner.startIndex,
      lengthM,
      wrapsLap,
    })

    if (lengthM <= SHORT_CONNECTOR_MAX_M) {
      relationships.push({
        type: 'compound-candidate',
        fromCornerId: fromCorner.id,
        toCornerId: toCorner.id,
        viaStraightLengthM: lengthM,
      })
    }
  }

  return {
    corners,
    straights,
    relationships,
  }
}
