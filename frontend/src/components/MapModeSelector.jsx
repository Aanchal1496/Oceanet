const MAP_MODES = [
  { label: 'Floats', value: 'floats', icon: 'water' },
  { label: 'Density', value: 'density', icon: 'grid_view' },
  { label: 'Temperature', value: 'temperature', icon: 'thermostat' },
  { label: 'Salinity', value: 'salinity', icon: 'science' },
  { label: 'Anomaly', value: 'anomaly', icon: 'warning' },
  { label: 'Trajectories', value: 'trajectories', icon: 'route' },
]

export default function MapModeSelector({ activeMode, onModeChange }) {
  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center bg-surface-container-lowest/80 backdrop-blur-md p-1 rounded-lg border border-outline-variant/20 shadow-md">
        {MAP_MODES.map(mode => (
          <button
            key={mode.value}
            onClick={() => onModeChange(mode.value)}
            className={`px-2.5 py-1.5 text-[11px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              activeMode === mode.value
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">{mode.icon}</span>
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  )
}
