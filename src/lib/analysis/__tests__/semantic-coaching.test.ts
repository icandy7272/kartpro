import { describe, expect, it } from 'vitest'
import { generateFullAnalysis } from '../full-analysis'
import { makeCoachingFixture } from './semantic-fixtures'

describe('generateFullAnalysis with semanticModel', () => {
  it('prioritizes must-hit-exit corners in track strategy output', () => {
    const fixture = makeCoachingFixture()
    const report = generateFullAnalysis(
      fixture.laps,
      fixture.corners,
      fixture.analyses,
      fixture.semanticModel
    )

    expect(report.trackStrategy.overallApproach).toContain('关键出弯')
    expect(report.trackStrategy.cornerRoles.find((r) => r.corner === 'T3')?.role).toBe('直道入口弯')
  })

  it('upgrades explicitly-tagged must-hit-exit corners even when geometry is not a long straight', () => {
    const fixture = makeCoachingFixture()
    expect(
      fixture.semanticModel.semanticTags.some(
        (tag) => tag.tagType === 'must-hit-exit' && tag.targetCornerIds[0] === 4 && tag.status === 'confirmed-active'
      )
    ).toBe(true)
    const reportWithSemantics = generateFullAnalysis(
      fixture.laps,
      fixture.corners,
      fixture.analyses,
      fixture.semanticModel
    )
    const reportWithoutSemantics = generateFullAnalysis(
      fixture.laps,
      fixture.corners,
      fixture.analyses
    )

    expect(reportWithSemantics.trackStrategy.cornerRoles.find((r) => r.corner === 'T4')?.role).toBe('直道入口弯')
    expect(reportWithoutSemantics.trackStrategy.cornerRoles.find((r) => r.corner === 'T4')?.role).not.toBe('直道入口弯')
  })

  it('treats compound-corner tags as one linked priority zone', () => {
    const fixture = makeCoachingFixture()
    const report = generateFullAnalysis(
      fixture.laps,
      fixture.corners,
      fixture.analyses,
      fixture.semanticModel
    )

    expect(report.trackStrategy.priorityZones[0]?.zone).toContain('T5→T6')
  })

  it('still returns a valid report when semanticModel is absent', () => {
    const fixture = makeCoachingFixture()

    expect(() =>
      generateFullAnalysis(fixture.laps, fixture.corners, fixture.analyses)
    ).not.toThrow()
  })
})
