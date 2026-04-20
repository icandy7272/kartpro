import { describe, expect, it } from 'vitest'
import { buildSpeedSeriesData, formatSpeedTooltip } from '../SpeedChart'
import type { GPSPoint } from '../../types'

describe('SpeedChart helpers', () => {
  it('keeps sub-meter distance precision so adjacent samples do not collapse into the same integer bucket', () => {
    const points: GPSPoint[] = [
      { lat: 40, lng: 116.4585, speed: 1.5, time: 0, altitude: 0 },
      { lat: 40, lng: 116.458503, speed: 1.6, time: 100, altitude: 0 },
      { lat: 40, lng: 116.458506, speed: 1.7, time: 200, altitude: 0 },
    ]

    const data = buildSpeedSeriesData(points)

    expect(data[0][0]).toBe(0)
    expect(data[1][0]).toBeGreaterThan(0)
    expect(data[2][0]).toBeGreaterThan(data[1][0])
    expect(Number.isInteger(data[1][0])).toBe(false)
  })

  it('deduplicates tooltip rows when echarts sends multiple points from the same lap at one rounded distance', () => {
    const html = formatSpeedTooltip([
      { seriesName: '第 2 圈', data: [30, 6.4], color: '#ff4d4f', dataIndex: 10 },
      { seriesName: '第 2 圈', data: [30, 6.2], color: '#ff4d4f', dataIndex: 11 },
      { seriesName: '第 3 圈', data: [30, 7.1], color: '#a78bfa', dataIndex: 10 },
    ])

    expect(html).toContain('30m')
    expect((html.match(/第 2 圈:/g) ?? [])).toHaveLength(1)
    expect((html.match(/第 3 圈:/g) ?? [])).toHaveLength(1)
  })
})
