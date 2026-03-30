import type { GPSPoint } from '../types'

interface StartFinishLine {
  lat1: number
  lng1: number
  lat2: number
  lng2: number
}

/**
 * Export GPS points as a VBO file (RaceChrono / VBOX format).
 * This saves the extracted GPS data so the user doesn't need to
 * re-process large video files next time.
 */
export function generateVBOText(points: GPSPoint[], filename: string, startFinish?: StartFinishLine): string {
  const lines: string[] = []

  // VBO column names (must match parser expectations: sats time lat long velocity heading height)
  lines.push('[column names]')
  lines.push('sats time lat long velocity heading height')
  lines.push('')
  lines.push('[comments]')
  lines.push(`Exported from KartPro on ${new Date().toISOString()}`)
  lines.push(`Source: ${filename}`)
  lines.push(`Points: ${points.length}`)
  lines.push('')

  // Persist start/finish line so re-import uses the same lap splits
  // Parser convention: Start <lon1> <lat1> <lon2> <lat2> in total decimal minutes, lon negated
  if (startFinish) {
    lines.push('[laptiming]')
    const lon1 = (-startFinish.lng1 * 60).toFixed(6)
    const lat1 = (startFinish.lat1 * 60).toFixed(6)
    const lon2 = (-startFinish.lng2 * 60).toFixed(6)
    const lat2 = (startFinish.lat2 * 60).toFixed(6)
    lines.push(`Start ${lon1} ${lat1} ${lon2} ${lat2}`)
    lines.push('')
  }

  lines.push('[data]')

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const date = new Date(p.time)

    // VBO time format: HHMMSS.SS
    const hours = String(date.getUTCHours()).padStart(2, '0')
    const mins = String(date.getUTCMinutes()).padStart(2, '0')
    const secs = String(date.getUTCSeconds()).padStart(2, '0')
    const ms = String(Math.floor(date.getUTCMilliseconds() / 10)).padStart(2, '0')
    const timeStr = `${hours}${mins}${secs}.${ms}`

    // VBO coordinates: total decimal minutes (parser recovers degrees via value / 60)
    // Longitude is negated to match RaceChrono convention (parser does lng = -lonRaw / 60)
    const latVBO = p.lat * 60
    const lngVBO = -p.lng * 60

    // Heading from consecutive points
    let heading = 0
    if (i < points.length - 1) {
      const dLng = points[i + 1].lng - p.lng
      const dLat = points[i + 1].lat - p.lat
      heading = ((Math.atan2(dLng, dLat) * 180 / Math.PI) + 360) % 360
    } else if (i > 0) {
      const dLng = p.lng - points[i - 1].lng
      const dLat = p.lat - points[i - 1].lat
      heading = ((Math.atan2(dLng, dLat) * 180 / Math.PI) + 360) % 360
    }

    const speedKmh = p.speed * 3.6
    const sats = 10 // placeholder

    lines.push(`${sats} ${timeStr} ${latVBO.toFixed(6)} ${lngVBO.toFixed(6)} ${speedKmh.toFixed(2)} ${heading.toFixed(2)} ${p.altitude.toFixed(1)}`)
  }

  return lines.join('\n')
}

export function exportToVBO(points: GPSPoint[], filename: string, startFinish?: StartFinishLine): void {
  const text = generateVBOText(points, filename, startFinish)
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace(/\.[^.]+$/, '') + '.vbo'
  a.click()
  URL.revokeObjectURL(url)
}
