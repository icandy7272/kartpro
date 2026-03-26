import { useCallback } from 'react'
import type { Lap } from '../types'

interface LapListProps {
  laps: Lap[]
  fastestLapId: number
  selectedLapIds: number[]
  onSelectionChange: (ids: number[]) => void
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

export default function LapList({ laps, fastestLapId, selectedLapIds, onSelectionChange }: LapListProps) {
  const fastestLap = laps.find((l) => l.id === fastestLapId)
  const fastestTime = fastestLap?.duration ?? 0

  const handleToggle = useCallback(
    (lapId: number) => {
      if (selectedLapIds.includes(lapId)) {
        // Don't allow deselecting the last one
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
    return (
      <div className="p-4 text-center">
        <p className="text-gray-500 text-sm">No laps detected</p>
      </div>
    )
  }

  return (
    <div className="p-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5">
        Laps
      </h3>
      <div className="space-y-0.5">
        {laps.map((lap) => {
          const isSelected = selectedLapIds.includes(lap.id)
          const isFastest = lap.id === fastestLapId
          const delta = lap.duration - fastestTime

          return (
            <button
              key={lap.id}
              onClick={() => handleToggle(lap.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${
                isSelected
                  ? 'bg-purple-500/20 text-gray-100'
                  : 'hover:bg-gray-800 text-gray-400'
              }`}
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-purple-600 border-purple-500' : 'border-gray-600'
                }`}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${isFastest ? 'text-purple-400' : ''}`}>
                    Lap {lap.id}
                  </span>
                  {isFastest && (
                    <span className="text-[10px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded font-medium">
                      FASTEST
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono">{formatTime(lap.duration)}</span>
                  {!isFastest && (
                    <span className="text-red-400 font-mono">{formatDelta(delta)}</span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
