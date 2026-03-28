import { useMemo, useRef, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import type { LapAnalysis } from '../types'
import { getLapColor } from '../lib/lap-colors'

interface SpeedChartProps {
  analyses: LapAnalysis[]
  selectedLapIds: number[]
  fastestLapId: number
  onHoverIndex?: (index: number | null) => void
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export default function SpeedChart({ analyses, selectedLapIds, fastestLapId, onHoverIndex }: SpeedChartProps) {
  const chartRef = useRef<ReactECharts>(null)
  // Store callback in ref so it's always current
  const hoverCallbackRef = useRef(onHoverIndex)
  hoverCallbackRef.current = onHoverIndex

  // Bind updateAxisPointer directly on mount via getEchartsInstance
  useEffect(() => {
    const timer = setTimeout(() => {
      const inst = chartRef.current?.getEchartsInstance()
      if (!inst) return

      const handler = (params: { dataIndex?: number }) => {
        if (hoverCallbackRef.current && params.dataIndex != null) {
          hoverCallbackRef.current(params.dataIndex)
        }
      }

      inst.on('updateAxisPointer', handler)

      // Listen on the zrender layer for mouseout
      const zr = (inst as unknown as { getZr: () => { on: (e: string, h: () => void) => void } }).getZr()
      zr.on('mouseout', () => {
        if (hoverCallbackRef.current) hoverCallbackRef.current(null)
      })
    }, 500) // Wait for echarts to fully initialize

    return () => clearTimeout(timer)
  }, [analyses, selectedLapIds]) // Re-bind when chart data changes

  const option = useMemo(() => {
    const selected = analyses.filter((a) => selectedLapIds.includes(a.lap.id))

    if (selected.length === 0) {
      return {
        backgroundColor: 'transparent',
        title: {
          text: '选择一圈查看速度数据',
          left: 'center', top: 'center',
          textStyle: { color: '#6b7280', fontSize: 14 },
        },
      }
    }

    const series = selected.map((analysis) => {
      const points = analysis.lap.points
      const color = getLapColor(analysis.lap.id, selectedLapIds, fastestLapId)
      const data: [number, number][] = []
      let distance = 0
      for (let i = 0; i < points.length; i++) {
        if (i > 0) {
          distance += haversineDistance(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
        }
        data.push([Math.round(distance), Math.round(points[i].speed * 3.6 * 10) / 10])
      }
      return {
        name: `第 ${analysis.lap.id} 圈`,
        type: 'line' as const,
        data, smooth: true, symbol: 'none',
        lineStyle: { width: 2, color },
        itemStyle: { color },
      }
    })

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        textStyle: { color: '#e5e7eb', fontSize: 12 },
        formatter: (params: Array<{ seriesName: string; data: [number, number]; color: string; dataIndex: number }>) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const distance = params[0].data[0]
          let html = `<div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">${distance}m</div>`
          for (const p of params) {
            html += `<div style="display:flex;align-items:center;gap:6px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${p.color};display:inline-block;"></span>
              <span>${p.seriesName}: ${p.data[1]} km/h</span>
            </div>`
          }
          return html
        },
      },
      legend: {
        show: selected.length > 1, top: 5,
        textStyle: { color: '#9ca3af', fontSize: 11 },
      },
      grid: { top: selected.length > 1 ? 35 : 15, right: 15, bottom: 30, left: 50 },
      xAxis: {
        type: 'value' as const,
        name: '距离 (m)', nameLocation: 'middle' as const, nameGap: 20,
        nameTextStyle: { color: '#6b7280', fontSize: 11 },
        axisLine: { lineStyle: { color: '#374151' } },
        axisTick: { lineStyle: { color: '#374151' } },
        axisLabel: { color: '#6b7280', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1f2937' } },
      },
      yAxis: {
        type: 'value' as const, name: 'km/h',
        nameTextStyle: { color: '#6b7280', fontSize: 11 },
        axisLine: { lineStyle: { color: '#374151' } },
        axisTick: { lineStyle: { color: '#374151' } },
        axisLabel: { color: '#6b7280', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1f2937' } },
      },
      series,
    }
  }, [analyses, selectedLapIds])

  return (
    <div className="h-full w-full p-2">
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge
      />
    </div>
  )
}
