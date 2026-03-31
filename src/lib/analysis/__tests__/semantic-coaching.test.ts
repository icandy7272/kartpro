import type { RacingLineAnalysis } from '../../../types'
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

  it('describes brake and throttle offsets in meters instead of raw sample counts', () => {
    const fixture = makeCoachingFixture()
    const referenceLap = fixture.laps[0]
    const comparisonLap = fixture.laps[1]
    const cornerName = fixture.corners[0].name
    const racingLineAnalyses: RacingLineAnalysis[] = [
      {
        referenceLapId: referenceLap.id,
        comparisonLapId: comparisonLap.id,
        overallConsistency: 82,
        corners: [
          {
            cornerName,
            meanDeviation: 0.4,
            maxDeviation: 0.8,
            stdDeviation: 0.2,
            deviations: [],
            brakePoint: {
              pointIndex: 6,
              lat: comparisonLap.points[6].lat,
              lng: comparisonLap.points[6].lng,
              trackDistance: 0,
              speed: 62,
            },
            throttlePoint: {
              pointIndex: 10,
              lat: comparisonLap.points[10].lat,
              lng: comparisonLap.points[10].lng,
              trackDistance: 0,
              speed: 68,
            },
            refBrakePoint: {
              pointIndex: 2,
              lat: referenceLap.points[2].lat,
              lng: referenceLap.points[2].lng,
              trackDistance: 0,
              speed: 66,
            },
            refThrottlePoint: {
              pointIndex: 4,
              lat: referenceLap.points[4].lat,
              lng: referenceLap.points[4].lng,
              trackDistance: 0,
              speed: 72,
            },
            curvatureConsistency: 80,
          },
        ],
      },
    ]

    const report = generateFullAnalysis(
      fixture.laps,
      fixture.corners,
      fixture.analyses,
      undefined,
      racingLineAnalyses,
    )
    const t1Narrative = report.cornerNarrative.find((entry) => entry.corner === cornerName)
    const joinedComments = t1Narrative?.comments.join(' ') ?? ''

    expect(joinedComments).not.toContain('采样点')
    expect(joinedComments).toMatch(/约\s*\d+(\.\d+)?m/)
  })
})
