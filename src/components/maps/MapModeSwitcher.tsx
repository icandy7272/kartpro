import { MAP_MODE_META, MAP_MODE_ORDER, type MapMode } from '../../lib/map/map-modes'

interface MapModeSwitcherProps {
  onChange: (mode: MapMode) => void
  value: MapMode
}

export default function MapModeSwitcher({ onChange, value }: MapModeSwitcherProps) {
  return (
    <div
      aria-label="地图模式"
      className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/80 p-1 shadow-lg backdrop-blur-sm"
      role="group"
    >
      {MAP_MODE_ORDER.map((mode) => {
        const meta = MAP_MODE_META[mode]
        const isActive = value === mode

        return (
          <button
            key={mode}
            aria-label={meta.label}
            aria-pressed={isActive}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-200 hover:bg-white/10'
            }`}
            onClick={() => onChange(mode)}
            title={meta.description}
            type="button"
          >
            {meta.shortLabel}
          </button>
        )
      })}
    </div>
  )
}
