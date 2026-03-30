import { buildTrackSkeleton } from './track-semantics'
import type {
  InferTrackSemanticsArgs,
  SemanticConfirmation,
  SemanticReasonCode,
  SemanticTag,
  SemanticTagType,
  TrackSemanticModel,
} from './semantic-types'

const HIGH_CONFIDENCE = 0.8
const MEDIUM_CONFIDENCE = 0.55
const LONG_STRAIGHT_M = 80
const SHORT_CONNECTOR_MAX_M = 25

interface SemanticCandidate {
  tagType: SemanticTagType
  targetCornerIds: number[]
  score: number
  reasonCodes: SemanticReasonCode[]
  explanation: string
  prompt: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function makeSemanticId(tagType: SemanticTagType, targetCornerIds: number[]): string {
  return `${tagType}:${targetCornerIds.join('-')}`
}

function applyConfidencePolicy(
  candidate: SemanticCandidate,
  semanticTags: SemanticTag[],
  pendingConfirmations: SemanticConfirmation[],
): void {
  const rawScore = candidate.score
  const confidence = Number(rawScore.toFixed(2))
  const id = makeSemanticId(candidate.tagType, candidate.targetCornerIds)

  if (rawScore >= HIGH_CONFIDENCE) {
    semanticTags.push({
      id,
      tagType: candidate.tagType,
      targetCornerIds: candidate.targetCornerIds,
      confidence,
      reasonCodes: candidate.reasonCodes,
      explanation: candidate.explanation,
      status: 'auto-active',
    })
  } else if (rawScore >= MEDIUM_CONFIDENCE) {
    pendingConfirmations.push({
      id,
      tagType: candidate.tagType,
      targetCornerIds: candidate.targetCornerIds,
      confidence,
      prompt: candidate.prompt,
      recommendation: 'review',
    })
  }
}

export function inferTrackSemantics(args: InferTrackSemanticsArgs): TrackSemanticModel {
  const skeleton = buildTrackSkeleton({
    corners: args.corners,
    referenceLap: args.referenceLap,
  })
  const cornerById = new Map(args.corners.map((corner) => [corner.id, corner]))
  const straightByFromCornerId = new Map(
    skeleton.straights.map((straight) => [straight.fromCornerId, straight]),
  )
  const semanticTags: SemanticTag[] = []
  const pendingConfirmations: SemanticConfirmation[] = []

  for (const straight of skeleton.straights) {
    const fromCorner = cornerById.get(straight.fromCornerId)
    if (!fromCorner) continue

    const lengthScore = clamp((straight.lengthM - 60) / 70, 0, 1)
    const exitSpeedDeltaScore = clamp((fromCorner.exitSpeed - fromCorner.minSpeed) / 30, 0, 1)
    const score = clamp(
      0.35 + lengthScore * 0.45 + exitSpeedDeltaScore * 0.15 + (straight.lengthM >= LONG_STRAIGHT_M ? 0.1 : 0),
      0,
      1,
    )
    const reasonCodes: SemanticReasonCode[] = []
    if (straight.lengthM >= LONG_STRAIGHT_M) {
      reasonCodes.push('LONG_STRAIGHT_AFTER_CORNER')
    }
    if (exitSpeedDeltaScore >= 0.4) {
      reasonCodes.push('EXIT_SPEED_PROPAGATES')
    }

    applyConfidencePolicy(
      {
        tagType: 'must-hit-exit',
        targetCornerIds: [straight.fromCornerId],
        score,
        reasonCodes,
        explanation: `${fromCorner.name} feeds a ${Math.round(straight.lengthM)}m straight where exit quality carries downstream.`,
        prompt: `Review whether ${fromCorner.name} should be treated as a must-hit-exit corner.`,
      },
      semanticTags,
      pendingConfirmations,
    )
  }

  for (const relationship of skeleton.relationships) {
    const fromCorner = cornerById.get(relationship.fromCornerId)
    const toCorner = cornerById.get(relationship.toCornerId)
    if (!fromCorner || !toCorner) continue

    const shortnessScore = clamp(
      (SHORT_CONNECTOR_MAX_M - relationship.viaStraightLengthM) / SHORT_CONNECTOR_MAX_M,
      0,
      1,
    )
    const linkedRhythmScore = fromCorner.direction === toCorner.direction ? 1 : 0.5
    const score = clamp(0.52 + shortnessScore * 0.2 + linkedRhythmScore * 0.1, 0, 1)

    const reasonCodes: SemanticReasonCode[] = ['ADJACENT_SHORT_STRAIGHT']
    if (fromCorner.direction === toCorner.direction) {
      reasonCodes.push('LINKED_RHYTHM_PATTERN')
    }

    applyConfidencePolicy(
      {
        tagType: 'compound-corner',
        targetCornerIds: [relationship.fromCornerId, relationship.toCornerId],
        score,
        reasonCodes,
        explanation: `${fromCorner.name} and ${toCorner.name} are connected by a ${Math.round(
          relationship.viaStraightLengthM,
        )}m link and should likely be coached as one rhythm.`,
        prompt: `Review whether ${fromCorner.name} + ${toCorner.name} should be coached as a compound corner.`,
      },
      semanticTags,
      pendingConfirmations,
    )
  }

  for (const straight of skeleton.straights) {
    const downstream = straightByFromCornerId.get(straight.toCornerId)
    if (!downstream) continue

    const fromCorner = cornerById.get(straight.fromCornerId)
    const toCorner = cornerById.get(straight.toCornerId)
    if (!fromCorner || !toCorner) continue

    const downstreamDeltaScore = clamp((downstream.lengthM - straight.lengthM) / 120, 0, 1)
    const setupScore = clamp(0.35 + downstreamDeltaScore * 0.25, 0, 1)
    const sacrificeScore = clamp(setupScore - 0.05, 0, 1)

    if (downstreamDeltaScore <= 0) continue

    applyConfidencePolicy(
      {
        tagType: 'setup-corner',
        targetCornerIds: [straight.fromCornerId, straight.toCornerId],
        score: setupScore,
        reasonCodes: ['DOWNSTREAM_GAIN_EXCEEDS_LOCAL_LOSS'],
        explanation: `${fromCorner.name} may be primarily a setup for ${toCorner.name}, with larger gain coming one segment later.`,
        prompt: `Review whether ${fromCorner.name} should be treated as a setup corner for ${toCorner.name}.`,
      },
      semanticTags,
      pendingConfirmations,
    )

    applyConfidencePolicy(
      {
        tagType: 'sacrifice-entry',
        targetCornerIds: [straight.fromCornerId, straight.toCornerId],
        score: sacrificeScore,
        reasonCodes: ['DOWNSTREAM_GAIN_EXCEEDS_LOCAL_LOSS'],
        explanation: `A slightly slower ${fromCorner.name} entry may unlock better pace into ${toCorner.name}.`,
        prompt: `Review whether entry into ${fromCorner.name} should be treated as a strategic sacrifice.`,
      },
      semanticTags,
      pendingConfirmations,
    )
  }

  semanticTags.sort((a, b) => a.id.localeCompare(b.id))
  pendingConfirmations.sort((a, b) => a.id.localeCompare(b.id))

  return {
    trackId: args.trackId,
    version: args.version ?? 1,
    sourceLapId: args.sourceLapId ?? args.referenceLap.id,
    corners: skeleton.corners,
    straights: skeleton.straights,
    relationships: skeleton.relationships,
    semanticTags,
    pendingConfirmations,
  }
}
