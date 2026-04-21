import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Layout from '../Layout'
import type { TrainingSession } from '../../types'

vi.mock('../../lib/analysis/racing-line-analysis', () => ({
  analyzeRacingLine: vi.fn(() => null),
}))

vi.mock('../../lib/analysis/full-analysis', () => ({
  generateFullAnalysis: vi.fn(() => ({
    theoreticalBest: { time: 61.2, savings: 0.2, perCorner: [{ corner: 'T1', bestTime: 10, bestLap: 1, savedVsFastest: 0.1, reason: 'x', bestEntry: 1, bestMin: 1, bestExit: 1, refEntry: 1, refMin: 1, refExit: 1, bestDistance: 1, refDistance: 1, lineNote: 'x', bestLine: [[31.1, 121.1], [31.2, 121.2]], refLine: [[31.1, 121.1], [31.2, 121.2]] }] },
    cornerPriority: [],
    consistency: [],
    lapTrend: { laps: [], trend: 'stable', peakRange: [1, 1], worstRange: [1, 1] },
    fastestVsSlowest: { fastestLap: 1, slowestLap: 1, fastestTime: 61.2, slowestTime: 61.2, totalDelta: 0, perCorner: [] },
    brakingPattern: [],
    lapGroups: { quickLaps: [], slowLaps: [], quickAvg: 0, slowAvg: 0, gap: 0, perCorner: [] },
    cornerCorrelation: [],
    trainingPlan: [],
    cornerScoring: [],
    cornerNarrative: [],
    trackStrategy: { overallApproach: '', cornerRoles: [], priorityZones: [], trainingClosure: [] },
  })),
}))

vi.mock('../../lib/track-profiles', () => ({
  deleteTrackProfile: vi.fn(),
  getTrackProfiles: vi.fn(() => []),
}))

vi.mock('../TrackMap', () => ({
  default: () => <div data-testid="track-map" />,
}))

vi.mock('../LapList', () => ({
  default: () => <div data-testid="lap-list" />,
}))

vi.mock('../SpeedChart', () => ({
  default: () => <div data-testid="speed-chart" />,
}))

vi.mock('../CornerTable', () => ({
  default: () => <div data-testid="corner-table" />,
}))

vi.mock('../AICoach', () => ({
  default: () => <div data-testid="ai-coach" />,
}))

vi.mock('../ComparisonReport', () => ({
  default: () => <div data-testid="comparison-report" />,
}))

vi.mock('../AnalysisReport', () => ({
  default: () => <div data-testid="analysis-report" />,
}))

describe('Layout map controls', () => {
  it('positions the add-corner control away from the top-right mode switcher area', () => {
    const session: TrainingSession = {
      analyses: [
        {
          corners: [],
          lap: {
            avgSpeed: 20,
            distance: 1000,
            duration: 61.417,
            endTime: 61417,
            id: 1,
            maxSpeed: 25,
            points: [
              { altitude: 0, lat: 31.1, lng: 121.1, speed: 20, time: 0 },
              { altitude: 0, lat: 31.1001, lng: 121.1001, speed: 21, time: 100 },
            ],
            startTime: 0,
          },
          remainingTime: 0,
          sectorTimes: [],
        },
      ],
      corners: [],
      date: new Date('2026-04-20T00:00:00Z'),
      filename: 'demo.vbo',
      id: 'session-1',
      laps: [
        {
          avgSpeed: 20,
          distance: 1000,
          duration: 61.417,
          endTime: 61417,
          id: 1,
          maxSpeed: 25,
          points: [
            { altitude: 0, lat: 31.1, lng: 121.1, speed: 20, time: 0 },
            { altitude: 0, lat: 31.1001, lng: 121.1001, speed: 21, time: 100 },
          ],
          startTime: 0,
        },
      ],
      startFinishLine: { lat1: 31.1, lng1: 121.1, lat2: 31.1001, lng2: 121.1001 },
    }

    render(
      <Layout
        aiConfig={null}
        onAiConfigChange={vi.fn()}
        onEditStartFinish={vi.fn()}
        onNewSession={vi.fn()}
        onUpdateSession={vi.fn()}
        session={session}
      />
    )

    const addCornerButton = screen.getByRole('button', { name: '+ 弯道' })
    const controlWrapper = addCornerButton.parentElement

    expect(controlWrapper).toHaveClass('left-2')
    expect(controlWrapper).not.toHaveClass('right-2')
  })
})
