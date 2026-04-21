import type { SatelliteCalibrationDirection, SatelliteCalibrationMeters } from '../../lib/map/satellite-calibration'

interface SatelliteCalibrationPadProps {
  calibration: SatelliteCalibrationMeters
  onAdjust: (direction: SatelliteCalibrationDirection) => void
  onReset: () => void
}

function formatSignedMeters(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}m`
}

export default function SatelliteCalibrationPad({
  calibration,
  onAdjust,
  onReset,
}: SatelliteCalibrationPadProps) {
  return (
    <div
      aria-label="卫星微调"
      className="rounded-xl border border-white/10 bg-slate-950/80 p-2 text-slate-100 shadow-lg backdrop-blur-sm"
    >
      <div className="text-[10px] font-semibold tracking-wide text-slate-300">卫星微调</div>
      <div className="mt-1 text-[10px] text-slate-400">
        北 {formatSignedMeters(calibration.northMeters)} / 东 {formatSignedMeters(calibration.eastMeters)}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1">
        <div />
        <button
          aria-label="向北微调"
          className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/15"
          onClick={() => onAdjust('north')}
          type="button"
        >
          ↑
        </button>
        <div />

        <button
          aria-label="向西微调"
          className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/15"
          onClick={() => onAdjust('west')}
          type="button"
        >
          ←
        </button>
        <button
          aria-label="重置卫星校准"
          className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold hover:bg-white/15"
          onClick={onReset}
          type="button"
        >
          重置
        </button>
        <button
          aria-label="向东微调"
          className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/15"
          onClick={() => onAdjust('east')}
          type="button"
        >
          →
        </button>

        <div />
        <button
          aria-label="向南微调"
          className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/15"
          onClick={() => onAdjust('south')}
          type="button"
        >
          ↓
        </button>
        <div />
      </div>
    </div>
  )
}
