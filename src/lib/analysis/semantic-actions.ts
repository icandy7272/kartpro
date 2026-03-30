import type {
  SemanticConfirmation,
  SemanticTag,
  SemanticTagStatus,
  SemanticTagType,
  TrackSemanticModel,
} from './semantic-types'

function toSemanticTag(
  confirmation: SemanticConfirmation,
  tagType: SemanticTagType,
  status: SemanticTagStatus,
): SemanticTag {
  const id =
    tagType === confirmation.tagType
      ? confirmation.id
      : `${tagType}:${confirmation.targetCornerIds.join('-')}`

  return {
    id,
    tagType,
    targetCornerIds: confirmation.targetCornerIds,
    confidence: confirmation.confidence,
    reasonCodes: [],
    explanation: confirmation.prompt,
    status,
    sourceTagId: confirmation.id,
  }
}

function sortModel(model: TrackSemanticModel): TrackSemanticModel {
  return {
    ...model,
    semanticTags: [...model.semanticTags].sort((a, b) => a.id.localeCompare(b.id)),
    pendingConfirmations: [...model.pendingConfirmations].sort((a, b) => a.id.localeCompare(b.id)),
  }
}

function withoutConfirmation(
  model: TrackSemanticModel,
  confirmationId: string,
): { model: TrackSemanticModel; confirmation?: SemanticConfirmation } {
  const confirmation = model.pendingConfirmations.find((item) => item.id === confirmationId)
  if (!confirmation) {
    return { model }
  }

  return {
    confirmation,
    model: {
      ...model,
      pendingConfirmations: model.pendingConfirmations.filter((item) => item.id !== confirmationId),
    },
  }
}

export function confirmSemanticTag(
  model: TrackSemanticModel,
  confirmationId: string,
): TrackSemanticModel {
  const result = withoutConfirmation(model, confirmationId)
  if (!result.confirmation) return model
  const confirmation = result.confirmation

  return sortModel({
    ...result.model,
    semanticTags: [
      ...result.model.semanticTags.filter((tag) => tag.id !== confirmation.id),
      toSemanticTag(confirmation, confirmation.tagType, 'confirmed-active'),
    ],
  })
}

export function rejectSemanticTag(
  model: TrackSemanticModel,
  confirmationId: string,
): TrackSemanticModel {
  const result = withoutConfirmation(model, confirmationId)
  if (!result.confirmation) return model
  const confirmation = result.confirmation

  return sortModel({
    ...result.model,
    semanticTags: [
      ...result.model.semanticTags.filter((tag) => tag.id !== confirmation.id),
      toSemanticTag(confirmation, confirmation.tagType, 'rejected'),
    ],
  })
}

export function overrideSemanticTag(
  model: TrackSemanticModel,
  confirmationId: string,
  tagType: SemanticTagType,
): TrackSemanticModel {
  const result = withoutConfirmation(model, confirmationId)
  if (!result.confirmation) return model
  const confirmation = result.confirmation

  return sortModel({
    ...result.model,
    semanticTags: [
      ...result.model.semanticTags.filter((tag) => tag.sourceTagId !== confirmationId),
      toSemanticTag(confirmation, tagType, 'overridden-active'),
    ],
  })
}

export function skipSemanticTag(
  model: TrackSemanticModel,
  confirmationId: string,
): TrackSemanticModel {
  const result = withoutConfirmation(model, confirmationId)
  return sortModel(result.model)
}
