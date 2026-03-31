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

function assertIndexInRange(index: number, pointCount: number, label: string): void {
  if (!Number.isInteger(index)) {
    throw new Error(`Corner ${label} index must be an integer, got ${index}`)
  }
  if (index < 0 || index >= pointCount) {
    throw new Error(
      `Corner ${label} index ${index} is out of range for reference lap with ${pointCount} points`,
    )
  }
}

function assertCornerIndicesInRange(corner: Corner, pointCount: number): void {
  assertIndexInRange(corner.startIndex, pointCount, `${corner.name}.startIndex`)
  assertIndexInRange(corner.endIndex, pointCount, `${corner.name}.endIndex`)
  assertIndexInRange(corner.apexIndex, pointCount, `${corner.name}.apexIndex`)
}

function segmentDistanceCircular(points: GPSPoint[], fromIndex: number, toIndex: number): number {
  const n = points.length
  if (n < 2) return 0

  if (fromIndex === toIndex) return 0

  let total = 0
  if (toIndex > fromIndex) {
    for (let i = fromIndex; i < toIndex; i++) {
      total += distanceM(points[i], points[i + 1])
    }
    return total
  }

  for (let i = fromIndex; i < n - 1; i++) {
    total += distanceM(points[i], points[i + 1])
  }
  total += distanceM(points[n - 1], points[0])
  for (let i = 0; i < toIndex; i++) {
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
  const pointCount = args.referenceLap.points.length

  if (orderedCorners.length === 0 || pointCount < 2) {
    return {
      corners: [],
      straights: [],
      relationships: [],
    }
  }

  for (const corner of orderedCorners) {
    // Contract: corner start/end/apex indices are inclusive references into referenceLap.points.
    assertCornerIndicesInRange(corner, pointCount)
  }

  const corners = orderedCorners.map(toCornerSemantic)
  const straights: StraightSemantic[] = []
  const relationships: CornerRelationship[] = []

  if (orderedCorners.length < 2) {
    return {
      corners,
      straights: [],
      relationships: [],
    }
  }

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
