import gpmfExtract from 'gpmf-extract'
import goProTelemetry from 'gopro-telemetry'
import type { GPSPoint } from '../types'

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Downsample GPS points to a target frequency (Hz).
 * Keeps the first point, then only adds points when enough time has elapsed.
 */
function downsamplePoints(points: GPSPoint[], targetHz: number): GPSPoint[] {
  if (points.length < 2) return [...points]

  const minInterval = 1000 / targetHz // minimum ms between points
  const result: GPSPoint[] = [points[0]]

  for (let i = 1; i < points.length; i++) {
    const dt = points[i].time - result[result.length - 1].time
    if (dt >= minInterval) {
      result.push(points[i])
    }
  }

  return result
}

export async function parseGeoJSONFile(file: File): Promise<GPSPoint[]> {
  const text = await file.text()
  const data = JSON.parse(text)

  // Support both single Feature (geometry.coordinates) and FeatureCollection (features[])
  let coords: number[][] | undefined
  let timestamps: number[] | undefined
  let relativeTimestamps: number[] | undefined
  let perPointSpeeds: number[] | undefined

  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    // First: check if any feature is a LineString (track data)
    const trackFeat = data.features.find((f: any) =>
      f.geometry?.type === 'LineString' && f.properties?.kind === 'track'
    ) || data.features.find((f: any) => f.geometry?.type === 'LineString')

    if (trackFeat) {
      // LineString track: coordinates are an array of [lng, lat, alt]
      coords = trackFeat.geometry.coordinates
      timestamps = trackFeat.properties?.AbsoluteUtcMicroSec
      relativeTimestamps = trackFeat.properties?.RelativeMicroSec
      perPointSpeeds = trackFeat.properties?.Speed2DMps
      if (Array.isArray(timestamps) && timestamps.length === 0) timestamps = undefined
      if (Array.isArray(perPointSpeeds) && perPointSpeeds.length === 0) perPointSpeeds = undefined
    } else {
      // FeatureCollection of Points: each feature is one GPS point
      coords = data.features.map((f: any) => f.geometry?.coordinates).filter(Boolean)
      timestamps = data.features.map((f: any) => f.properties?.AbsoluteUtcMicroSec).filter((v: any) => v !== undefined)
      perPointSpeeds = data.features.map((f: any) => f.properties?.speed_ms).filter((v: any) => v !== undefined)
      if (timestamps.length !== coords.length) timestamps = undefined
      if (perPointSpeeds && perPointSpeeds.length !== coords.length) perPointSpeeds = undefined
    }
  } else {
    // Single Feature with LineString or array of coordinates
    coords = data.geometry?.coordinates
    timestamps = data.properties?.AbsoluteUtcMicroSec
    relativeTimestamps = data.properties?.RelativeMicroSec
  }

  if (!coords || coords.length === 0) {
    throw new Error('GeoJSON file has no coordinates.')
  }

  // Detect timestamp unit: if values are > 1e15, they're microseconds; > 1e12, milliseconds
  if (timestamps && timestamps.length > 0) {
    const sample = timestamps[0]
    if (sample > 1e15) {
      // Microseconds → convert to milliseconds
      timestamps = timestamps.map((t: number) => Math.round(t / 1000))
    }
    // else if > 1e12, already milliseconds (our standard)
    // else if < 1e12, could be seconds → convert to milliseconds
    else if (sample < 1e10) {
      timestamps = timestamps.map((t: number) => Math.round(t * 1000))
    }
  }

  const points: GPSPoint[] = []
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat, alt = 0] = coords[i]

    let time: number
    if (timestamps && timestamps[i] !== undefined) {
      time = timestamps[i]
    } else if (relativeTimestamps && relativeTimestamps[i] !== undefined) {
      time = relativeTimestamps[i] / 1000 // microseconds to milliseconds
    } else {
      time = i * 100
    }

    // Use per-point speed if available (from GPS sensor), otherwise derive from position
    let speed = 0
    if (perPointSpeeds && perPointSpeeds[i] !== undefined) {
      speed = perPointSpeeds[i] // already in m/s
    } else if (i > 0) {
      const prevCoord = coords[i - 1]
      const prevTime = timestamps
        ? timestamps[i - 1]
        : relativeTimestamps
          ? relativeTimestamps[i - 1]
          : (i - 1) * 100
      const dt = (time - prevTime) / 1000
      if (dt > 0) {
        const dist = haversineDistance(prevCoord[1], prevCoord[0], lat, lng)
        speed = dist / dt
      }
    }

    if (isNaN(lat) || isNaN(lng)) continue

    points.push({ lat, lng, speed, time, altitude: alt })
  }

  if (points.length === 0) {
    throw new Error('No valid GPS points found in GeoJSON file.')
  }

  // Smooth speed to reduce noise from position-derived calculation
  const windowSize = 5
  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2))
    const end = Math.min(points.length - 1, i + Math.floor(windowSize / 2))
    let sum = 0, count = 0
    for (let j = start; j <= end; j++) {
      sum += points[j].speed
      count++
    }
    points[i].speed = sum / count
  }

  return points
}

export async function parseGPSFromFile(file: File): Promise<GPSPoint[]> {
  let extracted: { rawData: ArrayBuffer; timing: unknown }
  try {
    extracted = await gpmfExtract(file, { browserMode: true })
  } catch (err) {
    throw new Error(
      `Failed to extract GPMF data from file: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (!extracted.rawData) {
    throw new Error('No GPMF metadata found in file. Is this a GoPro video?')
  }

  let telemetry: Record<string, unknown>
  try {
    telemetry = await goProTelemetry(
      { rawData: extracted.rawData, timing: extracted.timing },
      { stream: ['GPS5'], smooth: 3, GPS: { fix: 2 } }
    )
  } catch (err) {
    throw new Error(
      `Failed to parse telemetry: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const points: GPSPoint[] = []

  // gopro-telemetry returns an object keyed by device id, each containing streams
  for (const deviceKey of Object.keys(telemetry)) {
    const device = telemetry[deviceKey] as Record<string, unknown>
    if (!device || typeof device !== 'object') continue

    const streams = device.streams as Record<string, unknown> | undefined
    if (!streams) continue

    // Look for GPS5 stream (lat, lng, altitude, 2D speed, 3D speed)
    const gps5 = streams['GPS5'] as { samples?: Array<Record<string, unknown>> } | undefined
    if (!gps5?.samples) continue

    for (const sample of gps5.samples) {
      const value = sample.value as number[] | undefined
      const date = sample.date as string | undefined
      if (!value || value.length < 5 || !date) continue

      const [lat, lng, altitude, speed2d] = value
      const time = new Date(date).getTime()

      if (isNaN(lat) || isNaN(lng) || isNaN(time)) continue

      points.push({
        lat,
        lng,
        speed: speed2d, // m/s
        time,
        altitude,
      })
    }
  }

  if (points.length === 0) {
    throw new Error('No GPS data found in the video file.')
  }

  // Sort by time
  points.sort((a, b) => a.time - b.time)

  return points
}
