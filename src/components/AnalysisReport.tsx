import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { FullAnalysis } from '../lib/analysis/full-analysis'

interface AnalysisReportProps {
  analysis: FullAnalysis
}

function InfoTip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const iconRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => {
      if (iconRef.current) {
        const rect = iconRef.current.getBoundingClientRect()
        const above = rect.top > 200
        setTooltipStyle({
          position: 'fixed' as const,
          left: rect.left + rect.width / 2,
          transform: 'translateX(-50%)',
          ...(above
            ? { bottom: window.innerHeight - rect.top + 6 }
            : { top: rect.bottom + 6 }),
          zIndex: 9999,
        })
      }
      setVisible(true)
    }, 200)
  }, [])

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <span
      ref={iconRef}
      className="inline-flex items-center ml-1 cursor-help"
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={() => setVisible((v) => !v)}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-500 hover:text-gray-400 transition-colors shrink-0">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
        <text x="7" y="10.5" textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="600" fontFamily="sans-serif">i</text>
      </svg>
      {visible && createPortal(
        <span
          style={tooltipStyle}
          className="max-w-[250px] w-max px-2.5 py-1.5 rounded text-[11px] leading-relaxed text-gray-100 bg-gray-900 border border-gray-700 shadow-lg pointer-events-none"
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
}

function Section({
  title,
  icon,
  tip,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: string
  tip?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800/80 transition-colors rounded-t-lg"
      >
        <span className="inline-flex items-center text-sm font-bold text-gray-200">
          {icon} {title}
          {tip && <InfoTip text={tip} />}
        </span>
        <span className="text-gray-500 text-xs">{open ? '收起' : '展开'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  )
}

function RatingBadge({ rating }: { rating: string }) {
  const colorMap: Record<string, string> = {
    '非常稳定': 'bg-green-500/20 text-green-400 border-green-500/30',
    '稳定': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    '波动': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    '不稳定': 'bg-red-500/20 text-red-400 border-red-500/30',
  }
  const cls = colorMap[rating] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>
      {rating}
    </span>
  )
}

function DiagnosisBadge({ diagnosis }: { diagnosis: string }) {
  const colorMap: Record<string, string> = {
    '出弯减速': 'bg-red-500/20 text-red-400 border-red-500/30',
    '重刹': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    '轻刹/不刹': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    '正常': 'bg-green-500/20 text-green-400 border-green-500/30',
  }
  const cls = colorMap[diagnosis] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>
      {diagnosis}
    </span>
  )
}

function SignificanceBadge({ significance }: { significance: string }) {
  const colorMap: Record<string, string> = {
    '强相关': 'bg-red-500/20 text-red-400 border-red-500/30',
    '中等相关': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    '弱相关': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }
  const cls = colorMap[significance] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>
      {significance}
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color = score > 7 ? 'bg-red-500' : score > 4 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 bg-gray-700/50 rounded overflow-hidden">
        <div className={`h-full ${color} rounded`} style={{ width: `${Math.min(100, score * 10)}%` }} />
      </div>
      <span className={`text-xs font-bold ${score > 7 ? 'text-red-400' : score > 4 ? 'text-yellow-400' : 'text-green-400'}`}>
        {score.toFixed(1)}
      </span>
    </div>
  )
}

/**
 * Mini SVG map showing two corner trajectories overlaid for comparison.
 * Gray = fastest overall lap, Purple = best corner lap.
 */
