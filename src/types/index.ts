export interface GPSPoint {
  lat: number
  lng: number
  speed: number // m/s
  time: number // ms timestamp
  altitude: number
}

export interface Lap {
  id: number
  points: GPSPoint[]
  startTime: number
  endTime: number
  duration: number // seconds
  distance: number // meters
  maxSpeed: number
  avgSpeed: number
}

export interface Corner {
  id: number
  name: string // T1, T2, etc.
  startIndex: number
  endIndex: number
  midpointIndex: number // index of the apex point (max curvature) within the lap
  apexIndex: number // index of the apex point (max curvature) within the lap
  apexDistance?: number // distance along track to apex in meters
  direction: 'left' | 'right'
  angle: number // absolute accumulated heading change in degrees
  type: string // corner classification (e.g. 高速弯, 中速弯, 低速弯)
  entrySpeed: number
  minSpeed: number
  exitSpeed: number
  duration: number
}

export interface LapAnalysis {
  lap: Lap
  corners: Corner[]
  sectorTimes: number[] // time per corner segment
  remainingTime: number // time from last entry ref line to lap end
}

export interface TrainingSession {
  id: string
  filename: string
  date: Date
  laps: Lap[]
  analyses: LapAnalysis[]
  corners: Corner[] // master corner list from fastest lap
  startFinishLine?: { lat1: number; lng1: number; lat2: number; lng2: number }
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface TrackProfile {
  id: string
  name: string // user-editable track name
  centerLat: number
  centerLng: number
  startFinishLine: { lat1: number; lng1: number; lat2: number; lng2: number }
  corners: { lat: number; lng: number; name: string }[] // corner positions on track
  createdAt: number
  updatedAt: number
}

export interface AIConfig {
  endpoint: string
  apiKey: string
  model: string
}

// Racing line analysis types

export interface RacingLineDeviation {
  pointIndex: number
  lateralOffset: number // meters, positive = wider/outside, negative = tighter/inside
  refArcLength: number // meters along reference line
}

export interface BrakeThrottlePoint {
  pointIndex: number
  lat: number
  lng: number
  trackDistance: number // meters along track
  speed: number // km/h
}

export interface CornerLineAnalysis {
  cornerName: string
  meanDeviation: number // meters, signed
  maxDeviation: number // meters, absolute
  stdDeviation: number // meters
  deviations: RacingLineDeviation[]
  brakePoint: BrakeThrottlePoint | null
  throttlePoint: BrakeThrottlePoint | null
  refBrakePoint: BrakeThrottlePoint | null
  refThrottlePoint: BrakeThrottlePoint | null
  curvatureConsistency: number // 0-100
}

export interface RacingLineAnalysis {
  referenceLapId: number
  comparisonLapId: number
  corners: CornerLineAnalysis[]
  overallConsistency: number // 0-100
}
