import type { Corner, Lap, GPSPoint } from '../../../types'
import { inferTrackSemantics } from '../semantic-inference'
import { rebuildSessionDerivedData } from '../session-derived-data'
import type { InferTrackSemanticsArgs } from '../semantic-types'

const BASE_LAT = 31.2304
const BASE_LNG = 121.4737
const METERS_PER_LAT_DEG = 111_320
const METERS_PER_LNG_DEG = METERS_PER_LAT_DEG * Math.cos((BASE_LAT * Math.PI) / 180)

function makePoint(lat: number, lng: number, speed: number, time: number): GPSPoint {
  return {
    lat,
    lng,
    speed,
    time,
    altitude: 0,
  }
}

function makeMeterPoint(xM: number, yM: number, speed: number, time: number): GPSPoint {
  return makePoint(
    BASE_LAT + yM / METERS_PER_LAT_DEG,
    BASE_LNG + xM / METERS_PER_LNG_DEG,
    speed,
    time,
  )
}

export function makeReferenceLap(): Lap {
  const points: GPSPoint[] = [
    makeMeterPoint(0, 0, 30, 0),              // 0
    makeMeterPoint(30, 0, 30, 1000),          // 1
    makeMeterPoint(50, 0, 22, 2000),          // 2
    makeMeterPoint(58, 0, 20, 3000),          // 3
    makeMeterPoint(-32, 0, 30, 4000),         // 4
    makeMeterPoint(-44, 0, 32, 5000),         // 5
    makeMeterPoint(-52, 0, 20, 6000),         // 6
    makeMeterPoint(-34.6538, 36.0421, 28, 7000), // 7
  ]

  return {
    id: 101,
    points,
    startTime: 0,
    endTime: 7000,
    duration: 7,
    distance: 258,
    maxSpeed: 32 * 3.6,
    avgSpeed: 27 * 3.6,
  }
}

export function makeSemanticCorners(): Corner[] {
  return [
    {
      id: 1,
      name: 'T1',
      startIndex: 2,
      endIndex: 3,
      midpointIndex: 2,
      apexIndex: 2,
      direction: 'right',
      angle: 45,
      type: '中速弯',
      entrySpeed: 100,
      minSpeed: 80,
      exitSpeed: 95,
      duration: 1.2,
    },
    {
      id: 2,
      name: 'T2',
      startIndex: 4,
      endIndex: 4,
      midpointIndex: 4,
      apexIndex: 4,
      direction: 'left',
      angle: 35,
      type: '中速弯',
      entrySpeed: 98,
      minSpeed: 78,
      exitSpeed: 92,
      duration: 1.0,
    },
    {
      id: 3,
      name: 'T3',
      startIndex: 5,
      endIndex: 6,
      midpointIndex: 5,
      apexIndex: 5,
      direction: 'right',
      angle: 50,
      type: '低速弯',
      entrySpeed: 95,
      minSpeed: 70,
      exitSpeed: 90,
      duration: 1.3,
    },
  ]
}

export function makeSingleSemanticCorner(): Corner[] {
  return [makeSemanticCorners()[0]]
}

export function makeOutOfRangeSemanticCorners(): Corner[] {
  const corners = makeSemanticCorners()
  return [
    corners[0],
    {
      ...corners[1],
      startIndex: 999,
    },
  ]
}

export function makeInferenceReferenceLap(): Lap {
  const points: GPSPoint[] = [
    makeMeterPoint(0, 0, 28, 0), // 0
    makeMeterPoint(20, 0, 28, 1000), // 1
    makeMeterPoint(40, 0, 24, 2000), // 2
    makeMeterPoint(55, 5, 24, 3000), // 3
    makeMeterPoint(70, 15, 22, 4000), // 4
    makeMeterPoint(100, 20, 25, 5000), // 5
    makeMeterPoint(130, 20, 20, 6000), // 6
    makeMeterPoint(200, 20, 30, 7000), // 7
    makeMeterPoint(240, 20, 32, 8000), // 8
    makeMeterPoint(250, 25, 24, 9000), // 9
    makeMeterPoint(260, 30, 22, 10000), // 10
    makeMeterPoint(268, 32, 20, 11000), // 11
    makeMeterPoint(280, 45, 26, 12000), // 12
    makeMeterPoint(300, 60, 28, 13000), // 13
  ]

  return {
    id: 202,
    points,
    startTime: 0,
    endTime: 13000,
    duration: 13,
    distance: 360,
    maxSpeed: 32 * 3.6,
    avgSpeed: 25 * 3.6,
  }
}

