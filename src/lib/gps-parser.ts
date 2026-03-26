import gpmfExtract from 'gpmf-extract'
import goProTelemetry from 'gopro-telemetry'
import type { GPSPoint } from '../types'

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
