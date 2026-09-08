export default function AnomalyToggle({ anomalyMode, onToggle }) {
  return (
    <div className="absolute bottom-16 right-3 z-20">
      <div className="bg-surface-container-lowest/90 backdrop-blur-md rounded-lg border border-outline-variant/20 shadow-md px-3 py-2">
        <span className="text-[10px] font-mono text-on-surface-variant/70 uppercase tracking-widest block mb-1.5">Anomaly Filter</span>
        <div className="flex gap-1">
          <button
            onClick={() => onToggle('all')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
              anomalyMode === 'all'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Show All
          </button>
          <button
            onClick={() => onToggle('anomalies')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
              anomalyMode === 'anomalies'
                ? 'bg-secondary/20 text-secondary border border-secondary/40'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Anomalies Only
          </button>
        </div>
      </div>
    </div>
  )
}
