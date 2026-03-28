import type { Lap, Corner, LapAnalysis } from '../../types'

export interface FullAnalysis {
  theoreticalBest: {
    time: number
    savings: number
    perCorner: { corner: string; bestTime: number; bestLap: number; savedVsFastest: number }[]
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
  analyses: LapAnalysis[]
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

    perCornerBest.push({
      corner: corners[ci].name,
      bestTime,
      bestLap: bestLapId,
      savedVsFastest: fastestCornerTime - bestTime,
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
  const lapTimes = analyses.map((a) => a.lap.duration)

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

  // === 11. Expert Coaching Narrative (世界级赛车教练建议) ===
  const maxQSGapCorner = sortedByQSGap.length > 0 ? sortedByQSGap[0] : null

  const cornerNarrative: FullAnalysis['cornerNarrative'] = []
  for (let ci = 0; ci < numCorners; ci++) {
    const cName = corners[ci].name
    const mc = corners[ci]
    const scoring = cornerScoring.find((s) => s.corner === cName)
    const lgCorner = lapGroupsPerCorner.find((l) => l.corner === cName)
    const braking = brakingPattern.find((b) => b.corner === cName)
    const consistEntry = consistencyData.find((c) => c.corner === cName)

    if (!scoring || !braking) continue

    const comments: string[] = []
    const dir = braking.direction === '左' ? '左' : '右'
    const angle = braking.angle

    // ---- 刹车建议 ----
    const isTimeLossCorner = scoring.avgDelta > 0.05
    if (braking.brakingIntensity > 15) {
      comments.push(`🛑 刹车：制动力度过大（减速 ${Math.round(braking.brakingIntensity)} km/h）。尝试更早、更轻地收油，用拖刹（trail braking）代替急刹，保持前轮载荷的同时逐步转向。`)
    } else if (braking.brakingIntensity > 8) {
      if (lgCorner && lgCorner.quickSpeeds.entry > lgCorner.slowSpeeds.entry + 3) {
        comments.push(`🛑 刹车：慢圈入弯速度偏低（${Math.round(lgCorner.slowSpeeds.entry)} km/h vs 快圈 ${Math.round(lgCorner.quickSpeeds.entry)} km/h），刹车点可以再晚 1-2 米。`)
      } else if (isTimeLossCorner) {
        comments.push(`🛑 刹车：制动 ${Math.round(braking.brakingIntensity)} km/h，但该弯仍有掉时（平均 +${scoring.avgDelta.toFixed(2)}s），检查刹车时机和力度的一致性。`)
      }
    } else if (braking.brakingIntensity < 3) {
      // Low braking — could be good (high-speed bend) or bad (too slow entry)
      if (braking.entrySpeed < 45 && angle > 60) {
        comments.push(`🛑 刹车：入弯速度仅 ${Math.round(braking.entrySpeed)} km/h，不需要刹车可能是因为前段加速不足。检查上一个弯的出弯加速和直道尾速是否到位。`)
      } else if (isTimeLossCorner) {
        comments.push(`🛑 刹车：几乎不刹车但仍在掉时（+${scoring.avgDelta.toFixed(2)}s），问题可能不在刹车，而在走线或出弯油门。`)
      }
    }
    // Always add entry speed comparison if there's a gap
    if (lgCorner && lgCorner.quickSpeeds.entry > lgCorner.slowSpeeds.entry + 5 && braking.brakingIntensity <= 8) {
      comments.push(`🛑 入弯速度差距大：快圈 ${Math.round(lgCorner.quickSpeeds.entry)} km/h vs 慢圈 ${Math.round(lgCorner.slowSpeeds.entry)} km/h。速度差 ${Math.round(lgCorner.quickSpeeds.entry - lgCorner.slowSpeeds.entry)} km/h 说明慢圈在进入该弯前就已经落后。`)
    }

    // ---- 转向建议（基于弯心位置和弯道类型）----
    if (angle > 150) {
      // 掉头弯/发卡弯
      if (braking.apexPosition === '早弯心') {
        comments.push(`🔄 转向：${angle}°${dir}弯（${mc.type}），弯心偏早（${braking.brakingPhaseRatio}%）。掉头弯应该用晚弯心策略——入弯时先走大圈，推迟转向点，让车头在弯心后尽快朝向出弯方向。`)
      } else if (braking.apexPosition === '晚弯心') {
        comments.push(`🔄 转向：${angle}°${dir}弯（${mc.type}），晚弯心（${braking.brakingPhaseRatio}%），走线策略正确。专注保持弯心最低速的稳定性。`)
      } else {
        comments.push(`🔄 转向：${angle}°${dir}弯（${mc.type}），弯心居中。对于大角度弯，尝试稍微推迟弯心，用"慢进快出"策略换取更好的出弯加速。`)
      }
    } else if (angle > 90) {
      // 中速弯/发卡弯
      if (braking.apexPosition === '早弯心') {
        comments.push(`🔄 转向：${angle}°${dir}弯，弯心偏早（${braking.brakingPhaseRatio}%）。过早切弯心会导致出弯时车头还没朝向直道，被迫继续转向而无法给油。推迟入弯点 2-3 米。`)
      } else {
        comments.push(`🔄 转向：${angle}°${dir}弯，弯心位置${braking.apexPosition}（${braking.brakingPhaseRatio}%），走线合理。`)
      }
    } else {
      // 高速弯
      comments.push(`🔄 转向：${angle}°${dir}高速弯，关键是保持平滑的转向输入，避免方向盘的突然修正。目标是一把转向到位，尽量减少转向角度。`)
    }

    // ---- 油门建议（基于出弯加速）----
    if (braking.exitAcceleration < -2) {
      comments.push(`⚡ 油门：出弯仍在减速（出弯 ${Math.round(braking.exitSpeed)} < 弯心 ${Math.round(braking.minSpeed)} km/h）！这是最大的时间杀手。原因通常是 apex 后车头还没朝向直道，被迫继续转向。修正方法：晚入弯 → 晚转向 → 弯心后车头朝直道 → 立刻上油。`)
    } else if (braking.exitAcceleration < 2) {
      comments.push(`⚡ 油门：出弯加速不足（仅 +${Math.round(braking.exitAcceleration)} km/h）。过了弯心后应该逐步上油，目标是出弯速度比弯心快 5+ km/h。练习"眼睛看出弯口"——视线提前转向出弯方向，手和脚会自然跟上。`)
      if (lgCorner && lgCorner.quickSpeeds.exit > lgCorner.slowSpeeds.exit + 3) {
        comments.push(`  → 快圈出弯 ${Math.round(lgCorner.quickSpeeds.exit)} km/h vs 慢圈 ${Math.round(lgCorner.slowSpeeds.exit)} km/h，快圈的出弯加速明显更好。`)
      }
    } else if (braking.exitAcceleration > 5) {
      if (isTimeLossCorner) {
        comments.push(`⚡ 油门：出弯加速不错（+${Math.round(braking.exitAcceleration)} km/h），但该弯仍在掉时。问题可能在入弯段——入弯走线或刹车点需要调整。`)
      }
    } else {
      if (isTimeLossCorner) {
        comments.push(`⚡ 油门：出弯加速一般（+${Math.round(braking.exitAcceleration)} km/h），该弯平均掉时 +${scoring.avgDelta.toFixed(2)}s。尝试更早开始渐进上油。`)
      }
    }

    // ---- 一致性/稳定性提醒 ----
    if (scoring.stdDev > 0.4) {
      comments.push(`⚠️ 稳定性：该弯波动大（标准差 ${scoring.stdDev.toFixed(2)}s）。先不追求更快，而是每圈用相同的刹车点和转向点，建立肌肉记忆。连续 5 圈控制波动在 0.2s 以内。`)
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
      comments.push(`⚠️ 第${worstLap}圈在此弯崩盘（丢 ${worstDelta.toFixed(2)}s）。复盘该圈：是入弯速度过高导致跑大？还是注意力分散导致刹车晚了？`)
    }

    // ---- 快慢圈组差异提醒 ----
    if (lgCorner && lgCorner.gap > 0.3) {
      const qMin = Math.round(lgCorner.quickSpeeds.min)
      const sMin = Math.round(lgCorner.slowSpeeds.min)
      comments.push(`📊 快慢圈对比：慢圈在此弯平均多掉 ${lgCorner.gap.toFixed(2)}s。弯心速度差异 ${qMin} vs ${sMin} km/h${qMin > sMin + 2 ? '，慢圈弯心速度明显偏低，可能是入弯刹车过猛或走线偏内' : ''}。`)
    }

    // ---- 总结性建议 ----
    if (maxQSGapCorner && lgCorner && lgCorner.corner === maxQSGapCorner.corner && maxQSGapCorner.gap > 0.1) {
      comments.push(`🏆 这是本节训练中 ROI 最高的弯——快慢圈差距最大（${lgCorner.gap.toFixed(2)}s），解决这个弯可以最有效地提升平均圈速。`)
    }
    if (scoring.avgDelta < 0.02 && scoring.stdDev < 0.2 && comments.length === 0) {
      comments.push(`✅ 该弯已经很稳定且接近最佳，当前优先级低。`)
    }
    // If no comments were generated (no issues detected), note it explicitly
    if (comments.length === 0) {
      comments.push(`该弯数据暂无明显问题，建议增加圈数采集更多数据后再分析。`)
    }

    cornerNarrative.push({ corner: cName, comments })
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
  }
}
