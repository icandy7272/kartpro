import { describe, expect, it } from 'vitest'
import { buildTrackSkeleton } from '../track-semantics'
import {
  makeOutOfRangeSemanticCorners,
  makeReferenceLap,
  makeSemanticCorners,
  makeSingleSemanticCorner,
} from './semantic-fixtures'

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
      expect.objectContaining({ fromCornerId: 3, toCornerId: 1, wrapsLap: true })
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

  it('returns mapped corners but no straights or relationships for single-corner input', () => {
    const skeleton = buildTrackSkeleton({
      corners: makeSingleSemanticCorner(),
      referenceLap: makeReferenceLap(),
    })

    expect(skeleton.corners).toHaveLength(1)
    expect(skeleton.straights).toEqual([])
    expect(skeleton.relationships).toEqual([])
  })

  it('throws a clear error when corner indices are out of range for the reference lap', () => {
    expect(() =>
      buildTrackSkeleton({
        corners: makeOutOfRangeSemanticCorners(),
        referenceLap: makeReferenceLap(),
      }),
    ).toThrow(/out of range/)
  })
})
