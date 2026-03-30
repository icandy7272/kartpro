import type { Corner } from '../../types'

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
  startIndex: number
  endIndex: number
  apexIndex: number
}

export interface StraightSemantic {
  fromCornerId: number
  toCornerId: number
  fromCornerName: string
  toCornerName: string
  startIndex: number
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

export interface SemanticTag {
  type: SemanticTagType
  cornerId: number
  confidence: number
  reason: string
}

export interface SemanticConfirmation {
  id: string
  cornerId: number
  tagType: SemanticTagType
  question: string
  status: 'pending' | 'confirmed' | 'rejected'
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
