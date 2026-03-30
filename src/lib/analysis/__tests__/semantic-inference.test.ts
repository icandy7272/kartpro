import { describe, expect, it } from 'vitest'
import { inferTrackSemantics } from '../semantic-inference'
import { makeInferenceFixture } from './semantic-fixtures'

describe('inferTrackSemantics', () => {
  it('marks a long-straight entry corner as high-confidence must-hit-exit', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)
    const mustHitExit = model.semanticTags.find(
      (tag) => tag.tagType === 'must-hit-exit' && tag.targetCornerIds[0] === 3,
    )

    expect(mustHitExit).toBeDefined()

    expect(mustHitExit).toEqual(
      expect.objectContaining({
        tagType: 'must-hit-exit',
        targetCornerIds: [3],
        status: 'auto-active',
      }),
    )
    expect(mustHitExit?.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('surfaces medium-confidence compound guesses as pending confirmations with prompts', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)
    const compoundPending = model.pendingConfirmations.find(
      (candidate) =>
        candidate.tagType === 'compound-corner' &&
        candidate.targetCornerIds[0] === 5 &&
        candidate.targetCornerIds[1] === 6,
    )

    expect(compoundPending).toBeDefined()

    expect(compoundPending).toEqual(
      expect.objectContaining({
        tagType: 'compound-corner',
        targetCornerIds: [5, 6],
      }),
    )
    expect(compoundPending?.confidence).toBeGreaterThanOrEqual(0.55)
    expect(compoundPending?.confidence ?? 0).toBeLessThan(0.8)
    expect(compoundPending?.prompt.trim().length).toBeGreaterThan(0)
  })

  it('splits medium-confidence confirmations into confirm and review recommendations', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)

    expect(model.pendingConfirmations.some((candidate) => candidate.recommendation === 'confirm')).toBe(true)
    expect(model.pendingConfirmations.some((candidate) => candidate.recommendation === 'review')).toBe(true)
  })

  it('does not emit low-confidence setup or sacrifice labels as active or pending', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)

    expect(
      model.semanticTags.some(
        (tag) => tag.tagType === 'setup-corner' && tag.status === 'auto-active',
      ),
    ).toBe(false)

    expect(
      model.semanticTags.some(
        (tag) => tag.tagType === 'sacrifice-entry' && tag.status === 'auto-active',
      ),
    ).toBe(false)

    expect(model.pendingConfirmations.some((tag) => tag.tagType === 'setup-corner')).toBe(false)
    expect(model.pendingConfirmations.some((tag) => tag.tagType === 'sacrifice-entry')).toBe(false)
  })

  it('keeps inferred semantic IDs unique within a model', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)
    const allIds = [...model.semanticTags, ...model.pendingConfirmations].map((item) => item.id)

    expect(new Set(allIds).size).toBe(allIds.length)
  })
})