function CornerTrajectoryMap({ bestLine, refLine, bestLapId, refLapId, bestSpeeds, refSpeeds }: {
  bestLine: Array<[number, number]>
  refLine: Array<[number, number]>
  bestLapId: number
  refLapId: number
  bestSpeeds?: { entry: number; min: number; exit: number }
  refSpeeds?: { entry: number; min: number; exit: number }
}) {
  if (bestLine.length < 2 || refLine.length < 2) return null

  const allPoints = [...bestLine, ...refLine]
  const minLat = Math.min(...allPoints.map(p => p[0]))
  const maxLat = Math.max(...allPoints.map(p => p[0]))
  const minLng = Math.min(...allPoints.map(p => p[1]))
  const maxLng = Math.max(...allPoints.map(p => p[1]))

  const cosLat = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180)
  const realWidth = (maxLng - minLng || 0.0001) * cosLat
  const realHeight = maxLat - minLat || 0.0001

  const w = 280
  const h = 140
  const pad = 20

  const scaleX = (w - pad * 2) / realWidth
  const scaleY = (h - pad * 2) / realHeight
  const scale = Math.min(scaleX, scaleY)
  const cx = (w - realWidth * scale) / 2
  const cy = (h - realHeight * scale) / 2

  function toSVG(lat: number, lng: number): [number, number] {
    return [cx + (lng - minLng) * cosLat * scale, cy + (maxLat - lat) * scale]
  }

  const refPts = refLine.map(p => toSVG(p[0], p[1]))
  const bestPts = bestLine.map(p => toSVG(p[0], p[1]))
  const refPolyline = refPts.map(p => `${p[0]},${p[1]}`).join(' ')
  const bestPolyline = bestPts.map(p => `${p[0]},${p[1]}`).join(' ')

  // Apex point (midpoint of line)
  const refApex = refPts[Math.floor(refPts.length / 2)]
  const bestApex = bestPts[Math.floor(bestPts.length / 2)]

  return (
    <div className="mt-1.5 mb-1">
      <svg width={w} height={h} className="bg-gray-900/50 rounded border border-gray-700/30">
        {/* Reference line — gray */}
        <polyline points={refPolyline} fill="none" stroke="#6b7280" strokeWidth="2.5" opacity="0.5" />
        {/* Best corner line — purple */}
        <polyline points={bestPolyline} fill="none" stroke="#a78bfa" strokeWidth="2.5" />

        {/* Entry dots */}
        <circle cx={refPts[0][0]} cy={refPts[0][1]} r="3.5" fill="#3b82f6" stroke="#fff" strokeWidth="0.5" />
        <circle cx={bestPts[0][0]} cy={bestPts[0][1]} r="3.5" fill="#3b82f6" stroke="#a78bfa" strokeWidth="0.5" />

        {/* Apex dots */}
        <circle cx={refApex[0]} cy={refApex[1]} r="3.5" fill="#ef4444" stroke="#fff" strokeWidth="0.5" />
        <circle cx={bestApex[0]} cy={bestApex[1]} r="3.5" fill="#ef4444" stroke="#a78bfa" strokeWidth="0.5" />

        {/* Exit dots */}
        <circle cx={refPts[refPts.length-1][0]} cy={refPts[refPts.length-1][1]} r="3.5" fill="#06b6d4" stroke="#fff" strokeWidth="0.5" />
        <circle cx={bestPts[bestPts.length-1][0]} cy={bestPts[bestPts.length-1][1]} r="3.5" fill="#06b6d4" stroke="#a78bfa" strokeWidth="0.5" />

        {/* Speed labels for best line — offset above */}
        {bestSpeeds && (
          <>
            <text x={bestPts[0][0]} y={bestPts[0][1] - 10} textAnchor="middle" fill="#a78bfa" fontSize="8" fontWeight="bold">{bestSpeeds.entry.toFixed(1)}</text>
            <text x={bestApex[0]} y={bestApex[1] - 10} textAnchor="middle" fill="#a78bfa" fontSize="8" fontWeight="bold">{bestSpeeds.min.toFixed(1)}</text>
            <text x={bestPts[bestPts.length-1][0]} y={bestPts[bestPts.length-1][1] - 10} textAnchor="middle" fill="#a78bfa" fontSize="8" fontWeight="bold">{bestSpeeds.exit.toFixed(1)}</text>
          </>
        )}

        {/* Speed labels for ref line — offset below */}
        {refSpeeds && (
          <>
            <text x={refPts[0][0]} y={refPts[0][1] + 15} textAnchor="middle" fill="#6b7280" fontSize="8">{refSpeeds.entry.toFixed(1)}</text>
            <text x={refApex[0]} y={refApex[1] + 15} textAnchor="middle" fill="#6b7280" fontSize="8">{refSpeeds.min.toFixed(1)}</text>
            <text x={refPts[refPts.length-1][0]} y={refPts[refPts.length-1][1] + 15} textAnchor="middle" fill="#6b7280" fontSize="8">{refSpeeds.exit.toFixed(1)}</text>
          </>
        )}
      </svg>
      <div className="flex items-center gap-3 mt-0.5 text-[9px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-500 inline-block" /> 第{refLapId}圈</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-400 inline-block" /> 第{bestLapId}圈</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />入弯 <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />弯心 <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 inline-block" />出弯</span>
      </div>
    </div>
  )
}

