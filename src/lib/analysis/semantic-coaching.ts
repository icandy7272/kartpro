import type { Corner, GPSPoint, LapAnalysis } from '../../types'
import type { FullAnalysis } from './full-analysis'
import type { SemanticTag, TrackSemanticModel } from './semantic-types'

const ACTIVE_TAG_STATUSES = new Set<SemanticTag['status']>([
  'auto-active',
  'confirmed-active',
  'overridden-active',
])

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

function findActiveTags(semanticModel?: TrackSemanticModel): SemanticTag[] {
  if (!semanticModel) return []
  return semanticModel.semanticTags.filter((tag) => ACTIVE_TAG_STATUSES.has(tag.status))
}

function mergeComments(
  existing: Map<string, string[]>,
  cornerName: string,
  comment: string,
): void {
  const comments = existing.get(cornerName) ?? []
  comments.push(comment)
  existing.set(cornerName, comments)
}

export function buildSemanticCoachingContext(args: {
  corners: Corner[]
  analyses: LapAnalysis[]
  semanticModel?: TrackSemanticModel
  cornerScoring: FullAnalysis['cornerScoring']
  lapGroups: FullAnalysis['lapGroups']
}): Pick<FullAnalysis, 'trackStrategy' | 'cornerNarrative'> {
  const activeTags = findActiveTags(args.semanticModel)
  if (activeTags.length === 0 || args.corners.length === 0 || args.analyses.length === 0) {
    return {
      trackStrategy: {
        overallApproach: '',
        cornerRoles: [],
        priorityZones: [],
        trainingClosure: [],
      },
      cornerNarrative: [],
    }
  }

  const orderedCorners = [...args.corners].sort((a, b) => a.startIndex - b.startIndex)
  const fastestLap = args.analyses.reduce(
    (best, analysis) => (analysis.lap.duration < best.lap.duration ? analysis : best),
    args.analyses[0],
  ).lap
  const cornerById = new Map(orderedCorners.map((corner) => [corner.id, corner]))
  const scoreByCorner = new Map(args.cornerScoring.map((entry) => [entry.corner, entry]))
  const lapGroupByCorner = new Map(args.lapGroups.perCorner.map((entry) => [entry.corner, entry]))
  const mustHitExitIds = new Set<number>()
  const compoundPairs: number[][] = []
  const setupPairs: number[][] = []
  const sacrificePairs: number[][] = []

  for (const tag of activeTags) {
    if (tag.tagType === 'must-hit-exit' && tag.targetCornerIds[0] != null) {
      mustHitExitIds.add(tag.targetCornerIds[0])
    }
    if (tag.tagType === 'compound-corner' && tag.targetCornerIds.length >= 2) {
      compoundPairs.push(tag.targetCornerIds.slice(0, 2))
    }
    if (tag.tagType === 'setup-corner' && tag.targetCornerIds.length >= 2) {
      setupPairs.push(tag.targetCornerIds.slice(0, 2))
    }
    if (tag.tagType === 'sacrifice-entry' && tag.targetCornerIds.length >= 2) {
      sacrificePairs.push(tag.targetCornerIds.slice(0, 2))
    }
  }

  const linkedToNextIds = new Set(compoundPairs.map((pair) => pair[0]))
  const linkedToPrevIds = new Set(compoundPairs.map((pair) => pair[1]))

  const cornerRoles: FullAnalysis['trackStrategy']['cornerRoles'] = orderedCorners.map((corner, index) => {
    const nextCorner = orderedCorners[index + 1] ?? null
    const prevCorner = orderedCorners[index - 1] ?? null

    let nextGapM = 0
    if (nextCorner) {
      nextGapM = cornerDistance(fastestLap.points, corner.endIndex, nextCorner.startIndex)
    } else {
      nextGapM = cornerDistance(fastestLap.points, corner.endIndex, fastestLap.points.length - 1)
      if (orderedCorners[0]) {
        nextGapM += cornerDistance(fastestLap.points, 0, orderedCorners[0].startIndex)
      }
    }

    let prevGapM = 0
    if (prevCorner) {
      prevGapM = cornerDistance(fastestLap.points, prevCorner.endIndex, corner.startIndex)
    } else {
      prevGapM = cornerDistance(fastestLap.points, 0, corner.startIndex)
    }

    const linkedToNext = linkedToNextIds.has(corner.id)
    const linkedToPrev = linkedToPrevIds.has(corner.id)
    const followedByLongStraight = mustHitExitIds.has(corner.id)

    return {
      corner: corner.name,
      role: followedByLongStraight ? '直道入口弯' : linkedToNext || linkedToPrev ? '组合弯' : '独立弯',
      nextGapM: Math.round(nextGapM),
      prevGapM: Math.round(prevGapM),
      followedByLongStraight,
      linkedToNext,
      linkedToPrev,
      nextCorner: nextCorner?.name ?? null,
      prevCorner: prevCorner?.name ?? null,
      sameDirectionAsNext: nextCorner ? corner.direction === nextCorner.direction : false,
    }
  })

  const mustHitCornerNames = orderedCorners
    .filter((corner) => mustHitExitIds.has(corner.id))
    .map((corner) => corner.name)
  const compoundZoneNames = compoundPairs
    .map((pair) =>
      pair
        .map((cornerId) => cornerById.get(cornerId)?.name)
        .filter((name): name is string => Boolean(name))
        .join('→'),
    )
    .filter(Boolean)
  const setupZoneNames = setupPairs
    .map(([setupId, targetId]) => {
      const setupCorner = cornerById.get(setupId)?.name
      const targetCorner = cornerById.get(targetId)?.name
      return setupCorner && targetCorner ? `${setupCorner} 为 ${targetCorner} 铺路` : null
    })
    .filter((name): name is string => Boolean(name))

  const approachParts: string[] = []
  if (mustHitCornerNames.length > 0) {
    approachParts.push(
      `关键出弯：${mustHitCornerNames.join('、')} 是整圈收益兑现点，宁可保守一点入弯，也要把车头摆正后尽早拿到出弯速度`,
    )
  }
  if (compoundZoneNames.length > 0) {
    approachParts.push(
      `组合弯：${compoundZoneNames.join('，')} 必须按同一个节奏区处理，前一弯要为后一弯的出弯位置服务`,
    )
  }
  if (setupZoneNames.length > 0) {
    approachParts.push(`节奏衔接：${setupZoneNames.join('，')}，不要只盯着单弯表面速度`)
  }

  const overallApproach =
    approachParts.length > 0
      ? `本赛道的语义重点是：${approachParts.join('。')}。`
      : ''

  const zoneCandidates: Array<{
    score: number
    zone: string
    corners: string[]
    symptom: string
    rootCause: string
    practice: string
    targetGain: string
  }> = []

  for (const pair of compoundPairs) {
    const zoneCorners = pair
      .map((cornerId) => cornerById.get(cornerId)?.name)
      .filter((name): name is string => Boolean(name))
    if (zoneCorners.length < 2) continue
    const zoneScore = zoneCorners.reduce(
      (sum, cornerName) => sum + (scoreByCorner.get(cornerName)?.score ?? 0),
      0,
    ) * 1.8
    zoneCandidates.push({
      score: zoneScore,
      zone: zoneCorners.join('→'),
      corners: zoneCorners,
      symptom: '组合区节奏没有连成一个动作',
      rootCause: '前一弯没有主动为后一弯的车位和出弯角度服务',
      practice: `把 ${zoneCorners[0]} 的线路设计成 ${zoneCorners[zoneCorners.length - 1]} 的入弯准备动作，练连续视线切换和一次成型的节奏`,
      targetGain: '减少中间多余修正，把整段节奏收紧成一个完整区间',
    })
  }

  for (const cornerId of mustHitExitIds) {
    const corner = cornerById.get(cornerId)
    if (!corner) continue
    const score = scoreByCorner.get(corner.name)?.score ?? 0
    const lapGroup = lapGroupByCorner.get(corner.name)
    zoneCandidates.push({
      score: score * 1.4 + 1,
      zone: corner.name,
      corners: [corner.name],
      symptom: lapGroup
        ? `快慢圈在出弯兑现上仍有 ${lapGroup.gap.toFixed(2)}s 差距`
        : '关键出弯收益没有稳定兑现',
      rootCause: '入弯速度和弯心位置还没有为更早开油门服务',
      practice: `宁可少带一点入弯速度，也要让 ${corner.name} 的车头更早对准出弯方向，再去兑现油门`,
      targetGain: '提升出弯初速，把收益持续带到后续直线或加速段',
    })
  }

  const priorityZones = zoneCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((candidate, index) => ({
      zone: candidate.zone,
      corners: candidate.corners,
      symptom: candidate.symptom,
      rootCause: candidate.rootCause,
      practice: candidate.practice,
      targetGain: candidate.targetGain,
      priority: index + 1,
    }))

  const trainingClosure: FullAnalysis['trackStrategy']['trainingClosure'] =
    priorityZones.length > 0
      ? [
          {
            focus: `接下来优先打磨 ${priorityZones[0].zone}`,
            metric: priorityZones[0].corners.length > 1 ? '组合区节奏完整度' : '出弯速度兑现',
            target: priorityZones[0].corners.length > 1 ? '把整段当作一个动作完成，减少中间修正' : '更早摆正车头并提前开油',
          },
        ]
      : []

  const semanticComments = new Map<string, string[]>()

  for (const cornerId of mustHitExitIds) {
    const corner = cornerById.get(cornerId)
    if (!corner) continue
    const lapGroup = lapGroupByCorner.get(corner.name)
    const exitDelta = lapGroup
      ? Math.round(lapGroup.quickSpeeds.exit - lapGroup.slowSpeeds.exit)
      : null
    mergeComments(
      semanticComments,
      corner.name,
      exitDelta !== null && exitDelta > 0
        ? `语义重点：${corner.name} 是关键出弯弯。快慢圈出弯速度还差 ${exitDelta} km/h，先把车头摆正，再更早、更坚决地兑现油门。`
        : `语义重点：${corner.name} 是关键出弯弯。这里的首要目标不是“带更多入弯速度”，而是更早摆正车头并兑现出弯速度。`,
    )
  }

  for (const [entryId, exitId] of compoundPairs) {
    const entryCorner = cornerById.get(entryId)
    const exitCorner = cornerById.get(exitId)
    if (!entryCorner || !exitCorner) continue
    mergeComments(
      semanticComments,
      entryCorner.name,
      `语义重点：${entryCorner.name}→${exitCorner.name} 是组合弯，第一弯的速度和车位要为第二弯的出弯质量服务，不要把它拆成两个独立动作。`,
    )
    mergeComments(
      semanticComments,
      exitCorner.name,
      `语义重点：延续 ${entryCorner.name}→${exitCorner.name} 的整段节奏，把当前弯当成上一弯的下半段来完成，避免两弯之间多余修正。`,
    )
  }

  for (const [setupId, targetId] of setupPairs) {
    const setupCorner = cornerById.get(setupId)
    const targetCorner = cornerById.get(targetId)
    if (!setupCorner || !targetCorner) continue
    mergeComments(
      semanticComments,
      setupCorner.name,
      `语义重点：${setupCorner.name} 的任务是为 ${targetCorner.name} 铺路。允许这里牺牲一点表面速度，换取下一个关键弯更容易把车摆正。`,
    )
  }

  for (const [entryId, targetId] of sacrificePairs) {
    const entryCorner = cornerById.get(entryId)
    const targetCorner = cornerById.get(targetId)
    if (!entryCorner || !targetCorner) continue
    mergeComments(
      semanticComments,
      entryCorner.name,
      `语义重点：${entryCorner.name} 可以接受更保守的入弯姿态，目标是把轮胎和车身状态留给 ${targetCorner.name} 的真正收益点。`,
    )
  }

  return {
    trackStrategy: {
      overallApproach,
      cornerRoles,
      priorityZones,
      trainingClosure,
    },
    cornerNarrative: orderedCorners
      .map((corner) => ({
        corner: corner.name,
        comments: semanticComments.get(corner.name) ?? [],
      }))
      .filter((entry) => entry.comments.length > 0),
  }
}
