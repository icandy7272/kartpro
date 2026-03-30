import type { Lap, Corner, LapAnalysis, GPSPoint, RacingLineAnalysis } from '../../types'

export interface FullAnalysis {
  theoreticalBest: {
    time: number
    savings: number
    perCorner: {
      corner: string; bestTime: number; bestLap: number; savedVsFastest: number
      reason?: string // why this lap's corner was fastest vs fastest overall lap
      bestEntry: number; bestMin: number; bestExit: number // speeds of best corner lap
      refEntry: number; refMin: number; refExit: number // speeds of fastest overall lap
      bestDistance: number; refDistance: number // actual GPS distance through corner (meters)
      lineNote?: string // racing line difference based on actual trajectory data
      bestLine?: Array<[number, number]> // GPS trajectory [lat, lng][] of best corner lap
      refLine?: Array<[number, number]>  // GPS trajectory [lat, lng][] of fastest overall lap
    }[]
  }
  cornerPriority: {
    corner: string
    avgDelta: number
    stdDev: number
  }[]
  consistency: {
    corner: string
    stdDev: number
    rating: string
    minDelta: number
    maxDelta: number
    minLap: number
    maxLap: number
  }[]
  lapTrend: {
    laps: { lapNumber: number; time: number; delta: number }[]
    trend: 'improving' | 'declining' | 'fluctuating'
    peakRange: [number, number]
    worstRange: [number, number]
  }
  fastestVsSlowest: {
    fastestLap: number
    slowestLap: number
    fastestTime: number
    slowestTime: number
    totalDelta: number
    perCorner: { corner: string; fastestTime: number; slowestTime: number; delta: number; percentage: number }[]
  }
  brakingPattern: {
    corner: string
    direction: string
    angle: number
    type: string
    entrySpeed: number
    apexSpeed: number
    minSpeed: number
    exitSpeed: number
    brakingIntensity: number
    exitAcceleration: number
    apexPosition: string // '早弯心' | '中弯心' | '晚弯心'
    brakingPhaseRatio: number // entry-to-apex distance as % of total corner
    diagnosis: string
    detailedDiagnosis: string[]
  }[]
  lapGroups: {
    quickLaps: number[]
    slowLaps: number[]
    quickAvg: number
    slowAvg: number
    gap: number
    perCorner: {
      corner: string
      quickAvgDuration: number
      slowAvgDuration: number
      gap: number
      quickSpeeds: { entry: number; min: number; exit: number }
      slowSpeeds: { entry: number; min: number; exit: number }
    }[]
  }
  cornerCorrelation: {
    corner: string
    correlation: number
    significance: string
  }[]
  trainingPlan: {
    stint: number
    title: string
    focus: string
    goal: string
    targets: string[]
  }[]
  cornerScoring: {
    corner: string
    avgDelta: number
    stdDev: number
    quickSlowGap: number
    maxSingleLoss: number
    correlation: number
    score: number
  }[]
  cornerNarrative: {
    corner: string
    comments: string[]
  }[]
  trackStrategy: {
    overallApproach: string
    cornerRoles: {
      corner: string
      role: string  // '直道入口弯' | '组合弯' | '独立弯'
      nextGapM: number
      prevGapM: number
      followedByLongStraight: boolean
      linkedToNext: boolean
      linkedToPrev: boolean
      nextCorner: string | null
      prevCorner: string | null
      sameDirectionAsNext: boolean
    }[]
    priorityZones: {
      zone: string
      corners: string[]
      symptom: string
      rootCause: string
      practice: string
      targetGain: string
      priority: number
    }[]
    trainingClosure: {
      focus: string
      metric: string
      target: string
    }[]
  }
}

/**
 * Calculate the actual GPS distance (meters) through a corner by summing
 * haversine distances between consecutive points.
 */
