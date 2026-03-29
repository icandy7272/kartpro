import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { RacingLineAnalysis } from '../types'

interface RacingLineReportProps {
  analyses: RacingLineAnalysis[]
  fastestLapId: number
}

function InfoTip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  const [style, setStyle] = useState<React.CSSProperties>({})
  const ref = { current: null as HTMLSpanElement | null }

  return (
    <span
      ref={(el) => { ref.current = el }}
      className="inline-flex items-center ml-1 cursor-help"
      onMouseEnter={() => {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect()
          setStyle({
            position: 'fixed',
            left: rect.left + rect.width / 2,
            transform: 'translateX(-50%)',
            ...(rect.top > 200
              ? { bottom: window.innerHeight - rect.top + 6 }
              : { top: rect.bottom + 6 }),
            zIndex: 9999,
          })
        }
        setVisible(true)
      }}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(v => !v)}
    >
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-gray-500 hover:text-gray-400 transition-colors shrink-0">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
        <text x="7" y="10.5" textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="600" fontFamily="sans-serif">i</text>
      </svg>
      {visible && createPortal(
        <span style={style} className="max-w-[250px] w-max px-2.5 py-1.5 rounded text-[11px] leading-relaxed text-gray-100 bg-gray-900 border border-gray-700 shadow-lg pointer-events-none">
          {text}
        </span>,
        document.body
      )}
    </span>
  )
}

function Section({ title, icon, tip, defaultOpen = false, children }: {
  title: string; icon: string; tip?: string; defaultOpen?: boolean; children: React.ReactNode
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
      {open && <div className="px-4 pb-3 text-xs">{children}</div>}
    </div>
  )
}

function deviationColor(absMeters: number): string {
  if (absMeters < 0.5) return 'text-green-400'
  if (absMeters < 1.5) return 'text-yellow-400'
  if (absMeters < 3.0) return 'text-orange-400'
  return 'text-red-400'
}

function consistencyLabel(score: number): { text: string; color: string } {
  if (score >= 85) return { text: '高度一致', color: 'text-green-400' }
  if (score >= 65) return { text: '较一致', color: 'text-yellow-400' }
  if (score >= 40) return { text: '有差异', color: 'text-orange-400' }
  return { text: '差异大', color: 'text-red-400' }
}

/**
 * Render a mini sparkline SVG showing lateral deviation across a corner.
 */
