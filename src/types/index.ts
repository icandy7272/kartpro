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
  entrySpeed: number
  minSpeed: number
  exitSpeed: number
  duration: number
}

export interface LapAnalysis {
  lap: Lap
  corners: Corner[]
  sectorTimes: number[] // time per corner segment
}

export interface TrainingSession {
  id: string
  filename: string
  date: Date
  laps: Lap[]
  analyses: LapAnalysis[]
  startFinishLine?: { lat1: number; lng1: number; lat2: number; lng2: number }
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIConfig {
  endpoint: string
  apiKey: string
  model: string
}
