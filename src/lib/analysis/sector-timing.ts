import type { Lap, Corner } from '../../types'

/**
 * Calculate time spent in each sector.
 * Sectors are defined as:
 * - Sector 0: start of lap to start of first corner
 * - Sector 1: start of first corner to start of second corner
 * - ...
 * - Sector N: start of last corner to end of lap
 *
 * This gives corners.length + 1 sectors total.
 */
export function calculateSectorTimes(lap: Lap, corners: Corner[]): number[] {
  const points = lap.points
  if (points.length === 0) return []
  if (corners.length === 0) {
    // No corners detected: entire lap is one sector
    return [lap.duration]
  }

  const sectorTimes: number[] = []

  // Sector from lap start to first corner
  const firstCornerStartTime = points[corners[0].startIndex].time
  sectorTimes.push((firstCornerStartTime - points[0].time) / 1000)

  // Sectors between consecutive corners (from start of one corner to start of next)
  for (let i = 0; i < corners.length - 1; i++) {
    const currentStart = points[corners[i].startIndex].time
    const nextStart = points[corners[i + 1].startIndex].time
    sectorTimes.push((nextStart - currentStart) / 1000)
  }

  // Sector from start of last corner to end of lap
  const lastCornerStartTime = points[corners[corners.length - 1].startIndex].time
  sectorTimes.push((points[points.length - 1].time - lastCornerStartTime) / 1000)

  return sectorTimes
}
