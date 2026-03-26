import { useState, useMemo } from 'react'
import type { TrainingSession, AIConfig } from '../types'
import TrackMap from './TrackMap'
import LapList from './LapList'
import SpeedChart from './SpeedChart'
import CornerTable from './CornerTable'
import AICoach from './AICoach'

interface LayoutProps {
  session: TrainingSession
  aiConfig: AIConfig | null
  onAiConfigChange: (config: AIConfig | null) => void
  onNewSession: () => void
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`
}

export default function Layout({ session, aiConfig, onAiConfigChange, onNewSession }: LayoutProps) {
  const fastestLap = useMemo(
    () => session.laps.reduce((best, lap) => (lap.duration < best.duration ? lap : best), session.laps[0]),
    [session.laps]
  )

  const [selectedLapIds, setSelectedLapIds] = useState<number[]>([fastestLap.id])

  const allCorners = useMemo(() => {
    const fastest = session.analyses.find((a) => a.lap.id === fastestLap.id)
    return fastest?.corners ?? []
  }, [session.analyses, fastestLap.id])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-bold text-purple-400">KartPro</h1>
          <div className="h-5 w-px bg-gray-700" />
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>{session.filename}</span>
            <span>{session.date.toLocaleDateString()}</span>
            <span>{session.laps.length} laps</span>
            <span className="text-purple-400 font-medium">
              Best: {formatTime(fastestLap.duration)}
            </span>
          </div>
        </div>
        <button
          onClick={onNewSession}
          className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          New Session
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel (60%) */}
        <div className="w-3/5 flex flex-col overflow-hidden border-r border-gray-800">
          {/* Map */}
          <div className="h-1/2 p-3 pb-1.5">
            <div className="h-full rounded-lg overflow-hidden border border-gray-800">
              <TrackMap
                laps={session.laps}
                selectedLapIds={selectedLapIds}
                corners={allCorners}
                fastestLapId={fastestLap.id}
              />
            </div>
          </div>

          {/* Bottom section: LapList + Charts */}
          <div className="h-1/2 flex overflow-hidden p-3 pt-1.5 gap-3">
            {/* Lap list */}
            <div className="w-1/3 overflow-y-auto bg-gray-900 rounded-lg border border-gray-800">
              <LapList
                laps={session.laps}
                fastestLapId={fastestLap.id}
                selectedLapIds={selectedLapIds}
                onSelectionChange={setSelectedLapIds}
              />
            </div>

            {/* Charts */}
            <div className="w-2/3 flex flex-col gap-3 overflow-hidden">
              <div className="flex-1 bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                <SpeedChart
                  analyses={session.analyses}
                  selectedLapIds={selectedLapIds}
                />
              </div>
              <div className="flex-1 bg-gray-900 rounded-lg border border-gray-800 overflow-y-auto">
                <CornerTable
                  analyses={session.analyses}
                  selectedLapIds={selectedLapIds}
                  fastestLapId={fastestLap.id}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right panel (40%) */}
        <div className="w-2/5 overflow-hidden">
          <AICoach
            analyses={session.analyses}
            aiConfig={aiConfig}
            onConfigChange={onAiConfigChange}
          />
        </div>
      </div>
    </div>
  )
}
