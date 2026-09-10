export default function RegionResults({ regions, onFlyTo, onClose }) {
  if (!regions?.length) return null

  return (
    <div className="absolute top-14 right-3 z-20 pointer-events-auto w-[320px] max-h-[70vh] bg-surface-container-lowest/90 backdrop-blur-md rounded-xl border border-outline-variant/30 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-bold text-on-surface">
            Interesting Regions Found
          </h3>
          <p className="text-[10px] text-on-surface-variant mt-0.5">
            {regions.length} region{regions.length !== 1 ? 's' : ''} detected
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-high transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Region list */}
      <div className="overflow-y-auto flex-1 divide-y divide-outline-variant/15">
        {regions.map((region) => (
          <div
            key={region.key}
            className="px-4 py-3 hover:bg-surface-container-high transition-colors cursor-pointer group"
            onClick={() => onFlyTo(region.centerLat, region.centerLon)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-on-surface truncate">
                  {region.label}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-0.5 font-mono">
                  {region.floats.length} float{region.floats.length !== 1 ? 's' : ''} &middot;{' '}
                  {region.centerLat.toFixed(1)}°, {region.centerLon.toFixed(1)}°
                </div>
              </div>
              <div className="text-right ml-2 shrink-0">
                <div className="text-[14px] font-bold font-mono text-error">
                  &plusmn;{region.maxDelta.toFixed(1)}°C
                </div>
                <div className="text-[9px] text-on-surface-variant font-mono">
                  {region.totalAnomalyObs} anom. obs
                </div>
              </div>
            </div>

            {/* Fly to button (visible on hover) */}
            <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-[12px] text-primary">flight</span>
              <span className="text-[10px] font-semibold text-primary">Click to fly to region</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
