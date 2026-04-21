import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { FullAnalysis } from '../lib/analysis/full-analysis'
import type { RacingLineAnalysis } from '../types'
import RacingLineReport from './RacingLineReport'

interface AnalysisReportProps {
  analysis: FullAnalysis
  comparisonLapId?: number | null
  currentRacingLineAnalysis?: RacingLineAnalysis | null
  fastestLapId?: number
  racingLineAnalyses?: RacingLineAnalysis[]
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

function MetricTile({
  label,
  value,
  accentClass,
  sublabel,
}: {
  label: string
  value: string
  accentClass: string
  sublabel?: string
}) {
  return (
    <div className="rounded-lg border border-gray-700/40 bg-gray-900/60 p-3">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accentClass}`}>{value}</div>
      {sublabel && <div className="mt-1 text-[10px] text-gray-500">{sublabel}</div>}
    </div>
  )
}

function ReportBlock({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-700/30 bg-gray-900/50 p-3">
      {eyebrow && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{eyebrow}</div>}
      <div className="mb-2 text-xs font-bold text-gray-200">{title}</div>
      {children}
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

export default function AnalysisReport({
  analysis,
  comparisonLapId = null,
  currentRacingLineAnalysis = null,
  fastestLapId,
  racingLineAnalyses = [],
}: AnalysisReportProps) {
  const {
    theoreticalBest,
    fastestVsSlowest,
    brakingPattern,
    lapGroups,
    cornerCorrelation,
    trainingPlan,
    cornerScoring,
    cornerNarrative,
    trackStrategy,
    cornerPriority,
    consistency,
    lapTrend,
  } = analysis

  if (theoreticalBest.perCorner.length === 0) {
    return null
  }
  const topPriority = cornerPriority[0] ?? null
  const topZone = trackStrategy.priorityZones[0] ?? null
  const roleGroups = [
    {
      label: '直道入口弯',
      corners: trackStrategy.cornerRoles.filter((role) => role.role === '直道入口弯').map((role) => role.corner),
    },
    {
      label: '组合弯',
      corners: trackStrategy.cornerRoles.filter((role) => role.role === '组合弯').map((role) => role.corner),
    },
    {
      label: '独立弯',
      corners: trackStrategy.cornerRoles.filter((role) => role.role === '独立弯').map((role) => role.corner),
    },
  ].filter((group) => group.corners.length > 0)

  return (
    <div className="space-y-2">
      <Section title="语义确认" defaultOpen icon="🧭" tip="先确认这份页面会先给你方向，再给你证据和细表。">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <MetricTile
              label="当前最快圈"
              value={`第${fastestVsSlowest.fastestLap}圈 ${formatTime(fastestVsSlowest.fastestTime)}`}
              accentClass="text-purple-400"
            />
            <MetricTile
              label="可回收时间"
              value={`-${theoreticalBest.savings.toFixed(3)}s`}
              accentClass="text-green-400"
              sublabel="代表纯驾驶层面的可挖空间"
            />
            <MetricTile
              label="首要训练对象"
              value={topZone?.zone ?? topPriority?.corner ?? '待识别'}
              accentClass="text-yellow-300"
              sublabel="优先先改最能换来圈速的区域"
            />
          </div>
          <ReportBlock title="这份报告先回答什么" eyebrow="Coach framing">
            <div className="space-y-1 text-[11px] leading-relaxed text-gray-400">
              <p>先告诉你整圈应该怎么规划，再指出最值得优先优化的弯段，最后给出今天就能执行的训练动作。</p>
              <p>证据面板和附录在后面，作用是帮你确认判断，而不是让你自己先从数字里拼结论。</p>
            </div>
          </ReportBlock>
        </div>
      </Section>

      <Section title="本次教练摘要" defaultOpen icon="🗣️" tip="用最短阅读路径告诉车手：现在最应该先做什么。">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <MetricTile
              label="最佳圈速"
              value={formatTime(fastestVsSlowest.fastestTime)}
              accentClass="text-purple-400"
              sublabel={`第${fastestVsSlowest.fastestLap}圈`}
            />
            <MetricTile
              label="理论最佳"
              value={formatTime(theoreticalBest.time)}
              accentClass="text-green-400"
              sublabel={`还能拿回 ${theoreticalBest.savings.toFixed(3)}s`}
            />
            <MetricTile
              label="最大掉时区域"
              value={topPriority ? `${topPriority.corner} +${topPriority.avgDelta.toFixed(3)}s` : '暂无'}
              accentClass="text-red-400"
            />
          </div>

          <ReportBlock title="本节最该先改的弯段" eyebrow="Priority">
            {cornerPriority.length > 0 ? (
              <div className="space-y-1.5">
                {cornerPriority.slice(0, 3).map((corner, index) => {
                  const maxDelta = cornerPriority[0]?.avgDelta || 0.1
                  const barWidth = Math.min(100, Math.abs(corner.avgDelta) / Math.abs(maxDelta) * 100)
                  return (
                    <div key={corner.corner} className="flex items-center gap-2 text-[11px]">
                      <span className="w-5 text-gray-500">{index + 1}</span>
                      <span className="w-10 font-semibold text-gray-200">{corner.corner}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded bg-gray-800">
                        <div className="h-full rounded bg-red-500" style={{ width: `${barWidth}%` }} />
                      </div>
                      <span className="w-14 text-right font-mono text-red-400">+{corner.avgDelta.toFixed(3)}s</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-[11px] text-gray-500">当前没有足够的数据生成优先级。</p>
            )}
          </ReportBlock>

          <ReportBlock title="训练闭环" eyebrow="Today">
            {trackStrategy.trainingClosure.length > 0 ? (
              <div className="space-y-1">
                {trackStrategy.trainingClosure.map((item, index) => (
                  <div key={`${item.focus}-${index}`} className="text-[11px] text-gray-400">
                    <span className="mr-1 text-green-400">{index + 1}.</span>
                    {item.focus}
                    <span className="ml-1 text-gray-500">看 {item.metric}，目标 {item.target}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-500">当前还没有形成明确的训练闭环建议。</p>
            )}
          </ReportBlock>
        </div>
      </Section>

      <Section title="整圈策略" defaultOpen icon="🛣️" tip="从整圈规划视角解释这条赛道应该怎么跑。">
        <div className="space-y-3">
          <ReportBlock title="整圈主线" eyebrow="Whole track">
            <p className="text-[11px] leading-relaxed text-gray-300">
              {trackStrategy.overallApproach || '当前还没有形成明确的整圈策略结论。'}
            </p>
          </ReportBlock>

          {roleGroups.length > 0 && (
            <ReportBlock title="赛道角色分工" eyebrow="Corner roles">
              <div className="grid gap-2 sm:grid-cols-3">
                {roleGroups.map((group) => (
                  <div key={group.label} className="rounded-lg border border-gray-700/30 bg-black/10 p-2">
                    <div className="text-[10px] font-semibold text-gray-500">{group.label}</div>
                    <div className="mt-1 text-[11px] text-gray-300">{group.corners.join('、')}</div>
                  </div>
                ))}
              </div>
            </ReportBlock>
          )}

          <ReportBlock title="重点区域（按收益排序）" eyebrow="Zones">
            {trackStrategy.priorityZones.length > 0 ? (
              <div className="space-y-2">
                {trackStrategy.priorityZones.map((zone) => (
                  <div key={zone.zone} className="rounded-lg border border-gray-700/30 bg-black/10 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-purple-500/50 bg-purple-500/20 text-[10px] font-bold text-purple-300">
                        {zone.priority}
                      </span>
                      <span className="text-xs font-bold text-gray-200">{zone.zone}</span>
                      <span className="ml-auto text-[10px] text-green-400">{zone.targetGain}</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-gray-400">
                      <div><span className="text-yellow-400">症状：</span>{zone.symptom}</div>
                      <div><span className="text-orange-400">根因：</span>{zone.rootCause}</div>
                      <div><span className="text-cyan-400">练法：</span>{zone.practice}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-500">当前没有识别出清晰的重点收益区。</p>
            )}
          </ReportBlock>
        </div>
      </Section>

      <Section title="重点弯道点评" defaultOpen icon="🎯" tip="把世界一流教练会先盯的弯段逐个讲清楚。">
        <div className="space-y-2">
          {cornerNarrative.length > 0 ? (
            cornerNarrative.map((corner) => {
              const role = trackStrategy.cornerRoles.find((item) => item.corner === corner.corner)
              const roleLabel = role?.role === '直道入口弯'
                ? '🏁 直道入口弯'
                : role?.role === '组合弯'
                  ? '🔗 组合弯'
                  : role?.role === '独立弯'
                    ? '📍 独立弯'
                    : ''
              return (
                <ReportBlock key={corner.corner} title={corner.corner} eyebrow={roleLabel || undefined}>
                  <div className="space-y-1">
                    {corner.comments.map((comment, index) => (
                      <p key={index} className="border-l-2 border-purple-500/50 pl-2 text-[11px] text-gray-400">
                        {comment}
                      </p>
                    ))}
                  </div>
                </ReportBlock>
              )
            })
          ) : (
            <ReportBlock title="暂无逐弯点评">
              <p className="text-[11px] text-gray-500">当前数据还不足以生成逐弯教练点评。</p>
            </ReportBlock>
          )}
        </div>
      </Section>

      <Section title="训练计划" defaultOpen icon="📝" tip="把整圈策略落成可以在下一组练习里执行的动作。">
        <div className="space-y-3">
          {trainingPlan.length > 0 ? (
            trainingPlan.map((stint) => (
              <ReportBlock key={stint.stint} title={stint.title} eyebrow={`Stint ${stint.stint}`}>
                <div className="mb-2 text-[11px] text-gray-400">
                  重点 <span className="text-purple-300">{stint.focus}</span>
                  <span className="mx-1 text-gray-600">/</span>
                  目标 {stint.goal}
                </div>
                <div className="space-y-1">
                  {stint.targets.map((target, index) => (
                    <div key={index} className="flex items-start gap-1.5 text-[11px] text-gray-400">
                      <span className="mt-px shrink-0 text-purple-400">•</span>
                      <span>{target}</span>
                    </div>
                  ))}
                </div>
              </ReportBlock>
            ))
          ) : (
            <ReportBlock title="暂无训练计划">
              <p className="text-[11px] text-gray-500">当前还没有生成可执行的训练计划。</p>
            </ReportBlock>
          )}
        </div>
      </Section>

      <Section title="证据面板" icon="🔬" tip="在这里验证前面的教练判断为什么成立。" defaultOpen={false}>
        <div className="space-y-3">
          {racingLineAnalyses.length > 0 && fastestLapId !== undefined && (
            <ReportBlock title="整圈走线证据" eyebrow="Racing line">
              <RacingLineReport analyses={racingLineAnalyses} fastestLapId={fastestLapId} />
            </ReportBlock>
          )}

          {currentRacingLineAnalysis && comparisonLapId !== null && fastestLapId !== undefined && (
            <ReportBlock title={`第${comparisonLapId}圈 vs 第${fastestLapId}圈`} eyebrow="Selected comparison">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="py-1 text-left">弯道</th>
                    <th className="py-1 text-right">偏差</th>
                    <th className="py-1 text-center">一致性</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRacingLineAnalysis.corners.map((corner) => {
                    const absDeviation = Math.abs(corner.meanDeviation)
                    const deviationColor = absDeviation < 0.5 ? 'text-green-400' : absDeviation < 1.5 ? 'text-yellow-400' : 'text-red-400'
                    const consistencyColor = corner.curvatureConsistency >= 85 ? 'text-green-400' : corner.curvatureConsistency >= 65 ? 'text-yellow-400' : 'text-red-400'
                    return (
                      <tr key={corner.cornerName} className="border-b border-gray-800/30">
                        <td className="py-1 font-medium text-gray-300">{corner.cornerName}</td>
                        <td className={`py-1 text-right ${deviationColor}`}>
                          {corner.meanDeviation >= 0 ? '+' : ''}{corner.meanDeviation.toFixed(2)}m
                        </td>
                        <td className={`py-1 text-center ${consistencyColor}`}>{corner.curvatureConsistency}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ReportBlock>
          )}

          <ReportBlock title="弯道几何与刹车/加速证据" eyebrow="Geometry">
            <div className="space-y-3">
              {brakingPattern.map((corner) => (
                <div key={corner.corner} className="rounded-lg border border-gray-700/30 bg-black/10 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-200">{corner.corner}</span>
                      <span className="text-xs text-gray-500">
                        {corner.direction === '左' ? '↰ 左弯' : '↱ 右弯'} · {corner.angle}° · {corner.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DiagnosisBadge diagnosis={corner.diagnosis} />
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                        corner.apexPosition === '早弯心'
                          ? 'bg-blue-900/50 text-blue-300'
                          : corner.apexPosition === '晚弯心'
                            ? 'bg-orange-900/50 text-orange-300'
                            : 'bg-gray-700/50 text-gray-400'
                      }`}>{corner.apexPosition}</span>
                    </div>
                  </div>

