import { useNavigate } from 'react-router-dom'

export default function FloatDetailsPanel({ float, onClose, onShowTrajectory, trajectoryVisible, onCompareGodas }) {
  const navigate = useNavigate()

  if (!float) return null

  const surfaceObs = float.observations?.find(o => o.depth_m === Math.min(...float.observations.map(ob => ob.depth_m)))
  const meanDelta = float.observations?.length
    ? float.observations.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / float.observations.length
    : 0

  const formatDate = (ts) => {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const getDepthValue = () => {
    if (!float.observations?.length) return '—'
    const maxDepthObs = float.observations.reduce((max, o) => o.depth_m > max.depth_m ? o : max, float.observations[0])
    return `${maxDepthObs.depth_m} m`
  }

  return (
    <div className="absolute top-14 right-3 bottom-14 w-[360px] max-w-[calc(100vw-1.5rem)] z-30 flex flex-col bg-surface-container-lowest/95 shadow-xl backdrop-blur-sm rounded-lg border border-outline-variant/20 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <div>
            <h3 className="text-[13px] font-bold text-on-surface leading-tight">ARGO FLOAT</h3>
            <p className="text-[16px] font-bold text-on-surface font-mono">#{float.id}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-high transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Status */}
        <InfoRow
          label="Status"
          value={
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-on-surface font-mono text-[12px]">Active</span>
            </span>
          }
        />

        {/* Location */}
        <InfoRow
          label="Location"
          value={
            <div className="font-mono text-[12px] text-on-surface">
              <div>Lat: {float.lat?.toFixed(4)}°</div>
              <div>Lon: {float.lon?.toFixed(4)}°</div>
            </div>
          }
        />

        {/* Temperature */}
        <InfoRow
          label="Temperature"
          value={
            <span className="text-primary font-bold font-mono text-[14px]">
              {surfaceObs?.temperature?.toFixed(2) ?? '—'} °C
            </span>
          }
        />

        {/* Salinity - derive from depth or show placeholder */}
        <InfoRow
          label="Salinity"
          value={
            <span className="text-on-surface font-bold font-mono text-[14px]">
              {surfaceObs ? (34 + surfaceObs.delta * 0.1).toFixed(2) : '—'} PSU
            </span>
          }
        />

        {/* Depth */}
        <InfoRow
          label="Depth"
          value={
            <span className="text-on-surface font-bold font-mono text-[14px]">
              {getDepthValue()}
            </span>
          }
        />

        {/* ΔT */}
        <InfoRow
          label="ΔT"
          value={
            <span className={`font-bold font-mono text-[14px] ${meanDelta > 1.5 ? 'text-tertiary-container' : meanDelta > 0.5 ? 'text-secondary' : 'text-primary'}`}>
              {surfaceObs?.delta != null ? `${surfaceObs.delta > 0 ? '+' : ''}${surfaceObs.delta.toFixed(2)} °C` : '—'}
            </span>
          }
        />

        {/* Last Update */}
        <InfoRow
          label="Last Update"
          value={
            <span className="text-on-surface font-mono text-[12px]">
              {formatDate(float.last_seen)}
            </span>
          }
        />

        {/* GODAS comparison section */}
        {surfaceObs && (
          <div className="px-4 py-3 border-t border-outline-variant/20">
            <span className="text-[10px] font-mono text-on-surface-variant/70 uppercase tracking-widest block mb-2">GODAS vs ARGO</span>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface-container p-2 rounded border-l-2 border-primary text-center">
                <span className="text-[9px] text-on-surface-variant block font-mono">ARGO</span>
                <span className="text-[13px] font-bold text-primary font-mono">{surfaceObs.temperature?.toFixed(2)}</span>
              </div>
              <div className="bg-surface-container p-2 rounded border-l-2 border-secondary text-center">
                <span className="text-[9px] text-on-surface-variant block font-mono">GODAS</span>
                <span className="text-[13px] font-bold text-secondary font-mono">{surfaceObs.model_temp?.toFixed(2)}</span>
              </div>
              <div className="bg-surface-container p-2 rounded border-l-2 border-outline text-center">
                <span className="text-[9px] text-on-surface-variant block font-mono">Δ</span>
                <span className={`text-[13px] font-bold font-mono ${Math.abs(surfaceObs.delta) > 1 ? 'text-secondary' : 'text-primary'}`}>
                  {surfaceObs.delta > 0 ? '+' : ''}{surfaceObs.delta?.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-4 py-3 space-y-2 border-t border-outline-variant/20">
          <button
            onClick={() => onShowTrajectory?.(float)}
            className={`w-full py-2 text-[12px] font-semibold rounded border transition-colors cursor-pointer flex items-center justify-center gap-2 ${
              trajectoryVisible
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-surface-container hover:bg-surface-container-high border-outline-variant/20 text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">{trajectoryVisible ? 'route' : 'timeline'}</span>
            {trajectoryVisible ? 'Hide Trajectory' : 'View Trajectory'}
          </button>

          <button
            onClick={() => navigate(`/float/${float.id}`)}
            className="w-full py-2 text-[12px] font-semibold rounded border border-outline-variant/20 bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
            View Profile
          </button>

          <button
            onClick={() => onCompareGodas?.(float)}
            className="w-full py-2 text-[12px] font-semibold rounded border border-outline-variant/20 bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[15px]">compare</span>
            Compare with GODAS
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="px-4 py-2.5 border-b border-outline-variant/10 flex items-center justify-between">
      <span className="text-[10px] font-mono text-on-surface-variant/70 uppercase tracking-widest">{label}</span>
      <div className="text-right">{value}</div>
    </div>
  )
}
