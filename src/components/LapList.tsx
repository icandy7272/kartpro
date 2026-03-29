import { useCallback } from 'react'
import type { Lap } from '../types'
import { getLapColor } from '../lib/lap-colors'

interface LapListProps {
  laps: Lap[]
  fastestLapId: number
  selectedLapIds: number[]
  onSelectionChange: (ids: number[]) => void
  onCompare?: (lap1Id: number, lap2Id: number) => void
  compact?: boolean
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${delta.toFixed(3)}`
}

export default function LapList({ laps, fastestLapId, selectedLapIds, onSelectionChange, onCompare, compact }: LapListProps) {
  const fastestLap = laps.find((l) => l.id === fastestLapId)
  const fastestTime = fastestLap?.duration ?? 0

  const handleToggle = useCallback(
    (lapId: number) => {
      if (selectedLapIds.includes(lapId)) {
        if (selectedLapIds.length > 1) {
          onSelectionChange(selectedLapIds.filter((id) => id !== lapId))
        }
      } else {
        onSelectionChange([...selectedLapIds, lapId])
      }
    },
    [selectedLapIds, onSelectionChange]
  )

  if (laps.length === 0) {
    return <div className="p-2 text-center text-gray-500 text-xs">无圈数</div>
  }

  return (
    <div className={compact ? 'p-1' : 'p-2'}>
      {!compact && (
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5">圈列表</h3>
      )}
      <div className="space-y-px">
        {laps.map((lap) => {
          const isSelected = selectedLapIds.includes(lap.id)
          const isFastest = lap.id === fastestLapId
          const delta = lap.duration - fastestTime

          return (
            <button
              key={lap.id}
              onClick={() => handleToggle(lap.id)}
              className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors ${
                isSelected
                  ? 'bg-purple-500/20 text-gray-100'
                  : 'hover:bg-gray-800 text-gray-400'
              }`}
            >
              <div
                className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                  isSelected ? 'border-transparent' : 'border-gray-600'
                }`}
                style={isSelected ? { backgroundColor: getLapColor(lap.id, selectedLapIds, fastestLapId) } : undefined}
              >
                {isSelected && (
                  <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              <span className={`text-[11px] shrink-0 ${isFastest ? 'text-purple-400 font-bold' : 'font-medium'}`}>
                {lap.id}
              </span>
              <span className="text-[10px] font-mono text-gray-400 flex-1">{formatTime(lap.duration)}</span>
              {!isFastest && (
                <span className="text-[10px] font-mono text-red-400/70 shrink-0">{formatDelta(delta)}</span>
              )}
              {isFastest && (
                <span className="text-[9px] text-purple-400 shrink-0">★</span>
              )}
            </button>
          )
        })}
      </div>
      {onCompare && selectedLapIds.length === 2 && (
        <div className="px-1 py-1.5 border-t border-gray-800 mt-1">
          <button
            onClick={() => onCompare(selectedLapIds[0], selectedLapIds[1])}
            className="w-full px-2 py-1 text-[10px] font-medium bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
          >
            对比分析
          </button>
        </div>
      )}
    </div>
  )
}
