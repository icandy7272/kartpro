import { describe, expect, it } from 'vitest'
import { rebuildSessionDerivedData } from '../session-derived-data'
import { makeSessionFixture } from './semantic-fixtures'

describe('rebuildSessionDerivedData', () => {
  it('returns analyses and a semantic model from the same source geometry', () => {
    const fixture = makeSessionFixture()
    const rebuilt = rebuildSessionDerivedData(fixture)

    expect(rebuilt.analyses).toHaveLength(fixture.laps.length)
    expect(rebuilt.trackSemantics?.sourceLapId).toBe(fixture.fastestLapId)
  })

  it('regenerates pending confirmations after corner geometry changes', () => {
    const fixture = makeSessionFixture()
    const rebuilt = rebuildSessionDerivedData({
      ...fixture,
      corners: fixture.corners.slice(0, fixture.corners.length - 1),
    })

    expect(rebuilt.trackSemantics?.pendingConfirmations).not.toEqual(
      fixture.previousPendingConfirmations,
    )
  })

  it('keeps lap analyses valid when all corners are removed', () => {
    const fixture = makeSessionFixture()
    const rebuilt = rebuildSessionDerivedData({
      ...fixture,
      corners: [],
    })

    expect(rebuilt.trackSemantics).toBeUndefined()
    expect(rebuilt.analyses).toHaveLength(fixture.laps.length)
    expect(rebuilt.analyses.every((analysis) => Number.isFinite(analysis.remainingTime))).toBe(true)
    expect(rebuilt.analyses.map((analysis) => analysis.corners)).toEqual([[], []])
  })
})
