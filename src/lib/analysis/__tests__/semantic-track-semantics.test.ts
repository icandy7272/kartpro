import { describe, expect, it } from 'vitest'
import { buildTrackSkeleton } from '../track-semantics'
import { makeReferenceLap, makeSemanticCorners } from './semantic-fixtures'

describe('buildTrackSkeleton', () => {
  it('measures straights between each corner exit and the next corner entry', () => {
    const skeleton = buildTrackSkeleton({
      corners: makeSemanticCorners(),
      referenceLap: makeReferenceLap(),
    })

    expect(skeleton.straights.map((s) => Math.round(s.lengthM))).toEqual([90, 12, 140])
  })

  it('handles the last-corner wrap back to corner 1', () => {
    const skeleton = buildTrackSkeleton({
      corners: makeSemanticCorners(),
      referenceLap: makeReferenceLap(),
    })

    expect(skeleton.straights[2]).toEqual(
      expect.objectContaining({ fromCornerId: 3, toCornerId: 1 })
    )
  })

  it('creates relationship scaffolding for short adjacent connectors', () => {
    const skeleton = buildTrackSkeleton({
      corners: makeSemanticCorners(),
      referenceLap: makeReferenceLap(),
    })

    expect(skeleton.relationships).toContainEqual(
      expect.objectContaining({
        type: 'compound-candidate',
        fromCornerId: 2,
        toCornerId: 3,
      })
    )
  })
})
