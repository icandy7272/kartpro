import type { GPSPoint } from '../types'

export interface VBOParseResult {
  points: GPSPoint[]
  sessionName: string
  startFinishLine?: { lat1: number; lng1: number; lat2: number; lng2: number }
  date: Date
}

/**
 * Parse a VBO file exported by RaceChrono Pro or VBOX data loggers.
 *
 * Coordinate format: values are total decimal minutes.
 *   lat_degrees = value / 60
 *   lon_degrees = -(value) / 60   (RaceChrono inverts the E/W sign)
 *
 * Time format: HHMMSS.CC  (CC = centiseconds)
 * Velocity: km/h in file, converted to m/s for GPSPoint
 */
export function parseVBO(text: string): VBOParseResult {
  const normalizedText = normalizeLineEndings(text)
  const sections = parseSections(normalizedText)

  const sessionName = parseSessionName(sections['session data'] ?? '')
  const columnNames = parseColumnNames(sections['column names'] ?? '')
  const points = parseDataRows(sections['data'] ?? '', columnNames)
  const startFinishLine = parseLaptiming(sections['laptiming'] ?? '', points)
  const date = extractDate(normalizedText, points)

  if (points.length === 0) {
    throw new Error('No valid GPS data found in VBO file.')
  }

  return { points, sessionName, startFinishLine, date }
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function parseSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const lines = text.split(/\r?\n/)
  let currentSection = ''
  let currentContent: string[] = []

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim()
      }
      currentSection = sectionMatch[1]
      currentContent = []
    } else if (currentSection) {
      currentContent.push(line)
    }
  }

  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim()
  }

  return sections
}

function parseSessionName(content: string): string {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^name\s+(.+)$/)
    if (match) return match[1].trim()
  }
  return 'Unknown Session'
}

function parseLaptiming(
  content: string,
  points: GPSPoint[]
): { lat1: number; lng1: number; lat2: number; lng2: number } | undefined {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^Start\s+([-+]?\d+\.?\d*)\s+([-+]?\d+\.?\d*)\s+([-+]?\d+\.?\d*)\s+([-+]?\d+\.?\d*)/)
    if (match) {
      const values = match.slice(1).map((value) => parseFloat(value))
      const candidates = [
        {
          lat1: values[1] / 60,
          lng1: -values[0] / 60,
          lat2: values[3] / 60,
          lng2: -values[2] / 60,
        },
        {
          lat1: values[0] / 60,
          lng1: -values[1] / 60,
          lat2: values[2] / 60,
          lng2: -values[3] / 60,
        },
      ]

      return chooseBestLaptimingCandidate(candidates, points)
    }
  }
  return undefined
}

function chooseBestLaptimingCandidate(
  candidates: Array<{ lat1: number; lng1: number; lat2: number; lng2: number }>,
  points: GPSPoint[]
): { lat1: number; lng1: number; lat2: number; lng2: number } | undefined {
  const validCandidates = candidates.filter(isValidStartFinishLine)
  if (validCandidates.length === 0) return undefined
  if (validCandidates.length === 1 || points.length === 0) return validCandidates[0]

  let centerLat = 0
  let centerLng = 0
  for (const point of points) {
    centerLat += point.lat
    centerLng += point.lng
  }
  centerLat /= points.length
  centerLng /= points.length

  return validCandidates.reduce((best, candidate) =>
    startFinishDistanceScore(candidate, centerLat, centerLng) < startFinishDistanceScore(best, centerLat, centerLng)
      ? candidate
      : best
  )
}

function isValidStartFinishLine(sf: { lat1: number; lng1: number; lat2: number; lng2: number }): boolean {
  return isValidCoordinate(sf.lat1, sf.lng1) && isValidCoordinate(sf.lat2, sf.lng2)
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function startFinishDistanceScore(
  sf: { lat1: number; lng1: number; lat2: number; lng2: number },
  centerLat: number,
  centerLng: number
): number {
  const midLat = (sf.lat1 + sf.lat2) / 2
  const midLng = (sf.lng1 + sf.lng2) / 2
  return Math.abs(midLat - centerLat) + Math.abs(midLng - centerLng)
}

function parseColumnNames(content: string): string[] {
  const trimmed = content.trim()
  if (!trimmed) return []
  return trimmed.split(/\s+/)
}

function parseDataRows(content: string, columnNames: string[]): GPSPoint[] {
  if (columnNames.length === 0) {
    throw new Error('VBO file has no column names defined.')
  }

  const latIdx = columnNames.indexOf('lat')
  const lonIdx = columnNames.indexOf('long')
  const timeIdx = columnNames.indexOf('time')
  const velocityIdx = columnNames.indexOf('velocity')
  const heightIdx = columnNames.indexOf('height')

  if (latIdx === -1 || lonIdx === -1) {
    throw new Error('VBO file missing required lat/long columns.')
  }
  if (timeIdx === -1) {
    throw new Error('VBO file missing required time column.')
  }

  const points: GPSPoint[] = []
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const fields = trimmed.split(/\s+/)
    if (fields.length < columnNames.length) continue

    const latRaw = parseFloat(fields[latIdx])
    const lonRaw = parseFloat(fields[lonIdx])
    const timeRaw = fields[timeIdx]
    const velocity = velocityIdx !== -1 ? parseFloat(fields[velocityIdx]) : 0
    const height = heightIdx !== -1 ? parseFloat(fields[heightIdx]) : 0

    if (isNaN(latRaw) || isNaN(lonRaw)) continue

    // Convert from total decimal minutes to degrees
    const lat = latRaw / 60
    const lng = -lonRaw / 60 // RaceChrono inverts E/W sign

    // Convert time HHMMSS.CC to milliseconds since midnight
    const time = parseVBOTime(timeRaw)
    if (time === null) continue

    // Velocity is in km/h, convert to m/s
    const speed = velocity / 3.6

    points.push({
      lat,
      lng,
      speed,
      time,
      altitude: height,
    })
  }

  return points
}

/**
 * Parse VBO time format HHMMSS.CC into milliseconds since midnight.
 * Example: 051004.15 -> 05:10:04.15 -> 18604150 ms
 */
function parseVBOTime(timeStr: string): number | null {
  const val = parseFloat(timeStr)
  if (isNaN(val)) return null

  // Split into integer part (HHMMSS) and fractional part (centiseconds)
  const intPart = Math.floor(val)
  const fracPart = val - intPart

  const hours = Math.floor(intPart / 10000)
  const minutes = Math.floor((intPart % 10000) / 100)
  const seconds = intPart % 100

  // Convert centiseconds to milliseconds
  const milliseconds = Math.round(fracPart * 1000)

  return ((hours * 3600 + minutes * 60 + seconds) * 1000) + milliseconds
}

function extractDate(text: string, points: GPSPoint[]): Date {
  // Try to extract date from the first line: "File created on DD/MM/YYYY at HH:MM:SS"
  const dateMatch = text.match(/File created on (\d{2})\/(\d{2})\/(\d{4}) at (\d{2}):(\d{2}):(\d{2})/)
  if (dateMatch) {
    const [, day, month, year, hours, minutes, seconds] = dateMatch
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      parseInt(seconds)
    )
  }

  // Fallback: use the first point's time as offset from today
  if (points.length > 0) {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return new Date(now.getTime() + points[0].time)
  }

  return new Date()
}
