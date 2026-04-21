import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AnalysisReport from '../AnalysisReport'
import type { FullAnalysis } from '../../lib/analysis/full-analysis'

const mockAnalysis: FullAnalysis = {
  theoreticalBest: {
    time: 60.5,
    savings: 0.9,
    perCorner: [
      {
        corner: 'T1',
        bestTime: 10.1,
        bestLap: 2,
        savedVsFastest: 0.2,
        reason: '更早指向出弯',
        bestEntry: 80,
        bestMin: 60,
        bestExit: 95,
        refEntry: 78,
        refMin: 58,
        refExit: 90,
        bestDistance: 100,
        refDistance: 102,
        lineNote: '路线更短',
        bestLine: [
          [31.279, 121.493],
          [31.28, 121.494],
        ],
        refLine: [
          [31.2791, 121.4931],
          [31.2801, 121.4941],
        ],
      },
    ],
  },
  cornerPriority: [
    { corner: 'T3', avgDelta: 0.32, stdDev: 0.08 },
    { corner: 'T1', avgDelta: 0.18, stdDev: 0.05 },
  ],
  consistency: [
    {
      corner: 'T3',
      stdDev: 0.12,
      rating: '稳定',
      minDelta: -0.05,
      maxDelta: 0.11,
      minLap: 2,
      maxLap: 5,
    },
  ],
  lapTrend: {
    laps: [
      { lapNumber: 1, time: 61.8, delta: 0.4 },
      { lapNumber: 2, time: 61.5, delta: 0.1 },
      { lapNumber: 3, time: 61.4, delta: 0 },
    ],
    trend: 'improving',
    peakRange: [2, 3],
    worstRange: [1, 1],
  },
  fastestVsSlowest: {
    fastestLap: 3,
    slowestLap: 1,
    fastestTime: 61.4,
    slowestTime: 62.6,
    totalDelta: 1.2,
    perCorner: [
      { corner: 'T1', fastestTime: 10.2, slowestTime: 10.8, delta: 0.6, percentage: 50 },
    ],
  },
  brakingPattern: [
    {
      corner: 'T1',
      direction: '左',
      angle: 90,
      type: '中速弯',
      entrySpeed: 82,
      apexSpeed: 60,
      minSpeed: 58,
      exitSpeed: 94,
      brakingIntensity: 24,
      exitAcceleration: 36,
      apexPosition: '晚弯心',
      brakingPhaseRatio: 68,
      diagnosis: '重刹',
      detailedDiagnosis: ['入弯太深，导致回正偏晚。'],
    },
  ],
  lapGroups: {
    quickLaps: [2, 3],
    slowLaps: [1, 4],
    quickAvg: 61.45,
    slowAvg: 62.4,
    gap: 0.95,
    perCorner: [
      {
        corner: 'T1',
        quickAvgDuration: 10.2,
        slowAvgDuration: 10.7,
        gap: 0.5,
        quickSpeeds: { entry: 82, min: 60, exit: 94 },
        slowSpeeds: { entry: 79, min: 57, exit: 89 },
      },
    ],
  },
  cornerCorrelation: [
    { corner: 'T1', correlation: 0.82, significance: '强相关' },
  ],
  trainingPlan: [
    {
      stint: 1,
      title: '先稳住 T3 出弯',
      focus: '晚弯心和回正',
      goal: '先拿回 0.2s',
      targets: ['连续 5 圈做到更早上油'],
    },
  ],
  cornerScoring: [
    {
      corner: 'T3',
      avgDelta: 0.32,
      stdDev: 0.08,
      quickSlowGap: 0.25,
      maxSingleLoss: 0.41,
      correlation: 0.76,
      score: 8.4,
    },
  ],
  cornerNarrative: [
    {
      corner: 'T3',
      comments: ['T3 出弯展开不够，导致下段直道速度吃亏。'],
    },
  ],
  trackStrategy: {
    overallApproach: '先把组合弯出口做直，再考虑单弯极限。',
    cornerRoles: [
      {
        corner: 'T3',
        role: '直道入口弯',
        nextGapM: 180,
        prevGapM: 30,
        followedByLongStraight: true,
        linkedToNext: false,
        linkedToPrev: true,
        nextCorner: 'T4',
        prevCorner: 'T2',
        sameDirectionAsNext: false,
      },
    ],
    priorityZones: [
      {
        zone: 'T3-T4',
        corners: ['T3', 'T4'],
        symptom: '出口车速掉得早',
        rootCause: '车头没有在弯心后尽快摆正',
        practice: '先减一点入弯侵略性，换更直的出口',
        targetGain: '-0.25s',
        priority: 1,
      },
    ],
    trainingClosure: [
      {
        focus: '先巩固 T3-T4 的出口质量',
        metric: 'T4 前 30m 速度',
        target: '提升 3 km/h',
      },
    ],
  },
}

describe('AnalysisReport coach-first information order', () => {
  it('renders the coach-first modules before evidence and appendix sections', () => {
    render(<AnalysisReport analysis={mockAnalysis} />)

    const sectionButtons = [
      '语义确认',
      '本次教练摘要',
      '整圈策略',
      '重点弯道点评',
      '训练计划',
      '证据面板',
      '车手状态',
      '附录',
    ].map((title) => screen.getByRole('button', { name: new RegExp(title) }))

    for (let index = 1; index < sectionButtons.length; index++) {
      expect(
        sectionButtons[index - 1].compareDocumentPosition(sectionButtons[index]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }
  })
})
