import { useState } from 'react'
import type { SatelliteCalibrationDirection, SatelliteCalibrationMeters } from '../../lib/map/satellite-calibration'
import SatelliteCalibrationPad from './SatelliteCalibrationPad'

interface SatelliteCalibrationControlProps {
  calibration: SatelliteCalibrationMeters
  onAdjust: (direction: SatelliteCalibrationDirection) => void
  onReset: () => void
}

export default function SatelliteCalibrationControl({
  calibration,
  onAdjust,
  onReset,
}: SatelliteCalibrationControlProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        aria-expanded={isExpanded}
        aria-label={isExpanded ? '收起卫星微调' : '展开卫星微调'}
        className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-100 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900/90"
        onClick={() => setIsExpanded((current) => !current)}
        type="button"
      >
        卫星微调 {isExpanded ? '收起' : '展开'}
      </button>

      {isExpanded && (
        <SatelliteCalibrationPad
          calibration={calibration}
          onAdjust={onAdjust}
          onReset={onReset}
        />
      )}
    </div>
  )
}
