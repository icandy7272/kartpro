import type { Corner, Lap, GPSPoint } from '../../../types'

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