function cornerDistance(points: GPSPoint[], startIdx: number, endIdx: number): number {
  let dist = 0
  const R = 6371000
  for (let i = startIdx; i < endIdx && i < points.length - 1; i++) {
    const dLat = ((points[i + 1].lat - points[i].lat) * Math.PI) / 180
    const dLng = ((points[i + 1].lng - points[i].lng) * Math.PI) / 180
    const lat1 = (points[i].lat * Math.PI) / 180
    const lat2 = (points[i + 1].lat * Math.PI) / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    dist += 2 * R * Math.asin(Math.sqrt(a))
  }
  return dist
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function generateFullAnalysis(
  laps: Lap[],
  corners: Corner[],
  analyses: LapAnalysis[],
  racingLineAnalyses?: RacingLineAnalysis[]
): FullAnalysis {
  if (analyses.length === 0 || corners.length === 0) {
    return {
      theoreticalBest: { time: 0, savings: 0, perCorner: [] },
      cornerPriority: [],
      consistency: [],
      lapTrend: { laps: [], trend: 'fluctuating', peakRange: [1, 1], worstRange: [1, 1] },
      fastestVsSlowest: { fastestLap: 0, slowestLap: 0, fastestTime: 0, slowestTime: 0, totalDelta: 0, perCorner: [] },
      brakingPattern: [],
      lapGroups: { quickLaps: [], slowLaps: [], quickAvg: 0, slowAvg: 0, gap: 0, perCorner: [] },
      cornerCorrelation: [],
      trainingPlan: [],
      cornerScoring: [],
      cornerNarrative: [],
      trackStrategy: { overallApproach: '', cornerRoles: [], priorityZones: [], trainingClosure: [] },
    }
  }

  const fastestLap = laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), laps[0])
  const slowestLap = laps.reduce((worst, lap) => (lap.duration > worst.duration ? lap : worst), laps[0])
  const fastestAnalysis = analyses.find((a) => a.lap.id === fastestLap.id)!
  const slowestAnalysis = analyses.find((a) => a.lap.id === slowestLap.id)!

  const numCorners = corners.length

  // === 1. Theoretical Best Lap ===
  const perCornerBest: FullAnalysis['theoreticalBest']['perCorner'] = []
  let theoreticalCornerSum = 0
  let fastestCornerSum = 0

  for (let ci = 0; ci < numCorners; ci++) {
    let bestTime = Infinity
    let bestLapId = 0
    const fastestCornerTime = fastestAnalysis.corners[ci]?.duration ?? 0
    fastestCornerSum += fastestCornerTime

    for (const a of analyses) {
      if (a.corners[ci] && a.corners[ci].duration > 0 && a.corners[ci].duration < bestTime) {
        bestTime = a.corners[ci].duration
        bestLapId = a.lap.id
      }
    }

    if (bestTime === Infinity) bestTime = fastestCornerTime
    theoreticalCornerSum += bestTime

    // Gather speed data: best corner lap vs fastest overall lap
    const bestAnalysis = analyses.find(a => a.lap.id === bestLapId)
    const bestCorner = bestAnalysis?.corners[ci]
    const bestEntry = bestCorner?.entrySpeed ?? 0
    const bestMin = bestCorner?.minSpeed ?? 0
    const bestExit = bestCorner?.exitSpeed ?? 0

    // Reference = fastest overall lap's corner speeds
    const refCorner = fastestAnalysis.corners[ci]
    const refEntry = refCorner?.entrySpeed ?? 0
    const refMin = refCorner?.minSpeed ?? 0
    const refExit = refCorner?.exitSpeed ?? 0

    // Generate reason: why this corner lap was faster than fastest overall lap's same corner
    const entryDiff = bestEntry - refEntry
    const minDiff = bestMin - refMin
    const exitDiff = bestExit - refExit

    // Compute actual GPS distance FIRST — we need this for reasoning
    const bestLapObj = laps.find(l => l.id === bestLapId)
    const bestDist = (bestLapObj && bestCorner)
      ? cornerDistance(bestLapObj.points, bestCorner.startIndex, bestCorner.endIndex)
      : 0
    const refDist = refCorner
      ? cornerDistance(fastestLap.points, refCorner.startIndex, refCorner.endIndex)
      : 0

    // === Generate reason and line note from MEASURED DATA ONLY ===
    const distDiff = bestDist - refDist  // negative = shorter line
    const distPct = refDist > 0 ? (distDiff / refDist) * 100 : 0
    const shorterLine = distDiff < -0.3
    const longerLine = distDiff > 0.3

    const reasons: string[] = []
    let lineNote: string | undefined

    if (bestLapId === fastestLap.id) {
      reasons.push('最快圈本身最快')
    } else {
      // ALL speed differences (no threshold filtering — show complete picture)
      const allSpeeds = `入弯${entryDiff >= 0 ? '+' : ''}${entryDiff.toFixed(1)}，弯心${minDiff >= 0 ? '+' : ''}${minDiff.toFixed(1)}，出弯${exitDiff >= 0 ? '+' : ''}${exitDiff.toFixed(1)}km/h`

      // Distance fact (measured from GPS)
      const distFact = shorterLine
        ? `走线短${Math.abs(distDiff).toFixed(1)}m（-${Math.abs(distPct).toFixed(1)}%）`
        : longerLine
          ? `走线长${distDiff.toFixed(1)}m（+${distPct.toFixed(1)}%）`
          : `走线距离相近`

      // Time saved
      const timeSaved = fastestCornerTime - bestTime

      // Compute time contribution from speed vs distance
      // avgSpeed * time = distance → time = distance / avgSpeed
      const bestAvgSpeed = (bestEntry + bestMin + bestExit) / 3
      const refAvgSpeed = (refEntry + refMin + refExit) / 3

      if (longerLine && exitDiff < -0.5) {
        // Paradox case: longer line + slower exit, but still faster
        // Must explain what compensated
        const fasterPhases: string[] = []
        if (entryDiff > 0.3) fasterPhases.push(`入弯快${entryDiff.toFixed(1)}`)
        if (minDiff > 0.3) fasterPhases.push(`弯心快${minDiff.toFixed(1)}`)
        const slowerPhases: string[] = []
        if (entryDiff < -0.3) slowerPhases.push(`入弯慢${Math.abs(entryDiff).toFixed(1)}`)
        if (minDiff < -0.3) slowerPhases.push(`弯心慢${Math.abs(minDiff).toFixed(1)}`)
        if (exitDiff < -0.3) slowerPhases.push(`出弯慢${Math.abs(exitDiff).toFixed(1)}`)

        if (fasterPhases.length > 0) {
          reasons.push(`虽然${distFact}且${slowerPhases.join('、')}km/h，但${fasterPhases.join('、')}km/h的优势更大，净省${timeSaved.toFixed(3)}s`)
        } else {
          // All phases slower or similar but line is longer — timing/rhythm advantage
          reasons.push(`${distFact}，速度（${allSpeeds}）整体略低，但弯道内节奏和走线角度更优，净省${timeSaved.toFixed(3)}s`)
        }
      } else if (shorterLine) {
        reasons.push(`${distFact}，速度：${allSpeeds}`)
      } else if (bestAvgSpeed > refAvgSpeed + 0.5) {
        reasons.push(`速度更高（${allSpeeds}），${distFact}`)
      } else {
        reasons.push(`速度：${allSpeeds}，${distFact}`)
      }

      // Line note: measured trajectory facts
      const lineParts: string[] = []
      lineParts.push(distFact)

      // Apex position from actual GPS indices
      if (bestCorner && refCorner) {
        const bestApexRatio = bestCorner.apexIndex
          ? (bestCorner.apexIndex - bestCorner.startIndex) / Math.max(1, bestCorner.endIndex - bestCorner.startIndex)
          : 0.5
        const refApexRatio = refCorner.apexIndex
          ? (refCorner.apexIndex - refCorner.startIndex) / Math.max(1, refCorner.endIndex - refCorner.startIndex)
          : 0.5
        const apexDiffPct = (bestApexRatio - refApexRatio) * 100
        if (Math.abs(apexDiffPct) > 5) {
          lineParts.push(apexDiffPct > 0 ? `弯心偏晚${Math.abs(apexDiffPct).toFixed(0)}%` : `弯心偏早${Math.abs(apexDiffPct).toFixed(0)}%`)
        }
      }

      lineNote = lineParts.join('；')
    }

    // Extract GPS trajectory coordinates for SVG rendering
    const bestLine: Array<[number, number]> | undefined =
      bestLapObj && bestCorner
        ? bestLapObj.points.slice(bestCorner.startIndex, bestCorner.endIndex + 1).map(p => [p.lat, p.lng])
        : undefined
    const refLine: Array<[number, number]> | undefined =
      refCorner
        ? fastestLap.points.slice(refCorner.startIndex, refCorner.endIndex + 1).map(p => [p.lat, p.lng])
        : undefined

    perCornerBest.push({
      corner: corners[ci].name,
      bestTime,
      bestLap: bestLapId,
      savedVsFastest: fastestCornerTime - bestTime,
      reason: reasons.join('；'),
      bestEntry, bestMin, bestExit,
      refEntry, refMin, refExit,
      bestDistance: bestDist,
      refDistance: refDist,
      lineNote,
      bestLine,
      refLine,
    })
  }

  const theoreticalBestTime = fastestLap.duration - (fastestCornerSum - theoreticalCornerSum)
  const theoreticalSavings = fastestLap.duration - theoreticalBestTime

  // === 2. Corner Priority Ranking ===
  const cornerPriority: FullAnalysis['cornerPriority'] = []
  for (let ci = 0; ci < numCorners; ci++) {
    const fastestCornerTime = fastestAnalysis.corners[ci]?.duration ?? 0
    const deltas: number[] = []
    for (const a of analyses) {
      if (a.corners[ci]) {
        deltas.push(a.corners[ci].duration - fastestCornerTime)
      }
    }
    const avgDelta = deltas.length > 0 ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0
    cornerPriority.push({
      corner: corners[ci].name,
      avgDelta,
      stdDev: stdDev(deltas),
    })
  }
  cornerPriority.sort((a, b) => b.avgDelta - a.avgDelta)

  // === 3. Consistency Diagnosis ===
  const consistencyData: FullAnalysis['consistency'] = []
  for (let ci = 0; ci < numCorners; ci++) {
    const durations: { duration: number; lapId: number }[] = []
    for (const a of analyses) {
      if (a.corners[ci] && a.corners[ci].duration > 0) {
        durations.push({ duration: a.corners[ci].duration, lapId: a.lap.id })
      }
    }
    if (durations.length === 0) continue

    const values = durations.map((d) => d.duration)
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const sd = stdDev(values)

    let rating: string
    if (sd < 0.1) rating = '非常稳定'
    else if (sd < 0.2) rating = '稳定'
    else if (sd < 0.4) rating = '波动'
    else rating = '不稳定'

    const deltas = durations.map((d) => d.duration - mean)
    let minDelta = Infinity
    let maxDelta = -Infinity
    let minLap = 0
    let maxLap = 0
    for (let i = 0; i < deltas.length; i++) {
      if (deltas[i] < minDelta) { minDelta = deltas[i]; minLap = durations[i].lapId }
      if (deltas[i] > maxDelta) { maxDelta = deltas[i]; maxLap = durations[i].lapId }
    }

    consistencyData.push({
      corner: corners[ci].name,
      stdDev: sd,
      rating,
      minDelta,
      maxDelta,
      minLap,
      maxLap,
    })
  }

  // === 4. Lap Trend ===
  const fastestTime = fastestLap.duration
  const lapTrendData = analyses.map((a) => ({
    lapNumber: a.lap.id,
    time: a.lap.duration,
    delta: a.lap.duration - fastestTime,
  }))

  // Determine trend: compare first half avg vs second half avg
  const halfIdx = Math.floor(lapTrendData.length / 2)
  const firstHalf = lapTrendData.slice(0, Math.max(1, halfIdx))
  const secondHalf = lapTrendData.slice(Math.max(1, halfIdx))
  const firstAvg = firstHalf.reduce((s, l) => s + l.time, 0) / firstHalf.length
  const secondAvg = secondHalf.reduce((s, l) => s + l.time, 0) / secondHalf.length
  const trendDiff = secondAvg - firstAvg

  let trend: 'improving' | 'declining' | 'fluctuating'
  if (trendDiff < -0.2) trend = 'improving'
  else if (trendDiff > 0.2) trend = 'declining'
  else trend = 'fluctuating'

  // Find peak (best) and worst ranges (consecutive laps)
  let bestSum = Infinity
  let worstSum = -Infinity
  let peakStart = 0
  let worstStart = 0
  const windowSize = Math.min(3, lapTrendData.length)
  for (let i = 0; i <= lapTrendData.length - windowSize; i++) {
    const sum = lapTrendData.slice(i, i + windowSize).reduce((s, l) => s + l.time, 0)
    if (sum < bestSum) { bestSum = sum; peakStart = i }
    if (sum > worstSum) { worstSum = sum; worstStart = i }
  }

  const peakRange: [number, number] = [
    lapTrendData[peakStart]?.lapNumber ?? 1,
    lapTrendData[Math.min(peakStart + windowSize - 1, lapTrendData.length - 1)]?.lapNumber ?? 1,
  ]
  const worstRange: [number, number] = [
    lapTrendData[worstStart]?.lapNumber ?? 1,
    lapTrendData[Math.min(worstStart + windowSize - 1, lapTrendData.length - 1)]?.lapNumber ?? 1,
  ]

  // === 5. Fastest vs Slowest Lap Comparison ===
  const totalDelta = slowestLap.duration - fastestLap.duration
  const fvsPerCorner: FullAnalysis['fastestVsSlowest']['perCorner'] = []
  for (let ci = 0; ci < numCorners; ci++) {
    const ft = fastestAnalysis.corners[ci]?.duration ?? 0
    const st = slowestAnalysis.corners[ci]?.duration ?? 0
    const delta = st - ft
    const percentage = totalDelta > 0 ? (delta / totalDelta) * 100 : 0
    fvsPerCorner.push({
      corner: corners[ci].name,
      fastestTime: ft,
      slowestTime: st,
      delta,
      percentage,
    })
  }

  // === 6. Braking/Acceleration Pattern (with apex geometry) ===
  const brakingPattern: FullAnalysis['brakingPattern'] = []
  for (let ci = 0; ci < fastestAnalysis.corners.length; ci++) {
    const corner = fastestAnalysis.corners[ci]
    const masterCorner = corners[ci]
    if (!masterCorner) continue

    const brakingIntensity = corner.entrySpeed - corner.minSpeed
    const exitAcceleration = corner.exitSpeed - corner.minSpeed

    // Apex position analysis: where is the apex relative to corner length
    const cornerLength = corner.endIndex - corner.startIndex
    const apexIdx = masterCorner.apexIndex ?? Math.floor((corner.startIndex + corner.endIndex) / 2)
    const apexOffset = apexIdx - corner.startIndex
    const brakingPhaseRatio = cornerLength > 0 ? apexOffset / cornerLength : 0.5

    let apexPosition: string
    if (brakingPhaseRatio < 0.35) apexPosition = '早弯心'
    else if (brakingPhaseRatio > 0.65) apexPosition = '晚弯心'
    else apexPosition = '中弯心'

    // Apex speed: speed at the apex point
    const fastestPts = fastestLap.points
    const apexSpeed = apexIdx < fastestPts.length ? fastestPts[apexIdx].speed * 3.6 : corner.minSpeed

    // Build diagnosis
    let diagnosis: string
    const detailedDiagnosis: string[] = []

    if (exitAcceleration < 0) {
      diagnosis = '出弯减速'
      detailedDiagnosis.push('过了弯心还在减速，说明 apex 后仍在转向或踩刹车')
      if (apexPosition === '早弯心') {
        detailedDiagnosis.push('弯心偏早，出弯段太长导致车头没朝向直道')
      }
    } else if (brakingIntensity > 15) {
      diagnosis = '重刹'
      if (apexPosition === '早弯心') {
        detailedDiagnosis.push('刹车力度大且弯心偏早，可能入弯速度过高导致紧急制动')
      } else {
        detailedDiagnosis.push('制动力度大，检查是否可以更平滑地收油入弯')
      }
    } else if (brakingIntensity < 3) {
      diagnosis = '全油通过'
      detailedDiagnosis.push('几乎不减速通过，速度控制好')
    } else {
      diagnosis = '正常'
    }

    // Check apex vs min speed relationship
    if (Math.abs(apexSpeed - corner.minSpeed) > 3) {
      detailedDiagnosis.push(`弯心速度 ${apexSpeed.toFixed(1)} km/h ≠ 最低速度 ${corner.minSpeed.toFixed(1)} km/h，最低速出现在弯心之${apexSpeed > corner.minSpeed ? '后' : '前'}`)
    }

    // Check entry-exit speed balance
    if (corner.exitSpeed > corner.entrySpeed + 5) {
      detailedDiagnosis.push('出弯速度高于入弯，加速出弯良好')
    } else if (corner.entrySpeed > corner.exitSpeed + 10) {
      detailedDiagnosis.push('出弯速度远低于入弯，出弯加速不足')
    }

    brakingPattern.push({
      corner: corner.name,
      direction: masterCorner.direction === 'left' ? '左' : '右',
      angle: Math.round(masterCorner.angle),
      type: masterCorner.type,
      entrySpeed: corner.entrySpeed,
      apexSpeed: parseFloat(apexSpeed.toFixed(1)),
      minSpeed: corner.minSpeed,
      exitSpeed: corner.exitSpeed,
      brakingIntensity,
      exitAcceleration,
      apexPosition,
      brakingPhaseRatio: Math.round(brakingPhaseRatio * 100),
      diagnosis,
      detailedDiagnosis,
    })
  }

  // === 7. Quick vs Slow Lap Group Analysis ===
  const sortedByDuration = [...analyses].sort((a, b) => a.lap.duration - b.lap.duration)
  const medianLap = sortedByDuration[Math.floor(sortedByDuration.length / 2)]
  const medianTime = medianLap.lap.duration
  const quickThreshold = medianTime + 0.5

  const quickAnalyses = analyses.filter((a) => a.lap.duration <= quickThreshold)
  const slowAnalyses = analyses.filter((a) => a.lap.duration > quickThreshold)

  const quickLapIds = quickAnalyses.map((a) => a.lap.id)
  const slowLapIds = slowAnalyses.map((a) => a.lap.id)

  const quickAvgTime = quickAnalyses.length > 0
    ? quickAnalyses.reduce((s, a) => s + a.lap.duration, 0) / quickAnalyses.length
    : 0
  const slowAvgTime = slowAnalyses.length > 0
    ? slowAnalyses.reduce((s, a) => s + a.lap.duration, 0) / slowAnalyses.length
    : 0

  const lapGroupsPerCorner: FullAnalysis['lapGroups']['perCorner'] = []
  for (let ci = 0; ci < numCorners; ci++) {
    const quickDurations: number[] = []
    const quickEntry: number[] = []
    const quickMin: number[] = []
    const quickExit: number[] = []
    const slowDurations: number[] = []
    const slowEntry: number[] = []
    const slowMin: number[] = []
    const slowExit: number[] = []

    for (const a of quickAnalyses) {
      if (a.corners[ci] && a.corners[ci].duration > 0) {
        quickDurations.push(a.corners[ci].duration)
        quickEntry.push(a.corners[ci].entrySpeed)
        quickMin.push(a.corners[ci].minSpeed)
        quickExit.push(a.corners[ci].exitSpeed)
      }
    }
    for (const a of slowAnalyses) {
      if (a.corners[ci] && a.corners[ci].duration > 0) {
        slowDurations.push(a.corners[ci].duration)
        slowEntry.push(a.corners[ci].entrySpeed)
        slowMin.push(a.corners[ci].minSpeed)
        slowExit.push(a.corners[ci].exitSpeed)
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
    const qAvgDur = avg(quickDurations)
    const sAvgDur = avg(slowDurations)

    lapGroupsPerCorner.push({
      corner: corners[ci].name,
      quickAvgDuration: qAvgDur,
      slowAvgDuration: sAvgDur,
      gap: sAvgDur - qAvgDur,
      quickSpeeds: { entry: avg(quickEntry), min: avg(quickMin), exit: avg(quickExit) },
      slowSpeeds: { entry: avg(slowEntry), min: avg(slowMin), exit: avg(slowExit) },
    })
  }

  const lapGroups: FullAnalysis['lapGroups'] = {
    quickLaps: quickLapIds,
    slowLaps: slowLapIds,
    quickAvg: quickAvgTime,
    slowAvg: slowAvgTime,
    gap: slowAvgTime - quickAvgTime,
    perCorner: lapGroupsPerCorner,
  }

  // === 8. Corner-to-Laptime Correlation (Pearson) ===
  function pearsonCorrelation(xs: number[], ys: number[]): number {
    const n = xs.length
    if (n < 3) return 0
    const meanX = xs.reduce((s, v) => s + v, 0) / n
    const meanY = ys.reduce((s, v) => s + v, 0) / n
    let num = 0
    let denX = 0
    let denY = 0
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX
      const dy = ys[i] - meanY
      num += dx * dy
      denX += dx * dx
      denY += dy * dy
    }
    const den = Math.sqrt(denX * denY)
    return den === 0 ? 0 : num / den
  }

  const cornerCorrelation: FullAnalysis['cornerCorrelation'] = []

  for (let ci = 0; ci < numCorners; ci++) {
    const cornerDurations: number[] = []
    const matchedLapTimes: number[] = []
    for (let li = 0; li < analyses.length; li++) {
      if (analyses[li].corners[ci] && analyses[li].corners[ci].duration > 0) {
        cornerDurations.push(analyses[li].corners[ci].duration)
        matchedLapTimes.push(analyses[li].lap.duration)
      }
    }
    const r = pearsonCorrelation(cornerDurations, matchedLapTimes)
    const absR = Math.abs(r)
    const significance = absR > 0.7 ? '强相关' : absR > 0.4 ? '中等相关' : '弱相关'
    cornerCorrelation.push({ corner: corners[ci].name, correlation: r, significance })
  }

  // === 9. Corner Scoring ===
  // Gather all metrics per corner for normalization
  const scoringRaw: {
    corner: string
    avgDelta: number
    sd: number
    qsGap: number
    maxLoss: number
    corr: number
  }[] = []

  for (let ci = 0; ci < numCorners; ci++) {
    const cName = corners[ci].name
    const priority = cornerPriority.find((p) => p.corner === cName)
    const lgCorner = lapGroupsPerCorner.find((l) => l.corner === cName)
    const corrEntry = cornerCorrelation.find((c) => c.corner === cName)
    const consistEntry = consistencyData.find((c) => c.corner === cName)

    // Max single loss: largest delta for this corner across all laps vs fastest
    const fastestCornerTime = fastestAnalysis.corners[ci]?.duration ?? 0
    let maxLoss = 0
    for (const a of analyses) {
      if (a.corners[ci]) {
        const delta = a.corners[ci].duration - fastestCornerTime
        if (delta > maxLoss) maxLoss = delta
      }
    }

    scoringRaw.push({
      corner: cName,
      avgDelta: priority?.avgDelta ?? 0,
      sd: consistEntry?.stdDev ?? 0,
      qsGap: lgCorner?.gap ?? 0,
      maxLoss,
      corr: Math.abs(corrEntry?.correlation ?? 0),
    })
  }

  // Normalize each metric to 0-1
  function normalizeArr(values: number[]): number[] {
    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min
    if (range === 0) return values.map(() => 0)
    return values.map((v) => (v - min) / range)
  }

  const normAvgDelta = normalizeArr(scoringRaw.map((s) => s.avgDelta))
  const normStdDev = normalizeArr(scoringRaw.map((s) => s.sd))
  const normQSGap = normalizeArr(scoringRaw.map((s) => s.qsGap))
  const normMaxLoss = normalizeArr(scoringRaw.map((s) => s.maxLoss))
  const normCorr = normalizeArr(scoringRaw.map((s) => s.corr))

  const cornerScoring: FullAnalysis['cornerScoring'] = scoringRaw.map((s, i) => ({
    corner: s.corner,
    avgDelta: s.avgDelta,
    stdDev: s.sd,
    quickSlowGap: s.qsGap,
    maxSingleLoss: s.maxLoss,
    correlation: s.corr,
    score: (normAvgDelta[i] * 0.3 + normStdDev[i] * 0.2 + normQSGap[i] * 0.25 + normMaxLoss[i] * 0.15 + normCorr[i] * 0.1) * 10,
  }))
  cornerScoring.sort((a, b) => b.score - a.score)

  // === 10. Training Plan ===
  const sortedByStdDev = [...consistencyData].sort((a, b) => b.stdDev - a.stdDev)
  const sortedByQSGap = [...lapGroupsPerCorner].sort((a, b) => b.gap - a.gap)
  const sortedByScoringAsc = [...cornerScoring].sort((a, b) => a.score - b.score)
  const smallLossCorners = sortedByScoringAsc.filter((c) => c.score > 0 && c.score <= 4).slice(0, 3)

  const trainingPlan: FullAnalysis['trainingPlan'] = []

  // Stint 1: highest volatility
  if (sortedByStdDev.length > 0) {
    const target = sortedByStdDev[0]
    trainingPlan.push({
      stint: 1,
      title: '稳定性训练',
      focus: target.corner,
      goal: '提高一致性，减少崩盘',
      targets: [
        `${target.corner} 当前标准差 ${target.stdDev.toFixed(3)}s，目标降到 ${(target.stdDev * 0.6).toFixed(3)}s`,
        `连续5圈该弯道波动不超过 ${(target.stdDev * 0.5).toFixed(3)}s`,
        '专注刹车点一致性，不追求最快',
      ],
    })
  }

  // Stint 2: highest quick-slow gap
  if (sortedByQSGap.length > 0) {
    const topGapCorners = sortedByQSGap.slice(0, 2)
    trainingPlan.push({
      stint: 2,
      title: '速度提升训练',
      focus: topGapCorners.map((c) => c.corner).join(' + '),
      goal: '缩小快慢圈差距',
      targets: topGapCorners.map(
        (c) => `${c.corner} 快慢圈差 ${c.gap.toFixed(3)}s，目标缩小到 ${(c.gap * 0.5).toFixed(3)}s`
      ).concat(['参考快圈组的入弯速度和线路']),
    })
  }

  // Stint 3: small-loss corners refinement
  if (smallLossCorners.length > 0) {
    trainingPlan.push({
      stint: 3,
      title: '精细打磨',
      focus: smallLossCorners.map((c) => c.corner).join(' + '),
      goal: '微调提升，追求极限',
      targets: smallLossCorners.map(
        (c) => `${c.corner} 综合评分 ${c.score.toFixed(1)}，微调可节省约 ${c.avgDelta.toFixed(3)}s`
      ).concat(['关注出弯加速和线路优化']),
    })
  }

  // === 11. Track Strategy Model — inter-corner context ===

  // Compute inter-corner gaps using GPS distances on fastest lap
  const cornerRoles: FullAnalysis['trackStrategy']['cornerRoles'] = []
  const pts = fastestLap.points

  for (let ci = 0; ci < numCorners; ci++) {
    const mc = corners[ci]
    const nextCorner = ci < numCorners - 1 ? corners[ci + 1] : null
    const prevCorner = ci > 0 ? corners[ci - 1] : null

    // Distance to next corner (from this corner's exit to next corner's entry)
    let nextGapM = 0
    if (nextCorner) {
      nextGapM = cornerDistance(pts, mc.endIndex, nextCorner.startIndex)
    } else {
      // Last corner → wrap to lap end + start → first corner
      nextGapM = cornerDistance(pts, mc.endIndex, pts.length - 1)
      if (corners[0]) {
        nextGapM += cornerDistance(pts, 0, corners[0].startIndex)
      }
    }

    let prevGapM = 0
    if (prevCorner) {
      prevGapM = cornerDistance(pts, prevCorner.endIndex, mc.startIndex)
    } else {
      // First corner from start/finish
      prevGapM = cornerDistance(pts, 0, mc.startIndex)
    }

    const linkedToNext = nextGapM < 30
    const linkedToPrev = prevGapM < 30
    const followedByLongStraight = nextGapM > 80

    // Direction comparison with next corner
    const sameDirectionAsNext = nextCorner
      ? mc.direction === nextCorner.direction
      : false

    // Classify strategic role
    let role: string
    if (followedByLongStraight) {
      role = '直道入口弯'
    } else if (linkedToNext || linkedToPrev) {
      role = '组合弯'
    } else {
      role = '独立弯'
    }

    cornerRoles.push({
      corner: mc.name,
      role,
      nextGapM: Math.round(nextGapM),
      prevGapM: Math.round(prevGapM),
      followedByLongStraight,
      linkedToNext,
      linkedToPrev,
      nextCorner: nextCorner?.name ?? null,
      prevCorner: prevCorner?.name ?? null,
      sameDirectionAsNext,
    })
  }

  // Generate overall track approach
  const entryCorners = cornerRoles.filter(r => r.followedByLongStraight)
  const linkedGroups: string[][] = []
  let currentGroup: string[] = []
  for (let ci = 0; ci < numCorners; ci++) {
    const cr = cornerRoles[ci]
    if (cr.linkedToNext || cr.linkedToPrev) {
      if (currentGroup.length === 0 || cr.linkedToPrev) {
        if (currentGroup.length === 0) currentGroup.push(cr.corner)
        else if (cr.linkedToPrev) currentGroup.push(cr.corner)
      }
      if (!cr.linkedToNext && currentGroup.length > 0) {
        linkedGroups.push([...currentGroup])
        currentGroup = []
      }
    } else if (currentGroup.length > 0) {
      linkedGroups.push([...currentGroup])
      currentGroup = []
    }
  }
  if (currentGroup.length > 0) linkedGroups.push(currentGroup)

  const approachParts: string[] = []
  if (entryCorners.length > 0) {
    approachParts.push(`关键出弯：${entryCorners.map(c => c.corner).join('、')} 后接长直道，出弯速度决定直道尾速`)
  }
  if (linkedGroups.length > 0) {
    approachParts.push(`组合弯：${linkedGroups.map(g => g.join('→')).join('，')}，要当作整体来走`)
  }
  const independentCorners = cornerRoles.filter(r => r.role === '独立弯')
  if (independentCorners.length > 0) {
    approachParts.push(`独立弯：${independentCorners.map(c => c.corner).join('、')}`)
  }
  const overallApproach = approachParts.length > 0
    ? `本赛道 ${numCorners} 个弯道。${approachParts.join('。')}。核心思路：出弯速度优先于入弯速度，组合弯看整体不看单弯。`
    : `本赛道共 ${numCorners} 个弯道。`

  // === 12. Expert Coaching Narrative (with track strategy context) ===
  const maxQSGapCorner = sortedByQSGap.length > 0 ? sortedByQSGap[0] : null

  // Use quick-lap-group averages for baseline instead of a single fastest lap
  const cornerNarrative: FullAnalysis['cornerNarrative'] = []
  for (let ci = 0; ci < numCorners; ci++) {
    const cName = corners[ci].name
    const mc = corners[ci]
    const scoring = cornerScoring.find((s) => s.corner === cName)
    const lgCorner = lapGroupsPerCorner.find((l) => l.corner === cName)
    const braking = brakingPattern.find((b) => b.corner === cName)
    const cr = cornerRoles[ci]
    if (!scoring || !braking) continue

    const comments: string[] = []
    const dir = mc.direction === 'left' ? '左' : '右'
    const angle = Math.round(mc.angle)

    // ---- Identify the ONE dominant issue for this corner ----
    const isTimeLossCorner = scoring.avgDelta > 0.05
    const isUnstable = scoring.stdDev > 0.4
    const exitDecelerating = braking.exitAcceleration < -2
    const poorExitAccel = braking.exitAcceleration < 2
    const heavyBraking = braking.brakingIntensity > 15
    const entryConstrained = cr.linkedToPrev && braking.brakingIntensity < 3

    // ---- 赛道上下文（组合弯关系）----
    if (cr.linkedToPrev && cr.prevCorner) {
      const prevBraking = brakingPattern.find(b => b.corner === cr.prevCorner)
      if (prevBraking) {
        const speedRecovery = braking.entrySpeed - prevBraking.exitSpeed
        if (Math.abs(speedRecovery) < 5) {
          comments.push(`🔗 组合弯：紧接 ${cr.prevCorner} 出弯（间距仅 ${cr.prevGapM}m），入弯速度取决于 ${cr.prevCorner} 的出弯质量。两弯要当作一个整体来规划走线。`)
        } else if (speedRecovery < -5) {
          comments.push(`🔗 组合弯：${cr.prevCorner} 出弯后到本弯入弯掉了 ${Math.round(Math.abs(speedRecovery))} km/h，间距 ${cr.prevGapM}m。过渡段可能存在不必要的减速或犹豫。`)
        }
      }
    }

    if (cr.linkedToNext && cr.nextCorner) {
      if (cr.sameDirectionAsNext) {
        comments.push(`🔗 同向组合：本弯与 ${cr.nextCorner} 同为${dir}弯且间距仅 ${cr.nextGapM}m，考虑用双弯心走法——不必在两弯之间加速，保持弧线连贯。`)
      } else {
        comments.push(`🔗 反向组合（S弯）：本弯 → ${cr.nextCorner} 方向相反，间距 ${cr.nextGapM}m。关键是本弯出弯走线为下一弯的入弯做好准备——出弯时将车挪到 ${cr.nextCorner} 的入弯外侧。`)
      }
    }

    if (cr.followedByLongStraight) {
      comments.push(`🏁 直道入口弯：后方直道约 ${cr.nextGapM}m。出弯速度每多 1 km/h，直道尾速可能多 2-3 km/h。这个弯的出弯质量比入弯速度重要得多——宁可入弯慢一点，换取更早补油和更高出弯速度。`)
    }

    // ---- 核心问题诊断（抓主因，不堆评论）----
    if (exitDecelerating) {
      // 最严重的问题：出弯还在减速
      comments.push(`🛑 核心问题——出弯减速：出弯 ${Math.round(braking.exitSpeed)} km/h < 弯心 ${Math.round(braking.minSpeed)} km/h。过了弯心仍在减速，通常是因为弯心切入太早，出弯段车头没朝向直道方向，被迫继续转向无法给油。`)
      if (braking.apexPosition === '早弯心') {
        comments.push(`→ 根因：弯心偏早（${braking.brakingPhaseRatio}%）。练法：推迟转向点，入弯时先走外线，让弯心位置延后到 55-65% 区间。目标是弯心后立刻感觉车头已经朝向出弯方向。`)
      } else {
        comments.push(`→ 练法：入弯时多等 1 秒再转向，让车身转到正确角度后再上油。用"视线引导"——过弯心后眼睛立即看出弯口。`)
      }
    } else if (isUnstable) {
      // 稳定性差——先一致再追速度
      comments.push(`⚠️ 核心问题——不稳定：该弯标准差 ${scoring.stdDev.toFixed(2)}s，波动过大。先不追快，而是建立稳定性。`)
      comments.push(`→ 练法：选一个固定的刹车参考点（路面标记或路缘石位置），连续 5 圈用完全相同的刹车点和转向点。目标：波动降到 ${(scoring.stdDev * 0.5).toFixed(2)}s 以内。`)
    } else if (heavyBraking && isTimeLossCorner) {
      // 重刹但掉时
      comments.push(`🛑 核心问题——制动过重：减速 ${Math.round(braking.brakingIntensity)} km/h，平均掉时 +${scoring.avgDelta.toFixed(2)}s。`)
      if (lgCorner && lgCorner.quickSpeeds.entry > lgCorner.slowSpeeds.entry + 3) {
        comments.push(`→ 快圈入弯 ${Math.round(lgCorner.quickSpeeds.entry)} km/h vs 慢圈 ${Math.round(lgCorner.slowSpeeds.entry)} km/h。根因：慢圈刹车太早或太重。练法：用拖刹（trail braking）代替一脚急刹——在转向的同时逐渐释放刹车，利用重心前移增加前轮抓地力。`)
      } else {
        comments.push(`→ 练法：将刹车分两段——先重刹降低初始速度，再用拖刹带入弯心。关键是在转向开始时仍然保持轻微刹车压力，利用载荷转移让前轮获得更多抓地力。`)
      }
    } else if (poorExitAccel && isTimeLossCorner) {
      // 出弯加速不足
      if (cr.followedByLongStraight) {
        comments.push(`⚡ 核心问题——出弯加速弱（仅 +${Math.round(braking.exitAcceleration)} km/h），且后接 ${cr.nextGapM}m 直道。这里每丢 1 km/h 出弯速度，整条直道都在掉时。`)
      } else {
        comments.push(`⚡ 核心问题——出弯加速不足（仅 +${Math.round(braking.exitAcceleration)} km/h），平均掉时 +${scoring.avgDelta.toFixed(2)}s。`)
      }
      if (lgCorner && lgCorner.quickSpeeds.exit > lgCorner.slowSpeeds.exit + 3) {
        comments.push(`→ 快圈出弯 ${Math.round(lgCorner.quickSpeeds.exit)} km/h vs 慢圈 ${Math.round(lgCorner.slowSpeeds.exit)} km/h。练法：过了弯心后视线立刻看出弯口，逐步开方向盘的同时逐步加油。目标出弯速度 ≥ ${Math.round(lgCorner.quickSpeeds.exit)} km/h。`)
      } else {
        comments.push(`→ 练法：弯心后立即开始渐进上油——先给 30% 油门，感觉前轮不再打滑后加到全油。关键是"开方向盘和上油同步"。`)
      }
    } else if (entryConstrained && isTimeLossCorner) {
      // 入弯受限于前一个弯
      comments.push(`🔗 核心问题——入弯速度受限：入弯 ${Math.round(braking.entrySpeed)} km/h 且几乎不刹车，说明速度瓶颈在上一弯（${cr.prevCorner}）的出弯。优先改善 ${cr.prevCorner} 的出弯加速。`)
    } else if (isTimeLossCorner) {
      // 一般性掉时
      comments.push(`📊 该弯平均掉时 +${scoring.avgDelta.toFixed(2)}s。`)
      if (lgCorner && lgCorner.gap > 0.2) {
        const qEntry = Math.round(lgCorner.quickSpeeds.entry)
        const sEntry = Math.round(lgCorner.slowSpeeds.entry)
        const qMin = Math.round(lgCorner.quickSpeeds.min)
        const sMin = Math.round(lgCorner.slowSpeeds.min)
        const qExit = Math.round(lgCorner.quickSpeeds.exit)
        const sExit = Math.round(lgCorner.slowSpeeds.exit)
        // Find the biggest speed gap phase
        const entryGap = qEntry - sEntry
        const minGap = qMin - sMin
        const exitGap = qExit - sExit
        const maxGap = Math.max(entryGap, minGap, exitGap)
        if (maxGap === entryGap && entryGap > 3) {
          comments.push(`→ 主要差距在入弯段：快圈 ${qEntry} km/h vs 慢圈 ${sEntry} km/h（差 ${entryGap} km/h）。慢圈刹车偏早或偏重。`)
        } else if (maxGap === minGap && minGap > 3) {
          comments.push(`→ 主要差距在弯心：快圈 ${qMin} km/h vs 慢圈 ${sMin} km/h（差 ${minGap} km/h）。慢圈可能走线偏紧或过度转向。`)
        } else if (maxGap === exitGap && exitGap > 3) {
          comments.push(`→ 主要差距在出弯：快圈 ${qExit} km/h vs 慢圈 ${sExit} km/h（差 ${exitGap} km/h）。慢圈补油太晚或弯心后仍在修正方向。`)
        }
      }
    }

    // ---- 刹车分析（每弯都输出）----
    if (braking.brakingIntensity > 15) {
      if (!heavyBraking || !isTimeLossCorner) {
        // 核心问题未覆盖时补充重刹说明
        comments.push(`🛑 刹车：制动力度大（减速 ${Math.round(braking.brakingIntensity)} km/h）。尝试更早、更轻收油，用拖刹（trail braking）代替急刹——在转向同时逐渐释放刹车，利用载荷转移增加前轮抓地力。`)
      }
    } else if (braking.brakingIntensity > 8) {
      const entryInfo = lgCorner
        ? `（快圈入弯 ${Math.round(lgCorner.quickSpeeds.entry)} km/h / 慢圈 ${Math.round(lgCorner.slowSpeeds.entry)} km/h）`
        : ''
      if (lgCorner && lgCorner.quickSpeeds.entry > lgCorner.slowSpeeds.entry + 3) {
        comments.push(`🛑 刹车：制动 ${Math.round(braking.brakingIntensity)} km/h${entryInfo}。慢圈入弯速度偏低，刹车点可以再晚 1-2 米。用拖刹（trail braking）——转向时逐渐释放刹车，利用载荷转移增加前轮抓地力。`)
      } else {
        comments.push(`🛑 刹车：制动 ${Math.round(braking.brakingIntensity)} km/h${entryInfo}。${isTimeLossCorner ? `该弯仍有掉时（+${scoring.avgDelta.toFixed(2)}s），检查刹车时机和力度的一致性。` : '刹车力度适中。'}`)
      }
    } else if (braking.brakingIntensity > 3) {
      comments.push(`🛑 刹车：轻刹（减速 ${Math.round(braking.brakingIntensity)} km/h），入弯 ${Math.round(braking.entrySpeed)} km/h → 弯心 ${Math.round(braking.minSpeed)} km/h。${isTimeLossCorner ? '虽然刹车不重但仍在掉时，问题可能在走线或出弯。' : '速度控制合理。'}`)
    } else {
      if (entryConstrained) {
        comments.push(`🛑 刹车：几乎不刹车（减速仅 ${Math.round(braking.brakingIntensity)} km/h），入弯速度取决于${cr.prevCorner ? ` ${cr.prevCorner} 出弯` : '前段'}。`)
      } else if (braking.entrySpeed < 45 && angle > 60) {
        comments.push(`🛑 刹车：入弯速度仅 ${Math.round(braking.entrySpeed)} km/h 且几乎不刹车——可能是前段加速不足，检查上一弯出弯加速和直道尾速。`)
      } else {
        comments.push(`🛑 刹车：几乎不制动（减速 ${Math.round(braking.brakingIntensity)} km/h），全速通过。${angle < 30 ? '高速弯不需要重刹。' : '入弯速度控制良好。'}`)
      }
    }
    // 入弯快慢圈速度差距
    if (lgCorner && lgCorner.quickSpeeds.entry > lgCorner.slowSpeeds.entry + 5) {
      comments.push(`🛑 入弯速度差距：快圈 ${Math.round(lgCorner.quickSpeeds.entry)} km/h vs 慢圈 ${Math.round(lgCorner.slowSpeeds.entry)} km/h（差 ${Math.round(lgCorner.quickSpeeds.entry - lgCorner.slowSpeeds.entry)} km/h），慢圈在进入该弯前已落后。`)
    }

    // ---- 转向/走线分析（基于弯道类型和弯心位置）----
    if (angle > 150) {
      // 掉头弯/发卡弯
      if (braking.apexPosition === '早弯心') {
        comments.push(`🔄 转向：${angle}°${dir}弯（${mc.type}），弯心偏早（${braking.brakingPhaseRatio}%）。掉头弯应用晚弯心策略——入弯先走大圈，推迟转向点，让车头在弯心后尽快朝向出弯方向。`)
      } else if (braking.apexPosition === '晚弯心') {
        comments.push(`🔄 转向：${angle}°${dir}弯（${mc.type}），晚弯心（${braking.brakingPhaseRatio}%），走线策略正确。专注保持弯心最低速稳定。`)
      } else {
        comments.push(`🔄 转向：${angle}°${dir}弯（${mc.type}），弯心居中。大角度弯尝试稍推迟弯心，用"慢进快出"策略换取更好出弯加速。`)
      }
    } else if (angle > 90) {
      // 中速弯
      if (braking.apexPosition === '早弯心') {
        comments.push(`🔄 转向：${angle}°${dir}弯，弯心偏早（${braking.brakingPhaseRatio}%）。过早切弯心导致出弯时车头没朝向直道，被迫继续转向无法给油。推迟入弯点 2-3 米。`)
      } else {
        comments.push(`🔄 转向：${angle}°${dir}弯，弯心位置${braking.apexPosition}（${braking.brakingPhaseRatio}%），走线合理。`)
      }
    } else {
      // 高速弯
      comments.push(`🔄 转向：${angle}°${dir}高速弯，关键是保持平滑转向输入，避免方向盘突然修正。目标是一把转向到位，减少转向角度。`)
    }

    // ---- 走线分析（来自 racing-line-analysis 模块）----
    if (racingLineAnalyses && racingLineAnalyses.length > 0) {
      // Aggregate racing line data across all comparison laps for this corner
      const cornerLineData = racingLineAnalyses
        .map(rla => rla.corners.find(c => c.cornerName === cName))
        .filter((c): c is NonNullable<typeof c> => c != null)

      if (cornerLineData.length > 0) {
        const lineParts: string[] = []

        // Average lateral deviation across all comparison laps
        const avgMeanDev = cornerLineData.reduce((s, c) => s + c.meanDeviation, 0) / cornerLineData.length
        const avgMaxDev = cornerLineData.reduce((s, c) => s + c.maxDeviation, 0) / cornerLineData.length
        if (Math.abs(avgMeanDev) > 0.3) {
          lineParts.push(`走线平均偏${avgMeanDev > 0 ? '外' : '内'} ${Math.abs(avgMeanDev).toFixed(1)}m（最大偏差 ${avgMaxDev.toFixed(1)}m）`)
        } else {
          lineParts.push(`走线偏差小（平均 ${Math.abs(avgMeanDev).toFixed(1)}m）`)
        }

        // Brake point comparison: comparison laps vs reference (fastest) lap
        const brakePtsWithRef = cornerLineData.filter(c => c.brakePoint && c.refBrakePoint)
        if (brakePtsWithRef.length > 0) {
          const avgBrakeSpeed = brakePtsWithRef.reduce((s, c) => s + c.brakePoint!.speed, 0) / brakePtsWithRef.length
          const refBrakeSpeed = brakePtsWithRef[0].refBrakePoint!.speed
          const avgBrakeIdx = brakePtsWithRef.reduce((s, c) => s + c.brakePoint!.pointIndex, 0) / brakePtsWithRef.length
          const refBrakeIdx = brakePtsWithRef[0].refBrakePoint!.pointIndex
          const idxDiff = avgBrakeIdx - refBrakeIdx  // negative = braking earlier than ref
          if (Math.abs(idxDiff) > 2) {
            lineParts.push(`刹车点比快圈${idxDiff < 0 ? '早' : '晚'}约 ${Math.abs(Math.round(idxDiff))} 个采样点（刹车速度 ${Math.round(avgBrakeSpeed)} vs 快圈 ${Math.round(refBrakeSpeed)} km/h）`)
          } else {
            lineParts.push(`刹车点与快圈一致（${Math.round(avgBrakeSpeed)} km/h）`)
          }
        }

        // Throttle point comparison
        const throttlePtsWithRef = cornerLineData.filter(c => c.throttlePoint && c.refThrottlePoint)
        if (throttlePtsWithRef.length > 0) {
          const avgThrottleSpeed = throttlePtsWithRef.reduce((s, c) => s + c.throttlePoint!.speed, 0) / throttlePtsWithRef.length
          const refThrottleSpeed = throttlePtsWithRef[0].refThrottlePoint!.speed
          const avgThrottleIdx = throttlePtsWithRef.reduce((s, c) => s + c.throttlePoint!.pointIndex, 0) / throttlePtsWithRef.length
          const refThrottleIdx = throttlePtsWithRef[0].refThrottlePoint!.pointIndex
          const idxDiff = avgThrottleIdx - refThrottleIdx  // positive = throttle later than ref
          if (Math.abs(idxDiff) > 2) {
            lineParts.push(`补油点比快圈${idxDiff > 0 ? '晚' : '早'}约 ${Math.abs(Math.round(idxDiff))} 个采样点（补油速度 ${Math.round(avgThrottleSpeed)} vs 快圈 ${Math.round(refThrottleSpeed)} km/h）`)
          } else {
            lineParts.push(`补油点与快圈一致（${Math.round(avgThrottleSpeed)} km/h）`)
          }
        }

        // Curvature consistency
        const avgConsistency = Math.round(cornerLineData.reduce((s, c) => s + c.curvatureConsistency, 0) / cornerLineData.length)
        if (avgConsistency < 70) {
          lineParts.push(`走线曲率一致性仅 ${avgConsistency}%，每圈走线变化大，需要固定走线`)
        } else if (avgConsistency < 85) {
          lineParts.push(`走线曲率一致性 ${avgConsistency}%，尚可但有优化空间`)
        } else {
          lineParts.push(`走线曲率一致性 ${avgConsistency}%，走线稳定`)
        }

        comments.push(`🎯 走线：${lineParts.join('。')}。`)
      }
    }

    // ---- 油门/出弯分析（每弯都输出）----
    if (exitDecelerating) {
      if (!exitDecelerating) {
        // 核心问题已覆盖，不重复
      }
      // 补充快慢圈出弯对比
      if (lgCorner && lgCorner.quickSpeeds.exit > lgCorner.slowSpeeds.exit + 3) {
        comments.push(`⚡ 出弯速度对比：快圈 ${Math.round(lgCorner.quickSpeeds.exit)} km/h vs 慢圈 ${Math.round(lgCorner.slowSpeeds.exit)} km/h。`)
      }
    } else if (braking.exitAcceleration < 2) {
      comments.push(`⚡ 油门：出弯加速不足（弯心 ${Math.round(braking.minSpeed)} → 出弯 ${Math.round(braking.exitSpeed)} km/h，仅 +${Math.round(braking.exitAcceleration)} km/h）。过了弯心应逐步上油，目标出弯比弯心快 5+ km/h。练习"眼睛看出弯口"——视线提前转向出弯方向，手和脚自然跟上。`)
      if (lgCorner && lgCorner.quickSpeeds.exit > lgCorner.slowSpeeds.exit + 3) {
        comments.push(`⚡ 出弯速度对比：快圈 ${Math.round(lgCorner.quickSpeeds.exit)} km/h vs 慢圈 ${Math.round(lgCorner.slowSpeeds.exit)} km/h，快圈出弯加速明显更好。`)
      }
    } else if (braking.exitAcceleration > 5) {
      comments.push(`⚡ 油门：出弯加速良好（+${Math.round(braking.exitAcceleration)} km/h，弯心 ${Math.round(braking.minSpeed)} → 出弯 ${Math.round(braking.exitSpeed)} km/h）。${isTimeLossCorner ? '出弯不是问题，掉时可能在入弯段的走线或刹车点。' : ''}${cr.followedByLongStraight ? '直道入口弯，继续保持强出弯加速。' : ''}`)
      if (lgCorner && lgCorner.quickSpeeds.exit > lgCorner.slowSpeeds.exit + 3) {
        comments.push(`⚡ 出弯速度对比：快圈 ${Math.round(lgCorner.quickSpeeds.exit)} km/h vs 慢圈 ${Math.round(lgCorner.slowSpeeds.exit)} km/h。`)
      }
    } else {
      comments.push(`⚡ 油门：出弯加速一般（+${Math.round(braking.exitAcceleration)} km/h，弯心 ${Math.round(braking.minSpeed)} → 出弯 ${Math.round(braking.exitSpeed)} km/h）。${isTimeLossCorner ? `该弯平均掉时 +${scoring.avgDelta.toFixed(2)}s，尝试更早开始渐进上油。` : '速度回升正常。'}`)
      if (lgCorner && lgCorner.quickSpeeds.exit > lgCorner.slowSpeeds.exit + 3) {
        comments.push(`⚡ 出弯速度对比：快圈 ${Math.round(lgCorner.quickSpeeds.exit)} km/h vs 慢圈 ${Math.round(lgCorner.slowSpeeds.exit)} km/h。`)
      }
    }

    // ---- 一致性/崩盘提醒 ----
    if (scoring.stdDev > 0.4) {
      if (!isUnstable) {
        // 核心问题没有诊断为不稳定（可能有更严重的问题），补充稳定性提醒
        comments.push(`⚠️ 稳定性：该弯波动大（标准差 ${scoring.stdDev.toFixed(2)}s）。先建立一致性——每圈用相同刹车点和转向点，连续 5 圈控制波动在 0.2s 以内。`)
      }
    } else if (scoring.stdDev > 0.15) {
      comments.push(`⚠️ 稳定性：该弯有一定波动（标准差 ${scoring.stdDev.toFixed(2)}s），注意保持刹车点和转向点的一致性。`)
    } else {
      comments.push(`⚠️ 稳定性：该弯一致性好（标准差 ${scoring.stdDev.toFixed(2)}s）。`)
    }

    if (scoring.maxSingleLoss > 1.0) {
      const fastestCornerTime = fastestAnalysis.corners[ci]?.duration ?? 0
      let worstLap = 0
      let worstDelta = 0
      for (const a of analyses) {
        if (a.corners[ci]) {
          const delta = a.corners[ci].duration - fastestCornerTime
          if (delta > worstDelta) { worstDelta = delta; worstLap = a.lap.id }
        }
      }
      comments.push(`⚠️ 第${worstLap}圈在此弯崩盘（丢 ${worstDelta.toFixed(2)}s）。复盘该圈：入弯速度过高导致跑大？还是注意力分散导致刹车晚了？`)
    }

    // ---- 快慢圈组差异（每弯都输出）----
    if (lgCorner) {
      const qEntry = Math.round(lgCorner.quickSpeeds.entry)
      const sEntry = Math.round(lgCorner.slowSpeeds.entry)
      const qMin2 = Math.round(lgCorner.quickSpeeds.min)
      const sMin2 = Math.round(lgCorner.slowSpeeds.min)
      const qExit2 = Math.round(lgCorner.quickSpeeds.exit)
      const sExit2 = Math.round(lgCorner.slowSpeeds.exit)
      if (lgCorner.gap > 0.1) {
        const details: string[] = []
        if (qEntry !== sEntry) details.push(`入弯 ${qEntry}/${sEntry}`)
        if (qMin2 !== sMin2) details.push(`弯心 ${qMin2}/${sMin2}`)
        if (qExit2 !== sExit2) details.push(`出弯 ${qExit2}/${sExit2}`)
        comments.push(`📊 快慢圈对比：慢圈在此弯多掉 ${lgCorner.gap.toFixed(2)}s。速度（快/慢 km/h）：${details.join('，')}。${lgCorner.gap > 0.3 && qMin2 > sMin2 + 2 ? '慢圈弯心速度明显偏低，可能入弯刹车过猛或走线偏内。' : ''}`)
      } else {
        comments.push(`📊 快慢圈对比：此弯快慢圈差距小（${lgCorner.gap.toFixed(2)}s），表现一致。`)
      }
    }

    // ---- ROI 标记 ----
    if (maxQSGapCorner && lgCorner && lgCorner.corner === maxQSGapCorner.corner && maxQSGapCorner.gap > 0.1) {
      comments.push(`🏆 全场最高 ROI 弯——快慢圈差距 ${lgCorner.gap.toFixed(2)}s，改善此弯对圈速提升最大。`)
    }

    // ---- 做得好的弯 ----
    if (scoring.avgDelta < 0.02 && scoring.stdDev < 0.2) {
      if (comments.length === 0) {
        comments.push(`✅ 该弯稳定且接近最佳，优先级低。`)
      }
    }

    if (comments.length === 0) {
      comments.push(`该弯数据暂无明显问题，建议增加圈数采集更多数据。`)
    }

    cornerNarrative.push({ corner: cName, comments })
  }

  // === 13. Priority Zones — top 3 areas of highest ROI ===
  // Score each corner considering strategic role (exit before straight > linked > standalone)
  const zoneScoring: { corner: string; zoneScore: number; ci: number }[] = []
  for (let ci = 0; ci < numCorners; ci++) {
    const cName = corners[ci].name
    const scoring2 = cornerScoring.find(s => s.corner === cName)
    const cr = cornerRoles[ci]
    if (!scoring2) continue

    let multiplier = 1.0
    if (cr.followedByLongStraight) multiplier = 1.5  // exit corners are worth more
    if (cr.linkedToNext || cr.linkedToPrev) multiplier = Math.max(multiplier, 1.2)
    zoneScoring.push({ corner: cName, zoneScore: scoring2.score * multiplier, ci })
  }
  zoneScoring.sort((a, b) => b.zoneScore - a.zoneScore)

  const priorityZones: FullAnalysis['trackStrategy']['priorityZones'] = []
  const usedCorners = new Set<string>()

  for (const zs of zoneScoring) {
    if (priorityZones.length >= 3) break
    if (usedCorners.has(zs.corner)) continue

    const cr = cornerRoles[zs.ci]
    const scoring2 = cornerScoring.find(s => s.corner === zs.corner)!
    const lgCorner2 = lapGroupsPerCorner.find(l => l.corner === zs.corner)
    const braking2 = brakingPattern.find(b => b.corner === zs.corner)
    if (!braking2) continue

    // Determine zone (include linked corners)
    const zoneCorners: string[] = [zs.corner]
    usedCorners.add(zs.corner)
    if (cr.linkedToNext && cr.nextCorner && !usedCorners.has(cr.nextCorner)) {
      zoneCorners.push(cr.nextCorner)
      usedCorners.add(cr.nextCorner)
    }
    if (cr.linkedToPrev && cr.prevCorner && !usedCorners.has(cr.prevCorner)) {
      zoneCorners.unshift(cr.prevCorner)
      usedCorners.add(cr.prevCorner)
    }

    const zoneName = zoneCorners.join('→') + (cr.followedByLongStraight ? '→直道' : '')

    // Generate symptom, root cause, practice
    let symptom = ''
    let rootCause = ''
    let practice = ''

    if (braking2.exitAcceleration < -2) {
      symptom = `出弯减速（${Math.round(braking2.exitSpeed)} < ${Math.round(braking2.minSpeed)} km/h）`
      rootCause = braking2.apexPosition === '早弯心' ? '弯心偏早，出弯段车头未朝向直道' : '出弯段仍在转向或刹车'
      practice = '推迟转向点，用晚弯心策略，弯心后视线看出弯口'
    } else if (scoring2.stdDev > 0.4) {
      symptom = `波动大（标准差 ${scoring2.stdDev.toFixed(2)}s）`
      rootCause = '刹车点和转向点不一致'
      practice = '选固定参考点，连续5圈用相同刹车时机'
    } else if (lgCorner2 && lgCorner2.gap > 0.2) {
      const phases = []
      if (lgCorner2.quickSpeeds.entry - lgCorner2.slowSpeeds.entry > 3) phases.push('入弯')
      if (lgCorner2.quickSpeeds.min - lgCorner2.slowSpeeds.min > 3) phases.push('弯心')
      if (lgCorner2.quickSpeeds.exit - lgCorner2.slowSpeeds.exit > 3) phases.push('出弯')
      symptom = `快慢圈差距 ${lgCorner2.gap.toFixed(2)}s`
      rootCause = phases.length > 0 ? `慢圈在${phases.join('、')}阶段掉速` : '整体节奏偏慢'
      practice = phases.includes('出弯') ? '弯心后渐进上油，目标达到快圈出弯速度' : phases.includes('入弯') ? '延迟刹车点，参考快圈入弯速度' : '模仿快圈节奏'
    } else {
      symptom = `平均掉时 +${scoring2.avgDelta.toFixed(2)}s`
      rootCause = '综合表现低于最佳水平'
      practice = '参考最佳圈走线和节奏'
    }

    const targetGain = cr.followedByLongStraight
      ? `弯道可省 ~${scoring2.avgDelta.toFixed(2)}s + 直道尾速收益`
      : `可省 ~${scoring2.avgDelta.toFixed(2)}s`

    priorityZones.push({
      zone: zoneName,
      corners: zoneCorners,
      symptom,
      rootCause,
      practice,
      targetGain,
      priority: priorityZones.length + 1,
    })
  }

  // === 14. Training Closure ===
  const trainingClosure: FullAnalysis['trackStrategy']['trainingClosure'] = []
  if (priorityZones.length > 0) {
    const topZone = priorityZones[0]
    trainingClosure.push({
      focus: `接下来 5 圈专注 ${topZone.zone}`,
      metric: topZone.symptom.includes('波动') ? '标准差' : topZone.symptom.includes('出弯') ? '出弯速度' : '弯道用时',
      target: topZone.symptom.includes('波动')
        ? `波动降到 ${(parseFloat(topZone.symptom.match(/[\d.]+/)?.[0] ?? '0.5') * 0.5).toFixed(2)}s 以内`
        : `该区域用时稳定在最快圈 +0.1s 以内`,
    })
    if (priorityZones.length > 1) {
      trainingClosure.push({
        focus: `巩固后换重点到 ${priorityZones[1].zone}`,
        metric: '弯道用时差异',
        target: `快慢圈差距缩小 50%`,
      })
    }
  }

  const trackStrategy: FullAnalysis['trackStrategy'] = {
    overallApproach,
    cornerRoles,
    priorityZones,
    trainingClosure,
  }

  return {
    theoreticalBest: {
      time: theoreticalBestTime,
      savings: theoreticalSavings,
      perCorner: perCornerBest,
    },
    cornerPriority,
    consistency: consistencyData,
    lapTrend: {
      laps: lapTrendData,
      trend,
      peakRange,
      worstRange,
    },
    fastestVsSlowest: {
      fastestLap: fastestLap.id,
      slowestLap: slowestLap.id,
      fastestTime: fastestLap.duration,
      slowestTime: slowestLap.duration,
      totalDelta,
      perCorner: fvsPerCorner,
    },
    brakingPattern,
    lapGroups,
    cornerCorrelation,
    trainingPlan,
    cornerScoring,
    cornerNarrative,
    trackStrategy,
  }
}
