import type { LapAnalysis } from '../../types'

/**
 * Calculate the theoretical best lap by taking the best (fastest) sector time
 * from each sector across all laps.
 *
 * All analyses must have the same number of sectors. If they don't (e.g., different
 * corner counts), we use the sector layout from the analysis with the most common
 * sector count.
 */
export function calculateTheoreticalBest(
  analyses: LapAnalysis[]
): { time: number; sectors: number[] } {
  if (analyses.length === 0) {
    return { time: 0, sectors: [] }
  }

  if (analyses.length === 1) {
    const total = analyses[0].sectorTimes.reduce((a, b) => a + b, 0)
    return { time: total, sectors: [...analyses[0].sectorTimes] }
  }

  // Determine the most common sector count
  const countMap = new Map<number, number>()
  for (const analysis of analyses) {
    const n = analysis.sectorTimes.length
    countMap.set(n, (countMap.get(n) ?? 0) + 1)
  }

  let mostCommonCount = 0
  let mostCommonFreq = 0
  for (const [count, freq] of countMap) {
    if (freq > mostCommonFreq) {
      mostCommonFreq = freq
      mostCommonCount = count
    }
  }

  // Filter to analyses with the most common sector count
  const compatible = analyses.filter(
    (a) => a.sectorTimes.length === mostCommonCount
  )

  if (compatible.length === 0 || mostCommonCount === 0) {
    return { time: 0, sectors: [] }
  }

  // For each sector, find the minimum time across all compatible laps
  const bestSectors: number[] = []
  for (let s = 0; s < mostCommonCount; s++) {
    let best = Infinity
    for (const analysis of compatible) {
      if (analysis.sectorTimes[s] > 0 && analysis.sectorTimes[s] < best) {
        best = analysis.sectorTimes[s]
      }
    }
    bestSectors.push(best === Infinity ? 0 : best)
  }

  // Best remaining time (last entry → finish line)
  let bestRemaining = Infinity
  for (const analysis of compatible) {
    const r = analysis.remainingTime ?? 0
    if (r > 0 && r < bestRemaining) bestRemaining = r
  }
  if (bestRemaining === Infinity) bestRemaining = 0

  const totalTime = bestSectors.reduce((a, b) => a + b, 0) + bestRemaining

  return { time: totalTime, sectors: bestSectors }
}
