import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FullAnalysis } from '../../lib/analysis/full-analysis'
import AnalysisReport from '../AnalysisReport'

function makeAnalysisFixture(): FullAnalysis {
  return {
    theoreticalBest: {
      time: 60,
      savings: 0.5,
      perCorner: [
        {
          corner: 'T2',
          bestTime: 10,
          bestLap: 1,
          savedVsFastest: 0.2,
          bestEntry: 60,
          bestMin: 40,
          bestExit: 70,
          refEntry: 58,
          refMin: 39,
          refExit: 65,
          bestDistance: 20,
          refDistance: 21,
        },
      ],
    },
    cornerPriority: [],
    consistency: [],
    lapTrend: {
      laps: [],
      trend: 'fluctuating',
      peakRange: [1, 1],
      worstRange: [1, 1],
    },
    fastestVsSlowest: {
      fastestLap: 1,
      slowestLap: 2,
      fastestTime: 60,
      slowestTime: 61,
      totalDelta: 1,
      perCorner: [],
    },
    brakingPattern: [],
    lapGroups: {
      quickLaps: [],
      slowLaps: [],
      quickAvg: 0,
      slowAvg: 0,
      gap: 0,
      perCorner: [],
    },
    cornerCorrelation: [],
    trainingPlan: [],
    cornerScoring: [
      {
        corner: 'T2',
        avgDelta: 0.02,
        stdDev: 0.01,
        quickSlowGap: 0.01,
        maxSingleLoss: 0.02,
        correlation: 0.1,
        score: 1.2,
      },
    ],
    cornerNarrative: [
      {
        corner: 'T2',
        comments: ['赛道角色：T2 是关键出弯弯，优先保证车头摆正后的出弯兑现。'],
      },
    ],
    trackStrategy: {
      overallApproach: '本赛道的策略是优先兑现关键出弯。',
      cornerRoles: [
        {
          corner: 'T2',
          role: '直道入口弯',
          nextGapM: 90,
          prevGapM: 18,
          followedByLongStraight: true,
          linkedToNext: false,
          linkedToPrev: false,
          nextCorner: 'T3',
          prevCorner: 'T1',
          sameDirectionAsNext: false,
        },
      ],
      priorityZones: [
        {
          zone: 'T2',
          corners: ['T2'],
          symptom: '关键出弯收益没有稳定兑现',
          rootCause: '入弯和弯心没有为更早开油门服务',
          practice: '先摆正车头，再尽早给油',
          targetGain: '提升出弯初速',
          priority: 1,
        },
      ],
      trainingClosure: [],
    },
  }
}

describe('AnalysisReport', () => {
  it('keeps semantic-role corners visible even when numeric score is low', () => {
    render(<AnalysisReport analysis={makeAnalysisFixture()} />)

    expect(screen.getByText('直道入口弯')).toBeInTheDocument()
    expect(screen.getByText(/赛道角色：T2 是关键出弯弯/)).toBeInTheDocument()
  })
})
