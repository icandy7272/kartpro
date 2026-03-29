import { useMemo } from 'react'
import type { LapAnalysis } from '../types'

interface CornerTableProps {
  analyses: LapAnalysis[]
  selectedLapIds: number[]
  fastestLapId: number
}

export default function CornerTable({ analyses, selectedLapIds, fastestLapId }: CornerTableProps) {
  const selected = useMemo(
    () => analyses.filter((a) => selectedLapIds.includes(a.lap.id)),
    [analyses, selectedLapIds]
  )

  const fastestAnalysis = useMemo(
    () => analyses.find((a) => a.lap.id === fastestLapId),
    [analyses, fastestLapId]
  )

  if (selected.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500 text-sm">选择一圈查看弯道数据</p>
      </div>
    )
  }

  const corners = selected[0].corners
  if (corners.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500 text-sm">未检测到弯道</p>
      </div>
    )
  }

  return (
    <div className="p-2 overflow-x-auto">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 py-1.5 mb-1">
        弯道性能
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="text-left py-1.5 px-2 font-medium">弯道</th>
            {selected.map((a) => (
              <th key={a.lap.id} colSpan={4} className="text-center py-1.5 px-1 font-medium">
                <span className={a.lap.id === fastestLapId ? 'text-purple-400' : ''}>
                  第 {a.lap.id} 圈
                </span>
              </th>
            ))}
          </tr>
          <tr className="text-gray-600 border-b border-gray-800/50">
            <th className="py-1 px-2" />
            {selected.map((a) => (
              <th key={a.lap.id} className="py-1" colSpan={4}>
                <div className="flex text-[10px]">
                  <span className="flex-1 px-1">入弯<span className="text-gray-700 ml-0.5">km/h</span></span>
                  <span className="flex-1 px-1">最低<span className="text-gray-700 ml-0.5">km/h</span></span>
                  <span className="flex-1 px-1">出弯<span className="text-gray-700 ml-0.5">km/h</span></span>
                  <span className="flex-1 px-1">差值<span className="text-gray-700 ml-0.5">s</span></span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {corners.map((corner, ci) => (
            <tr key={corner.id} className="border-b border-gray-800/30 hover:bg-gray-800/30">
              <td className="py-1.5 px-2 font-medium text-gray-300 whitespace-nowrap">
                {corner.name}
              </td>
              {selected.map((analysis) => {
                const c = analysis.corners[ci]
                if (!c) {
                  return (
                    <td key={analysis.lap.id} colSpan={4} className="py-1.5 text-center text-gray-600">
                      --
                    </td>
                  )
                }

                const bestCorner = fastestAnalysis?.corners[ci]
                const delta = bestCorner ? c.duration - bestCorner.duration : 0
                const deltaColor =
                  Math.abs(delta) < 0.01
                    ? 'text-gray-500'
                    : delta < 0
                    ? 'text-green-400'
                    : 'text-red-400'

                return (
                  <td key={analysis.lap.id} colSpan={4} className="py-1.5">
                    <div className="flex text-[11px] font-mono">
                      <span className="flex-1 px-1 text-gray-300">{c.entrySpeed.toFixed(1)}</span>
                      <span className="flex-1 px-1 text-gray-300">{c.minSpeed.toFixed(1)}</span>
                      <span className="flex-1 px-1 text-gray-300">{c.exitSpeed.toFixed(1)}</span>
                      <span className={`flex-1 px-1 ${deltaColor}`}>
                        {analysis.lap.id === fastestLapId
                          ? '--'
                          : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`}
                      </span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
          {/* Remaining sector: last entry ref line → finish line */}
          <tr className="border-b border-gray-800/30 hover:bg-gray-800/30">
            <td className="py-1.5 px-2 font-medium text-gray-500 whitespace-nowrap italic">
              直道
            </td>
            {selected.map((analysis) => {
              const remaining = analysis.remainingTime ?? 0
              const bestRemaining = fastestAnalysis?.remainingTime ?? 0
              const delta = remaining - bestRemaining
              const deltaColor =
                Math.abs(delta) < 0.01
                  ? 'text-gray-500'
                  : delta < 0
                  ? 'text-green-400'
                  : 'text-red-400'

              return (
                <td key={analysis.lap.id} colSpan={4} className="py-1.5">
                  <div className="flex text-[11px] font-mono">
                    <span className="flex-1 px-1 text-gray-600">--</span>
                    <span className="flex-1 px-1 text-gray-600">--</span>
                    <span className="flex-1 px-1 text-gray-600">--</span>
                    <span className={`flex-1 px-1 ${deltaColor}`}>
                      {analysis.lap.id === fastestLapId
                        ? '--'
                        : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`}
                    </span>
                  </div>
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