export function makeInferenceCorners(): Corner[] {
  return [
    {
      id: 1,
      name: 'T1',
      startIndex: 2,
      endIndex: 2,
      midpointIndex: 2,
      apexIndex: 2,
      direction: 'right',
      angle: 40,
      type: '中速弯',
      entrySpeed: 98,
      minSpeed: 84,
      exitSpeed: 95,
      duration: 1.0,
    },
    {
      id: 2,
      name: 'T2',
      startIndex: 4,
      endIndex: 4,
      midpointIndex: 4,
      apexIndex: 4,
      direction: 'left',
      angle: 45,
      type: '中速弯',
      entrySpeed: 92,
      minSpeed: 80,
      exitSpeed: 88,
      duration: 1.1,
    },
    {
      id: 3,
      name: 'T3',
      startIndex: 6,
      endIndex: 6,
      midpointIndex: 6,
      apexIndex: 6,
      direction: 'right',
      angle: 55,
      type: '低速弯',
      entrySpeed: 90,
      minSpeed: 74,
      exitSpeed: 96,
      duration: 1.2,
    },
    {
      id: 4,
      name: 'T4',
      startIndex: 9,
      endIndex: 9,
      midpointIndex: 9,
      apexIndex: 9,
      direction: 'left',
      angle: 38,
      type: '中速弯',
      entrySpeed: 94,
      minSpeed: 79,
      exitSpeed: 90,
      duration: 1.0,
    },
    {
      id: 5,
      name: 'T5',
      startIndex: 10,
      endIndex: 10,
      midpointIndex: 10,
      apexIndex: 10,
      direction: 'right',
      angle: 30,
      type: '低速弯',
      entrySpeed: 86,
      minSpeed: 72,
      exitSpeed: 84,
      duration: 0.8,
    },
    {
      id: 6,
      name: 'T6',
      startIndex: 11,
      endIndex: 11,
      midpointIndex: 11,
      apexIndex: 11,
      direction: 'right',
      angle: 28,
      type: '低速弯',
      entrySpeed: 84,
      minSpeed: 70,
      exitSpeed: 88,
      duration: 0.8,
    },
  ]
}

export function makeInferenceFixture(): InferTrackSemanticsArgs {
  const referenceLap = makeInferenceReferenceLap()
  return {
    trackId: 'track-inference-fixture',
    version: 1,
    sourceLapId: referenceLap.id,
    referenceLap,
    corners: makeInferenceCorners(),
  }
}

export function makeSessionFixture(): {
  laps: Lap[]
  corners: Corner[]
  startFinishLine?: { lat1: number; lng1: number; lat2: number; lng2: number }
  filename: string
  date: Date
  trackId: string
  fastestLapId: number
  previousPendingConfirmations: ReturnType<typeof inferTrackSemantics>['pendingConfirmations']
} {
  const referenceLap = makeInferenceReferenceLap()
  const slowerLap: Lap = {
    ...referenceLap,
    id: referenceLap.id + 1,
    startTime: referenceLap.startTime + 1000,
    endTime: referenceLap.endTime + 2000,
    duration: referenceLap.duration + 1,
    points: referenceLap.points.map((point) => ({
      ...point,
      time: point.time + 1000,
    })),
  }
  const corners = makeInferenceCorners()
  const fastestLapId = referenceLap.id
  const trackId = 'session-fixture-track'

  return {
    laps: [referenceLap, slowerLap],
    corners,
    filename: 'session-fixture.vbo',
    date: new Date('2026-03-30T00:00:00Z'),
    trackId,
    fastestLapId,
    previousPendingConfirmations: inferTrackSemantics({
      trackId,
      corners,
      referenceLap,
      sourceLapId: fastestLapId,
    }).pendingConfirmations,
  }
}

export function makeCoachingFixture(): {
  laps: Lap[]
  corners: Corner[]
  analyses: ReturnType<typeof rebuildSessionDerivedData>['analyses']
  semanticModel: NonNullable<ReturnType<typeof rebuildSessionDerivedData>['trackSemantics']>
} {
  const fixture = makeSessionFixture()
  const rebuilt = rebuildSessionDerivedData(fixture)

  if (!rebuilt.trackSemantics) {
    throw new Error('Expected coaching fixture to produce a semantic model')
  }

  const compoundCandidate = rebuilt.trackSemantics.pendingConfirmations.find(
    (candidate) =>
      candidate.tagType === 'compound-corner' &&
      candidate.targetCornerIds[0] === 5 &&
      candidate.targetCornerIds[1] === 6,
  )

  if (!compoundCandidate) {
    throw new Error('Expected coaching fixture to include a T5/T6 compound confirmation candidate')
  }

  return {
    laps: fixture.laps,
    corners: fixture.corners,
    analyses: rebuilt.analyses,
    semanticModel: {
      ...rebuilt.trackSemantics,
      semanticTags: [
        ...rebuilt.trackSemantics.semanticTags,
        {
          id: 'must-hit-exit:4',
          tagType: 'must-hit-exit',
          targetCornerIds: [4],
          confidence: 0.88,
          reasonCodes: ['EXIT_SPEED_PROPAGATES'],
          explanation: 'T4 should be treated as an exit-priority corner in this fixture.',
          status: 'confirmed-active',
        },
        {
          id: compoundCandidate.id,
          tagType: compoundCandidate.tagType,
          targetCornerIds: compoundCandidate.targetCornerIds,
          confidence: 0.82,
          reasonCodes: ['ADJACENT_SHORT_STRAIGHT', 'LINKED_RHYTHM_PATTERN'],
          explanation: 'T5 and T6 should be coached as one linked compound corner.',
          status: 'confirmed-active',
          sourceTagId: compoundCandidate.id,
        },
      ],
      pendingConfirmations: rebuilt.trackSemantics.pendingConfirmations.filter(
        (candidate) => candidate.id !== compoundCandidate.id,
      ),
    },
  }
}