export default function AnalysisReport({ analysis }: AnalysisReportProps) {
  const {
    theoreticalBest, consistency, lapTrend, fastestVsSlowest, brakingPattern,
    lapGroups, cornerCorrelation, trainingPlan, cornerScoring, cornerNarrative,
  } = analysis

  if (theoreticalBest.perCorner.length === 0) {
    return null
  }


  // Lap trend visualization helpers
  const lapTimes = lapTrend.laps.map((l) => l.time)
  const minLapTime = Math.min(...lapTimes)
  const maxLapTime = Math.max(...lapTimes)
  const lapTimeRange = maxLapTime - minLapTime || 1

  return (
    <div className="space-y-2">
      {/* 1. Theoretical Best */}
      <Section title="理论最佳圈" icon="🏆" tip="将每个弯道在所有圈中的最快耗时拼接起来，得到理论上的最快圈速。差值越大说明潜力越大。" defaultOpen>
        <div className="flex items-baseline gap-4 mb-3">
          <div>
            <div className="text-[10px] text-gray-500">理论最佳</div>
            <div className="text-2xl font-bold text-purple-400">{formatTime(theoreticalBest.time)}</div>
          </div>
          <div>
            <div className="inline-flex items-center text-[10px] text-gray-500">可节省<InfoTip text="最快圈与理论最佳圈的差值，代表纯技术提升空间" /></div>
            <div className="text-lg font-bold text-green-400">-{theoreticalBest.savings.toFixed(3)}s</div>
          </div>
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-2">弯道</th>
              <th className="text-right py-1 pr-2"><span className="inline-flex items-center justify-end">最佳时间<InfoTip text="该弯道在所有圈中的最快耗时" /></span></th>
              <th className="text-right py-1 pr-2">来自</th>
              <th className="text-right py-1 pr-2"><span className="inline-flex items-center justify-end">节省<InfoTip text="相比最快整圈在该弯道可以节省的时间" /></span></th>
              <th className="text-left py-1"><span className="inline-flex items-center justify-start">为什么更快<InfoTip text="该弯道最快的那一圈，跟最快整圈在同一弯道相比，速度上有什么不同。注意：速度更高不一定时间更短，走线更紧凑可以用更低的速度换来更短的距离。" /></span></th>
            </tr>
          </thead>
          <tbody>
            {theoreticalBest.perCorner.map((c) => (
              <tr key={c.corner} className="border-b border-gray-800/50 text-gray-400">
                <td className="py-1.5 pr-2 font-medium text-gray-300">{c.corner}</td>
                <td className="text-right py-1.5 pr-2">{c.bestTime.toFixed(3)}s</td>
                <td className="text-right py-1.5 pr-2 text-gray-500">第{c.bestLap}圈</td>
                <td className="text-right py-1.5 pr-2">
                  {c.savedVsFastest > 0.001 ? (
                    <span className="text-green-400">-{c.savedVsFastest.toFixed(3)}s</span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="py-1.5 text-[10px] text-gray-500">
                  <div>速度: 入弯{c.bestEntry >= c.refEntry ? '+' : ''}{(c.bestEntry - c.refEntry).toFixed(1)} 弯心{c.bestMin >= c.refMin ? '+' : ''}{(c.bestMin - c.refMin).toFixed(1)} 出弯{c.bestExit >= c.refExit ? '+' : ''}{(c.bestExit - c.refExit).toFixed(1)} km/h</div>
                  {c.lineNote && <div className="text-purple-400/70 mt-0.5">{c.lineNote}</div>}
                  {c.bestLine && c.refLine && c.bestLap !== fastestVsSlowest.fastestLap && (
                    <CornerTrajectoryMap
                      bestLine={c.bestLine}
                      refLine={c.refLine}
                      bestLapId={c.bestLap}
                      refLapId={fastestVsSlowest.fastestLap}
                      bestSpeeds={{ entry: c.bestEntry, min: c.bestMin, exit: c.bestExit }}
                      refSpeeds={{ entry: c.refEntry, min: c.refMin, exit: c.refExit }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Corner Priority removed — already shown in dashboard card */}

      {/* 3. Consistency */}
      <Section title="一致性诊断" icon="📊" tip="衡量每个弯道在不同圈次中的表现波动。标准差越小越稳定，说明该弯道技术越成熟。" defaultOpen>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-2">弯道</th>
              <th className="text-right py-1 pr-2"><span className="inline-flex items-center justify-end">标准差<InfoTip text="数值越小表示该弯道表现越稳定。<0.1s=非常稳定，<0.2s=稳定，<0.4s=波动，≥0.4s=不稳定" /></span></th>
              <th className="text-center py-1 pr-2">评级</th>
              <th className="text-right py-1 pr-2">最快偏差</th>
              <th className="text-right py-1">最慢偏差</th>
            </tr>
          </thead>
          <tbody>
            {consistency.map((c) => (
              <tr key={c.corner} className="border-b border-gray-800/50 text-gray-400">
                <td className="py-1 pr-2 font-medium text-gray-300">{c.corner}</td>
                <td className="text-right py-1 pr-2">{c.stdDev.toFixed(3)}s</td>
                <td className="text-center py-1 pr-2">
                  <RatingBadge rating={c.rating} />
                </td>
                <td className="text-right py-1 pr-2 text-green-400">
                  {c.minDelta.toFixed(3)}s <span className="text-gray-600 text-[10px]">L{c.minLap}</span>
                </td>
                <td className="text-right py-1 text-red-400">
                  +{c.maxDelta.toFixed(3)}s <span className="text-gray-600 text-[10px]">L{c.maxLap}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 4. Lap Trend */}
      <Section title="圈速趋势" defaultOpen icon="📈" tip="显示整个训练中圈速的变化规律，帮助识别体力衰退、轮胎衰减或注意力波动。">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="text-gray-500">趋势:</span>
          <span
            className={
              lapTrend.trend === 'improving'
                ? 'text-green-400 font-bold'
                : lapTrend.trend === 'declining'
                  ? 'text-red-400 font-bold'
                  : 'text-yellow-400 font-bold'
            }
          >
            {lapTrend.trend === 'improving' ? '持续进步' : lapTrend.trend === 'declining' ? '逐渐下降' : '波动'}
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500">
            最佳区间: 第{lapTrend.peakRange[0]}-{lapTrend.peakRange[1]}圈
          </span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500">
            最差区间: 第{lapTrend.worstRange[0]}-{lapTrend.worstRange[1]}圈
          </span>
        </div>
        <div className="relative h-24">
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {lapTrend.laps.map((lap) => {
              // Invert: fastest lap = tallest bar
              const normalized = lapTimeRange > 0 ? (lap.time - minLapTime) / lapTimeRange : 0
              const barHeight = Math.max(10, Math.round((1 - normalized) * 100))
              const inPeak =
                lap.lapNumber >= lapTrend.peakRange[0] && lap.lapNumber <= lapTrend.peakRange[1]
              const inWorst =
                lap.lapNumber >= lapTrend.worstRange[0] && lap.lapNumber <= lapTrend.worstRange[1]
              const bgColor = inPeak
                ? 'bg-green-500'
                : inWorst
                  ? 'bg-red-500'
                  : 'bg-purple-500'
              return (
                <div key={lap.lapNumber} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div
                    className={`w-full ${bgColor} rounded-t`}
                    style={{ height: `${barHeight}%` }}
                    title={`第${lap.lapNumber}圈: ${formatTime(lap.time)} (+${lap.delta.toFixed(3)}s)`}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex justify-between text-[8px] text-gray-600 mt-0.5">
          {lapTrend.laps.map((lap) => (
            <span key={lap.lapNumber} className="flex-1 text-center">{lap.lapNumber}</span>
          ))}
        </div>
      </Section>

      {/* 5. Fastest vs Slowest */}
      <Section title="最快 vs 最慢圈" defaultOpen icon="⚡" tip="对比最快圈和最慢圈在每个弯道的耗时差异，找出最慢圈掉时最多的弯道。">
        <div className="flex items-center gap-4 mb-3 text-xs">
          <div>
            <span className="text-gray-500">最快: </span>
            <span className="text-green-400 font-bold">第{fastestVsSlowest.fastestLap}圈 {formatTime(fastestVsSlowest.fastestTime)}</span>
          </div>
          <div>
            <span className="text-gray-500">最慢: </span>
            <span className="text-red-400 font-bold">第{fastestVsSlowest.slowestLap}圈 {formatTime(fastestVsSlowest.slowestTime)}</span>
          </div>
          <div>
            <span className="text-gray-500">差距: </span>
            <span className="text-yellow-400 font-bold">{fastestVsSlowest.totalDelta.toFixed(3)}s</span>
          </div>
        </div>
        <div className="space-y-1.5">
          {fastestVsSlowest.perCorner.map((c) => {
            const absPct = Math.abs(c.percentage)
            const barColor = absPct > 20 ? 'bg-red-500' : absPct > 10 ? 'bg-yellow-500' : 'bg-gray-500'
            return (
              <div key={c.corner} className="flex items-center gap-2 text-xs">
                <span className="w-7 font-bold text-gray-200 shrink-0">{c.corner}</span>
                <div className="flex-1 flex items-center gap-1">
                  <span className="w-14 text-right text-green-400 shrink-0">{c.fastestTime.toFixed(3)}s</span>
                  <div className="flex-1 h-2.5 bg-gray-700/50 rounded overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded`}
                      style={{ width: `${Math.min(100, absPct)}%` }}
                    />
                  </div>
                  <span className="w-14 text-left text-red-400 shrink-0">{c.slowestTime.toFixed(3)}s</span>
                </div>
                <span className="w-10 text-right text-gray-500 shrink-0 text-[10px]">
                  {c.percentage.toFixed(0)}%
                </span>
              </div>
            )
          })}
        </div>
      </Section>

      {/* 6. Braking/Acceleration Pattern with Apex Geometry */}
      <Section title="弯道几何 & 刹车/加速" defaultOpen icon="🛞" tip="分析每个弯道的制动和加速模式，包括弯心位置、入弯减速量和出弯加速量。">
        <div className="space-y-3">
          {brakingPattern.map((c) => (
            <div key={c.corner} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
              {/* Corner header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-200">{c.corner}</span>
                  <span className="text-xs text-gray-500">
                    {c.direction === '左' ? '↰ 左弯' : '↱ 右弯'} · {c.angle}° · {c.type}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <DiagnosisBadge diagnosis={c.diagnosis} />
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    c.apexPosition === '早弯心' ? 'bg-blue-900/50 text-blue-300' :
                    c.apexPosition === '晚弯心' ? 'bg-orange-900/50 text-orange-300' :
                    'bg-gray-700/50 text-gray-400'
                  }`}>{c.apexPosition}</span>
                </div>
              </div>

              {/* Speed profile: Entry → Apex → Min → Exit */}
              <div className="flex items-center gap-1 text-xs mb-2">
                <div className="flex flex-col items-center">
                  <span className="w-3 h-3 rounded-full bg-blue-500 border border-white mb-0.5" />
                  <span className="text-gray-500">入弯</span>
                  <span className="text-gray-300 font-mono">{c.entrySpeed.toFixed(1)}</span>
                </div>
                <div className="flex-1 h-px bg-gray-700 relative">
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] ${c.brakingIntensity > 10 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    -{c.brakingIntensity.toFixed(1)} km/h
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="w-3.5 h-3.5 rounded-full bg-red-500 border border-white mb-0.5" />
                  <span className="text-gray-500">弯心</span>
                  <span className="text-gray-300 font-mono">{c.apexSpeed}</span>
                </div>
                <div className="flex-1 h-px bg-gray-700 relative">
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] inline-flex items-center ${c.exitAcceleration < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {c.exitAcceleration >= 0 ? '+' : ''}{c.exitAcceleration.toFixed(1)} km/h<InfoTip text="出弯速度减去弯心速度。负值表示出弯还在减速，说明 apex 后仍在转向" />
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="w-3 h-3 rounded-full bg-cyan-500 border border-white mb-0.5" />
                  <span className="text-gray-500">出弯</span>
                  <span className="text-gray-300 font-mono">{c.exitSpeed.toFixed(1)}</span>
                </div>
              </div>

              {/* Apex position bar */}
              <div className="mb-1.5">
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-0.5">
                  <span className="inline-flex items-center">弯心位置<InfoTip text="弯心在弯道中的相对位置。早弯心(<35%)适合高速弯，晚弯心(>65%)适合慢进快出策略" /></span>
                  <span>{c.brakingPhaseRatio}%</span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full"
                    style={{ width: `${c.brakingPhaseRatio}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                  <span>入弯</span>
                  <span>出弯</span>
                </div>
              </div>

              {/* Detailed diagnosis */}
              {c.detailedDiagnosis.length > 0 && (
                <div className="mt-2 space-y-1">
                  {c.detailedDiagnosis.map((d, i) => (
                    <p key={i} className="text-[11px] text-gray-500 pl-2 border-l-2 border-gray-700">
                      {d}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* 7. Quick vs Slow Lap Group Analysis */}
      {lapGroups.quickLaps.length > 0 && lapGroups.slowLaps.length > 0 && (
        <Section title="快慢圈组分析" defaultOpen icon="🔀" tip="将所有圈分为快圈组和慢圈组，对比两组在每个弯道的表现差异。">
          <div className="flex items-center gap-6 mb-2">
            <div className="text-center">
              <div className="text-[10px] text-gray-500">快圈组 ({lapGroups.quickLaps.length}圈) 平均</div>
              <div className="text-2xl font-bold text-green-400">{formatTime(lapGroups.quickAvg)}</div>
              <div className="text-[10px] text-gray-600">第 {lapGroups.quickLaps.join(', ')} 圈</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500">差距</div>
              <div className="text-lg font-bold text-yellow-400">+{lapGroups.gap.toFixed(3)}s</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500">慢圈组 ({lapGroups.slowLaps.length}圈) 平均</div>
              <div className="text-2xl font-bold text-red-400">{formatTime(lapGroups.slowAvg)}</div>
              <div className="text-[10px] text-gray-600">第 {lapGroups.slowLaps.join(', ')} 圈</div>
            </div>
          </div>
          <div className="text-[10px] text-gray-500 mb-2">各弯道快慢圈差距（按差距排序）</div>
          <div className="space-y-1.5 mb-4">
            {[...lapGroups.perCorner].sort((a, b) => b.gap - a.gap).map((c) => {
              const maxGap = Math.max(...lapGroups.perCorner.map((p) => p.gap)) || 0.1
              const barWidth = Math.min(100, (Math.max(0, c.gap) / maxGap) * 100)
              const barColor = c.gap > 0.2 ? 'bg-red-500' : c.gap > 0.1 ? 'bg-yellow-500' : 'bg-gray-500'
              return (
                <div key={c.corner} className="flex items-center gap-2 text-xs">
                  <span className="w-7 font-bold text-gray-200 shrink-0">{c.corner}</span>
                  <div className="flex-1 h-3.5 bg-gray-700/50 rounded overflow-hidden">
                    <div className={`h-full ${barColor} rounded`} style={{ width: `${barWidth}%` }} />
                  </div>
                  <span className="w-16 text-right text-gray-400 shrink-0">
                    +{c.gap.toFixed(3)}s
                  </span>
                </div>
              )
            })}
          </div>
          {/* Speed comparison for top 3 gap corners */}
          <div className="text-[10px] text-gray-500 mb-2">差距最大弯道速度对比 (km/h)</div>
          <div className="space-y-2">
            {[...lapGroups.perCorner].sort((a, b) => b.gap - a.gap).slice(0, 3).map((c) => (
              <div key={c.corner} className="bg-gray-900/50 rounded p-2 border border-gray-700/30">
                <div className="text-xs font-bold text-gray-200 mb-1">{c.corner}</div>
                <div className="grid grid-cols-4 gap-1 text-[10px]">
                  <div className="text-gray-500"></div>
                  <div className="text-gray-500 text-center">入弯</div>
                  <div className="text-gray-500 text-center">最低</div>
                  <div className="text-gray-500 text-center">出弯</div>
                  <div className="text-green-400">快圈组</div>
                  <div className="text-center text-gray-300">{c.quickSpeeds.entry.toFixed(1)}</div>
                  <div className="text-center text-gray-300">{c.quickSpeeds.min.toFixed(1)}</div>
                  <div className="text-center text-gray-300">{c.quickSpeeds.exit.toFixed(1)}</div>
                  <div className="text-red-400">慢圈组</div>
                  <div className="text-center text-gray-300">{c.slowSpeeds.entry.toFixed(1)}</div>
                  <div className="text-center text-gray-300">{c.slowSpeeds.min.toFixed(1)}</div>
                  <div className="text-center text-gray-300">{c.slowSpeeds.exit.toFixed(1)}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 8. Corner-to-Laptime Correlation */}
      {cornerCorrelation.length > 0 && (
        <Section title="弯道-圈速相关性" defaultOpen icon="🔗">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-1 pr-2">弯道</th>
                <th className="text-right py-1 pr-2"><span className="inline-flex items-center justify-end">相关系数<InfoTip text="该弯道耗时与总圈速的相关系数。越接近1说明该弯道对圈速影响越大" /></span></th>
                <th className="text-center py-1">显著性</th>
              </tr>
            </thead>
            <tbody>
              {[...cornerCorrelation].sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).map((c) => (
                <tr
                  key={c.corner}
                  className={`border-b border-gray-800/50 ${
                    Math.abs(c.correlation) > 0.7 ? 'text-red-300' : 'text-gray-400'
                  }`}
                >
                  <td className="py-1 pr-2 font-medium text-gray-300">{c.corner}</td>
                  <td className="text-right py-1 pr-2 font-mono">{c.correlation.toFixed(3)}</td>
                  <td className="text-center py-1">
                    <SignificanceBadge significance={c.significance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* 9. Corner Scoring */}
      {cornerScoring.length > 0 && (
        <Section title="弯道综合评分" defaultOpen icon="📋" tip="综合考虑平均掉时、稳定性、快慢圈差距和单圈最大掉时的加权评分，越高越需要优化">
          <div className="space-y-2">
            {cornerScoring.map((c) => (
              <div key={c.corner} className="bg-gray-900/50 rounded p-2.5 border border-gray-700/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-gray-200">{c.corner}</span>
                  <div className="w-32">
                    <ScoreBar score={c.score} />
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-1 text-[10px] text-gray-500">
                  <div className="text-center">
                    <div>平均偏差</div>
                    <div className="text-gray-300">{c.avgDelta.toFixed(3)}s</div>
                  </div>
                  <div className="text-center">
                    <div>标准差</div>
                    <div className="text-gray-300">{c.stdDev.toFixed(3)}s</div>
                  </div>
                  <div className="text-center">
                    <div>快慢差</div>
                    <div className="text-gray-300">{c.quickSlowGap.toFixed(3)}s</div>
                  </div>
                  <div className="text-center">
                    <div>最大单丢</div>
                    <div className="text-gray-300">{c.maxSingleLoss.toFixed(3)}s</div>
                  </div>
                  <div className="text-center">
                    <div>相关性</div>
                    <div className="text-gray-300">{c.correlation.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 10. Training Plan */}
      {trainingPlan.length > 0 && (
        <Section title="训练计划" defaultOpen icon="📝">
          <div className="space-y-3">
            {trainingPlan.map((stint) => (
              <div key={stint.stint} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-purple-500/30 text-purple-300 text-xs font-bold flex items-center justify-center border border-purple-500/50">
                    {stint.stint}
                  </span>
                  <div>
                    <div className="text-sm font-bold text-gray-200">{stint.title}</div>
                    <div className="text-[10px] text-gray-500">
                      重点: <span className="text-purple-300">{stint.focus}</span> · 目标: {stint.goal}
                    </div>
                  </div>
                </div>
                <div className="space-y-1 pl-8">
                  {stint.targets.map((target, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-gray-400">
                      <span className="text-purple-400 shrink-0 mt-px">•</span>
                      <span>{target}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 11. Coaching Narrative */}
      {cornerNarrative.length > 0 && (
        <Section title="教练点评" defaultOpen icon="🗣️">
          <div className="space-y-2">
            {cornerNarrative
              .filter((c) => {
                const scoring = cornerScoring.find((s) => s.corner === c.corner)
                return scoring && scoring.score > 3
              })
              .map((c) => (
                <div key={c.corner} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30">
                  <div className="text-xs font-bold text-gray-200 mb-1.5">{c.corner}</div>
                  <div className="space-y-1">
                    {c.comments.map((comment, i) => (
                      <p key={i} className="text-[11px] text-gray-400 pl-2 border-l-2 border-purple-500/50">
                        {comment}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </Section>
      )}
    </div>
  )
}