function DeviationSparkline({ deviations }: { deviations: { lateralOffset: number }[] }) {
  if (deviations.length < 2) return null

  const maxAbs = Math.max(0.5, ...deviations.map(d => Math.abs(d.lateralOffset)))
  const w = 120
  const h = 24
  const mid = h / 2

  const points = deviations.map((d, i) => {
    const x = (i / (deviations.length - 1)) * w
    const y = mid - (d.lateralOffset / maxAbs) * (mid - 2)
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-[8px] text-gray-600 w-4 text-right">外</span>
      <svg width={w} height={h} className="inline-block">
        <line x1="0" y1={mid} x2={w} y2={mid} stroke="#374151" strokeWidth="1" strokeDasharray="2,2" />
        <polyline
          points={points}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="1.5"
        />
      </svg>
      <span className="text-[8px] text-gray-600 w-4">内</span>
    </div>
  )
}

export default function RacingLineReport({ analyses, fastestLapId }: RacingLineReportProps) {
  const [selectedLapIdx, setSelectedLapIdx] = useState(0)

  if (analyses.length === 0) return null

  const current = analyses[selectedLapIdx] ?? analyses[0]

  // Aggregate consistency across all laps
  const avgConsistency = Math.round(
    analyses.reduce((s, a) => s + a.overallConsistency, 0) / analyses.length
  )
  const consistencyInfo = consistencyLabel(avgConsistency)

  return (
    <div className="space-y-2">
      {/* Overall summary */}
      <Section title="走线分析" icon="🏎️" tip="分析每圈走线与最快圈的偏差，包括横向偏差、刹车/油门点位置和曲率一致性。" defaultOpen>
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">整体走线一致性:</span>
            <span className={`font-bold ${consistencyInfo.color}`}>
              {avgConsistency}% ({consistencyInfo.text})
            </span>
          </div>
        </div>

        {/* Lap selector — compact dropdown for many laps */}
        {analyses.length > 1 && (
          <div className="flex items-center gap-2 mb-3 text-[11px]">
            <span className="text-gray-500 shrink-0">对比:</span>
            <select
              value={selectedLapIdx}
              onChange={(e) => setSelectedLapIdx(Number(e.target.value))}
              className="bg-gray-700 text-gray-200 rounded px-2 py-0.5 text-[11px] border border-gray-600 outline-none"
            >
              {analyses.map((a, i) => (
                <option key={a.comparisonLapId} value={i}>
                  第{a.comparisonLapId}圈
                </option>
              ))}
            </select>
            <span className="text-gray-600">vs 最快圈 (第{fastestLapId}圈)</span>
          </div>
        )}

        {/* Per-corner deviation table */}
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-2">弯道</th>
              <th className="text-right py-1 pr-2">
                <span className="inline-flex items-center justify-end">
                  平均偏差<InfoTip text="正值=走线偏外/偏宽，负值=走线偏内/偏窄。单位：米" />
                </span>
              </th>
              <th className="text-right py-1 pr-2">最大偏差</th>
              <th className="text-center py-1 pr-2">
                <span className="inline-flex items-center justify-center">
                  一致性<InfoTip text="曲率轮廓相似度，100%=与最快圈完全一致的走线" />
                </span>
              </th>
              <th className="text-center py-1">
                <span className="inline-flex items-center justify-center">
                  横向偏差<InfoTip text="弯道内的横向偏差曲线。中线上方=比最快圈偏外（走宽），下方=偏内（切深）。虚线为零偏差参考线。" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {current.corners.map((c) => {
              const cInfo = consistencyLabel(c.curvatureConsistency)
              return (
                <tr key={c.cornerName} className="border-b border-gray-800/50 text-gray-400">
                  <td className="py-1.5 pr-2 font-medium text-gray-300">{c.cornerName}</td>
                  <td className={`text-right py-1.5 pr-2 ${deviationColor(Math.abs(c.meanDeviation))}`}>
                    {c.meanDeviation >= 0 ? '+' : ''}{c.meanDeviation.toFixed(2)}m
                  </td>
                  <td className={`text-right py-1.5 pr-2 ${deviationColor(c.maxDeviation)}`}>
                    {c.maxDeviation.toFixed(2)}m
                  </td>
                  <td className="text-center py-1.5 pr-2">
                    <span className={`${cInfo.color}`}>{c.curvatureConsistency}%</span>
                  </td>
                  <td className="text-center py-1.5">
                    <DeviationSparkline deviations={c.deviations} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>

      {/* Brake/Throttle points */}
      <Section title="刹车/油门点对比" icon="🔴🟢" tip="对比选中圈与最快圈的刹车点和油门点位置差异。负值=比最快圈更早，正值=比最快圈更晚。">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700">
              <th className="text-left py-1 pr-2">弯道</th>
              <th className="text-right py-1 pr-2">
                <span className="inline-flex items-center justify-end">
                  刹车速度<InfoTip text="开始刹车时的速度 (km/h)" />
                </span>
              </th>
              <th className="text-right py-1 pr-2">参考刹车速度</th>
              <th className="text-right py-1 pr-2">
                <span className="inline-flex items-center justify-end">
                  油门速度<InfoTip text="开始加速时的速度 (km/h)" />
                </span>
              </th>
              <th className="text-right py-1">参考油门速度</th>
            </tr>
          </thead>
          <tbody>
            {current.corners.map((c) => (
              <tr key={c.cornerName} className="border-b border-gray-800/50 text-gray-400">
                <td className="py-1.5 pr-2 font-medium text-gray-300">{c.cornerName}</td>
                <td className="text-right py-1.5 pr-2">
                  {c.brakePoint ? `${c.brakePoint.speed.toFixed(1)}` : '-'}
                </td>
                <td className="text-right py-1.5 pr-2 text-gray-500">
                  {c.refBrakePoint ? `${c.refBrakePoint.speed.toFixed(1)}` : '-'}
                </td>
                <td className="text-right py-1.5 pr-2">
                  {c.throttlePoint ? `${c.throttlePoint.speed.toFixed(1)}` : '-'}
                </td>
                <td className="text-right py-1.5 text-gray-500">
                  {c.refThrottlePoint ? `${c.refThrottlePoint.speed.toFixed(1)}` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

    </div>
  )
}
