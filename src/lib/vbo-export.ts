import type { GPSPoint } from '../types'

/**
 * Export GPS points as a VBO file (RaceChrono / VBOX format).
 * This saves the extracted GPS data so the user doesn't need to
 * re-process large video files next time.
 */
export function exportToVBO(points: GPSPoint[], filename: string): void {
  const lines: string[] = []

  // VBO header
  lines.push('[header]')
  lines.push('satellites')
  lines.push('time')
  lines.push('latitude')
  lines.push('longitude')
  lines.push('velocity kmh')
  lines.push('heading')
  lines.push('height')
  lines.push('')
  lines.push('[comments]')
  lines.push(`Exported from KartPro on ${new Date().toISOString()}`)
  lines.push(`Source: ${filename}`)
  lines.push(`Points: ${points.length}`)
  lines.push('')
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

    // VBO coordinates: minutes * 10000 format
    const latDeg = Math.floor(Math.abs(p.lat))
    const latMin = (Math.abs(p.lat) - latDeg) * 60
    const latVBO = (latDeg * 100 + latMin) * 10000 * (p.lat >= 0 ? 1 : -1)

    const lngDeg = Math.floor(Math.abs(p.lng))
    const lngMin = (Math.abs(p.lng) - lngDeg) * 60
    const lngVBO = (lngDeg * 100 + lngMin) * 10000 * (p.lng >= 0 ? 1 : -1)

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

    lines.push(`${sats} ${timeStr} ${latVBO.toFixed(0)} ${lngVBO.toFixed(0)} ${speedKmh.toFixed(2)} ${heading.toFixed(2)} ${p.altitude.toFixed(1)}`)
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace(/\.[^.]+$/, '') + '.vbo'
  a.click()
  URL.revokeObjectURL(url)
}