                  <div className="mb-2 flex items-center gap-1 text-xs">
                    <div className="flex flex-col items-center">
                      <span className="mb-0.5 h-3 w-3 rounded-full border border-white bg-blue-500" />
                      <span className="text-gray-500">入弯</span>
                      <span className="font-mono text-gray-300">{corner.entrySpeed.toFixed(1)}</span>
                    </div>
                    <div className="relative h-px flex-1 bg-gray-700">
                      <span className={`absolute left-1/2 top-[-12px] -translate-x-1/2 text-[10px] ${corner.brakingIntensity > 10 ? 'text-yellow-400' : 'text-gray-500'}`}>
                        -{corner.brakingIntensity.toFixed(1)} km/h
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="mb-0.5 h-3.5 w-3.5 rounded-full border border-white bg-red-500" />
                      <span className="text-gray-500">弯心</span>
                      <span className="font-mono text-gray-300">{corner.apexSpeed.toFixed(1)}</span>
                    </div>
                    <div className="relative h-px flex-1 bg-gray-700">
                      <span className={`absolute left-1/2 top-[-12px] -translate-x-1/2 text-[10px] ${corner.exitAcceleration < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {corner.exitAcceleration >= 0 ? '+' : ''}{corner.exitAcceleration.toFixed(1)} km/h
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="mb-0.5 h-3 w-3 rounded-full border border-white bg-cyan-500" />
                      <span className="text-gray-500">出弯</span>
                      <span className="font-mono text-gray-300">{corner.exitSpeed.toFixed(1)}</span>
                    </div>
                  </div>

                  <div className="mb-1.5">
                    <div className="mb-0.5 flex items-center gap-2 text-[10px] text-gray-500">
                      <span className="inline-flex items-center">弯心位置<InfoTip text="弯心在弯道中的相对位置。早弯心(<35%)适合高速弯，晚弯心(>65%)适合慢进快出策略" /></span>
                      <span>{corner.brakingPhaseRatio}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-700">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${corner.brakingPhaseRatio}%` }} />
                    </div>
                  </div>

                  {corner.detailedDiagnosis.length > 0 && (
                    <div className="space-y-1">
                      {corner.detailedDiagnosis.map((detail, index) => (
                        <p key={index} className="border-l-2 border-gray-700 pl-2 text-[11px] text-gray-500">
                          {detail}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ReportBlock>

          <ReportBlock title="快慢圈组证据" eyebrow="Lap groups">
            {lapGroups.quickLaps.length > 0 && lapGroups.slowLaps.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-6">
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

                <div className="space-y-1.5">
                  {[...lapGroups.perCorner].sort((a, b) => b.gap - a.gap).map((corner) => {
                    const maxGap = Math.max(...lapGroups.perCorner.map((item) => item.gap)) || 0.1
                    const barWidth = Math.min(100, (Math.max(0, corner.gap) / maxGap) * 100)
                    const barColor = corner.gap > 0.2 ? 'bg-red-500' : corner.gap > 0.1 ? 'bg-yellow-500' : 'bg-gray-500'
                    return (
                      <div key={corner.corner} className="flex items-center gap-2 text-xs">
                        <span className="w-7 shrink-0 font-bold text-gray-200">{corner.corner}</span>
                        <div className="h-3.5 flex-1 overflow-hidden rounded bg-gray-700/50">
                          <div className={`h-full rounded ${barColor}`} style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-gray-400">+{corner.gap.toFixed(3)}s</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-gray-500">当前圈数不足，无法形成快慢圈组对比。</p>
            )}
          </ReportBlock>
        </div>
      </Section>

      <Section title="车手状态" icon="🫀" tip="看今天的发挥曲线和稳定性，而不是只看单圈最好成绩。" defaultOpen={false}>
        <div className="space-y-3">
          <ReportBlock title="圈速趋势" eyebrow="Trend">
            {lapTrend.laps.length > 0 ? (() => {
              const times = lapTrend.laps.map((lap) => lap.time)
              const minTime = Math.min(...times)
              const maxTime = Math.max(...times)
              const range = maxTime - minTime || 1
              const trendLabel = lapTrend.trend === 'improving' ? '持续进步' : lapTrend.trend === 'declining' ? '逐渐下降' : '波动'
              const trendColor = lapTrend.trend === 'improving' ? 'text-green-400' : lapTrend.trend === 'declining' ? 'text-red-400' : 'text-yellow-400'
              return (
                <>
                  <div className={`mb-1 text-[11px] font-semibold ${trendColor}`}>{trendLabel}</div>
                  <div className="mb-1 text-[10px] text-gray-500">
                    最佳窗口 第{lapTrend.peakRange[0]}-{lapTrend.peakRange[1]}圈，最差窗口 第{lapTrend.worstRange[0]}-{lapTrend.worstRange[1]}圈
                  </div>
                  <div className="relative h-16">
                    <div className="absolute inset-0 flex items-end gap-px">
                      {lapTrend.laps.map((lap) => {
                        const normalized = (lap.time - minTime) / range
                        const barHeight = Math.max(8, Math.round((1 - normalized) * 100))
                        const inPeak = lap.lapNumber >= lapTrend.peakRange[0] && lap.lapNumber <= lapTrend.peakRange[1]
                        const inWorst = lap.lapNumber >= lapTrend.worstRange[0] && lap.lapNumber <= lapTrend.worstRange[1]
                        const bg = inPeak ? 'bg-green-500' : inWorst ? 'bg-red-500' : 'bg-purple-500'
                        return (
                          <div key={lap.lapNumber} className="flex h-full flex-1 flex-col items-center justify-end" title={`第${lap.lapNumber}圈: ${formatTime(lap.time)}`}>
                            <div className={`w-full rounded-t ${bg}`} style={{ height: `${barHeight}%` }} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )
            })() : (
              <p className="text-[11px] text-gray-500">当前圈数不足，无法识别趋势。</p>
            )}
          </ReportBlock>

          <ReportBlock title="稳定性" eyebrow="Consistency">
            {consistency.length > 0 ? (
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="py-1 text-left">弯道</th>
                    <th className="py-1 text-right">标准差</th>
                    <th className="py-1 text-center">评级</th>
                  </tr>
                </thead>
                <tbody>
                  {consistency.map((corner) => {
                    const ratingColor = corner.rating === '非常稳定' ? 'text-green-400' : corner.rating === '稳定' ? 'text-blue-400' : corner.rating === '波动' ? 'text-yellow-400' : 'text-red-400'
                    return (
                      <tr key={corner.corner} className="border-b border-gray-800/30">
                        <td className="py-1 font-medium text-gray-300">{corner.corner}</td>
                        <td className="py-1 text-right font-mono text-gray-400">{corner.stdDev.toFixed(3)}s</td>
                        <td className={`py-1 text-center ${ratingColor}`}>{corner.rating}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-[11px] text-gray-500">当前没有足够的数据评估稳定性。</p>
            )}
          </ReportBlock>
        </div>
      </Section>

      <Section title="附录" icon="📎" tip="需要进一步核对时，再展开看完整证据和补充分析。" defaultOpen={false}>
        <div className="space-y-3">
          <ReportBlock title="理论最佳圈" eyebrow="Potential">
            <div className="mb-3 flex flex-wrap items-baseline gap-4">
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
                <tr className="border-b border-gray-700 text-gray-500">
                  <th className="py-1 pr-2 text-left">弯道</th>
                  <th className="py-1 pr-2 text-right">最佳时间</th>
                  <th className="py-1 pr-2 text-right">来自</th>
                  <th className="py-1 pr-2 text-right">节省</th>
                  <th className="py-1 text-left">为什么更快</th>
                </tr>
              </thead>
              <tbody>
                {theoreticalBest.perCorner.map((corner) => (
                  <tr key={corner.corner} className="border-b border-gray-800/50 text-gray-400">
                    <td className="py-1.5 pr-2 font-medium text-gray-300">{corner.corner}</td>
                    <td className="py-1.5 pr-2 text-right">{corner.bestTime.toFixed(3)}s</td>
                    <td className="py-1.5 pr-2 text-right text-gray-500">第{corner.bestLap}圈</td>
                    <td className="py-1.5 pr-2 text-right">
                      {corner.savedVsFastest > 0.001 ? <span className="text-green-400">-{corner.savedVsFastest.toFixed(3)}s</span> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="py-1.5 text-[10px] text-gray-500">
                      <div>
                        速度: 入弯{corner.bestEntry >= corner.refEntry ? '+' : ''}{(corner.bestEntry - corner.refEntry).toFixed(1)}
                        {' '}弯心{corner.bestMin >= corner.refMin ? '+' : ''}{(corner.bestMin - corner.refMin).toFixed(1)}
                        {' '}出弯{corner.bestExit >= corner.refExit ? '+' : ''}{(corner.bestExit - corner.refExit).toFixed(1)} km/h
                      </div>
                      {corner.lineNote && <div className="mt-0.5 text-purple-400/70">{corner.lineNote}</div>}
                      {corner.bestLine && corner.refLine && corner.bestLap !== fastestVsSlowest.fastestLap && (
                        <CornerTrajectoryMap
                          bestLine={corner.bestLine}
                          refLine={corner.refLine}
                          bestLapId={corner.bestLap}
                          refLapId={fastestVsSlowest.fastestLap}
                          bestSpeeds={{ entry: corner.bestEntry, min: corner.bestMin, exit: corner.bestExit }}
                          refSpeeds={{ entry: corner.refEntry, min: corner.refMin, exit: corner.refExit }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ReportBlock>

          <ReportBlock title="最快 vs 最慢圈" eyebrow="Spread">
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className="text-gray-500">最快: </span>
                <span className="font-bold text-green-400">第{fastestVsSlowest.fastestLap}圈 {formatTime(fastestVsSlowest.fastestTime)}</span>
              </div>
              <div>
                <span className="text-gray-500">最慢: </span>
                <span className="font-bold text-red-400">第{fastestVsSlowest.slowestLap}圈 {formatTime(fastestVsSlowest.slowestTime)}</span>
              </div>
              <div>
                <span className="text-gray-500">差距: </span>
                <span className="font-bold text-yellow-400">{fastestVsSlowest.totalDelta.toFixed(3)}s</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {fastestVsSlowest.perCorner.map((corner) => {
                const absPct = Math.abs(corner.percentage)
                const barColor = absPct > 20 ? 'bg-red-500' : absPct > 10 ? 'bg-yellow-500' : 'bg-gray-500'
                return (
                  <div key={corner.corner} className="flex items-center gap-2 text-xs">
                    <span className="w-7 shrink-0 font-bold text-gray-200">{corner.corner}</span>
                    <div className="flex flex-1 items-center gap-1">
                      <span className="w-14 shrink-0 text-right text-green-400">{corner.fastestTime.toFixed(3)}s</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded bg-gray-700/50">
                        <div className={`h-full rounded ${barColor}`} style={{ width: `${Math.min(100, absPct)}%` }} />
                      </div>
                      <span className="w-14 shrink-0 text-left text-red-400">{corner.slowestTime.toFixed(3)}s</span>
                    </div>
                    <span className="w-10 shrink-0 text-right text-[10px] text-gray-500">{corner.percentage.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          </ReportBlock>

          <ReportBlock title="弯道-圈速相关性" eyebrow="Correlation">
            {cornerCorrelation.length > 0 ? (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-500">
                    <th className="py-1 pr-2 text-left">弯道</th>
                    <th className="py-1 pr-2 text-right">相关系数</th>
                    <th className="py-1 text-center">显著性</th>
                  </tr>
                </thead>
                <tbody>
                  {[...cornerCorrelation].sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).map((corner) => (
                    <tr key={corner.corner} className={`border-b border-gray-800/50 ${Math.abs(corner.correlation) > 0.7 ? 'text-red-300' : 'text-gray-400'}`}>
                      <td className="py-1 pr-2 font-medium text-gray-300">{corner.corner}</td>
                      <td className="py-1 pr-2 text-right font-mono">{corner.correlation.toFixed(3)}</td>
                      <td className="py-1 text-center"><SignificanceBadge significance={corner.significance} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[11px] text-gray-500">当前没有足够的数据计算相关性。</p>
            )}
          </ReportBlock>

          <ReportBlock title="弯道综合评分" eyebrow="Scoring">
            {cornerScoring.length > 0 ? (
              <div className="space-y-2">
                {cornerScoring.map((corner) => (
                  <div key={corner.corner} className="rounded border border-gray-700/30 bg-black/10 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-200">{corner.corner}</span>
                      <div className="w-32">
                        <ScoreBar score={corner.score} />
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-[10px] text-gray-500">
                      <div className="text-center">
                        <div>平均偏差</div>
                        <div className="text-gray-300">{corner.avgDelta.toFixed(3)}s</div>
                      </div>
                      <div className="text-center">
                        <div>标准差</div>
                        <div className="text-gray-300">{corner.stdDev.toFixed(3)}s</div>
                      </div>
                      <div className="text-center">
                        <div>快慢差</div>
                        <div className="text-gray-300">{corner.quickSlowGap.toFixed(3)}s</div>
                      </div>
                      <div className="text-center">
                        <div>最大单丢</div>
                        <div className="text-gray-300">{corner.maxSingleLoss.toFixed(3)}s</div>
                      </div>
                      <div className="text-center">
                        <div>相关性</div>
                        <div className="text-gray-300">{corner.correlation.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-500">当前没有弯道综合评分。</p>
            )}
          </ReportBlock>
        </div>
      </Section>
    </div>
  )
}
