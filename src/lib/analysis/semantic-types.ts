import type { Corner, Lap } from '../../types'

export type SemanticTagType =
  | 'must-hit-exit'
  | 'compound-corner'
  | 'setup-corner'
  | 'sacrifice-entry'

export interface CornerSemantic {
  cornerId: number
  name: string
  direction: Corner['direction']
  type: Corner['type']
  // Inclusive lap point index where the corner starts.
  startIndex: number
  // Inclusive lap point index where the corner ends.
  endIndex: number
  apexIndex: number
}

export interface StraightSemantic {
  fromCornerId: number
  toCornerId: number
  fromCornerName: string
  toCornerName: string
  // Straight begins at the previous corner's inclusive end index.
  startIndex: number
  // Straight ends at the next corner's inclusive start index.
  endIndex: number
  lengthM: number
  wrapsLap: boolean
}

export type CornerRelationshipType = 'compound-candidate'

export interface CornerRelationship {
  type: CornerRelationshipType
  fromCornerId: number
  toCornerId: number
  viaStraightLengthM: number
}

export type SemanticReasonCode =
  | 'LONG_STRAIGHT_AFTER_CORNER'
  | 'EXIT_SPEED_PROPAGATES'
  | 'ADJACENT_SHORT_STRAIGHT'
  | 'LINKED_RHYTHM_PATTERN'
  | 'DOWNSTREAM_GAIN_EXCEEDS_LOCAL_LOSS'

export type SemanticTagStatus =
  | 'auto-active'
  | 'confirmed-active'
  | 'rejected'
  | 'overridden-active'

export interface SemanticTag {
  id: string
  tagType: SemanticTagType
  targetCornerIds: number[]
  confidence: number
  reasonCodes: SemanticReasonCode[]
  explanation: string
  status: SemanticTagStatus
  sourceTagId?: string
}

export type SemanticConfirmationRecommendation = 'confirm' | 'review'

export interface SemanticConfirmation {
  id: string
  tagType: SemanticTagType
  targetCornerIds: number[]
  confidence: number
  prompt: string
  recommendation: SemanticConfirmationRecommendation
}

export interface InferTrackSemanticsArgs {
  trackId: string
  corners: Corner[]
  referenceLap: Lap
  version?: number
  sourceLapId?: number
}

export interface TrackSemanticModel {
  trackId: string
  version: number
  sourceLapId: number
  corners: CornerSemantic[]
  straights: StraightSemantic[]
  relationships: CornerRelationship[]
  semanticTags: SemanticTag[]
  pendingConfirmations: SemanticConfirmation[]
}
