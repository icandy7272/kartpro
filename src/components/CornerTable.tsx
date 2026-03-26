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
        <p className="text-gray-500 text-sm">Select a lap to view corner data</p>
      </div>
    )
  }

  const corners = selected[0].corners
  if (corners.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500 text-sm">No corners detected</p>
      </div>
    )
  }

  return (
    <div className="p-2 overflow-x-auto">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 py-1.5 mb-1">
        Corner Performance
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            <th className="text-left py-1.5 px-2 font-medium">Corner</th>
            {selected.map((a) => (
              <th key={a.lap.id} colSpan={4} className="text-center py-1.5 px-1 font-medium">
                <span className={a.lap.id === fastestLapId ? 'text-purple-400' : ''}>
                  Lap {a.lap.id}
                </span>
              </th>
            ))}
          </tr>
          <tr className="text-gray-600 border-b border-gray-800/50">
            <th className="py-1 px-2" />
            {selected.map((a) => (
              <th key={a.lap.id} className="py-1" colSpan={4}>
                <div className="flex text-[10px]">
                  <span className="flex-1 px-1">Entry</span>
                  <span className="flex-1 px-1">Min</span>
                  <span className="flex-1 px-1">Exit</span>
                  <span className="flex-1 px-1">Delta</span>
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
                      <span className="flex-1 px-1 text-gray-300">{c.entrySpeed.toFixed(0)}</span>
                      <span className="flex-1 px-1 text-gray-300">{c.minSpeed.toFixed(0)}</span>
                      <span className="flex-1 px-1 text-gray-300">{c.exitSpeed.toFixed(0)}</span>
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
        </tbody>
      </table>
    </div>
  )
}
