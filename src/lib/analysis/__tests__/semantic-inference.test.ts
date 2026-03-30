import { describe, expect, it } from 'vitest'
import { inferTrackSemantics } from '../semantic-inference'
import { makeInferenceFixture } from './semantic-fixtures'

describe('inferTrackSemantics', () => {
  it('marks a long-straight entry corner as high-confidence must-hit-exit', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)

    expect(model.semanticTags).toContainEqual(
      expect.objectContaining({
        tagType: 'must-hit-exit',
        targetCornerIds: [3],
        status: 'auto-active',
      }),
    )
  })

  it('surfaces medium-confidence compound guesses as pending confirmations', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)

    expect(model.pendingConfirmations).toContainEqual(
      expect.objectContaining({
        tagType: 'compound-corner',
        targetCornerIds: [5, 6],
        recommendation: 'review',
      }),
    )
  })

  it('does not auto-activate low-confidence setup or sacrifice labels', () => {
    const fixture = makeInferenceFixture()
    const model = inferTrackSemantics(fixture)

    expect(
      model.semanticTags.some(
        (tag) => tag.tagType === 'setup-corner' && tag.status === 'auto-active',
      ),
    ).toBe(false)
  })
})
