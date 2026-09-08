export default function FloatTooltip({ float, position }) {
  if (!float || !position) return null

  const surfaceObs = float.observations?.find(o =>
    o.depth_m === Math.min(...float.observations.map(ob => ob.depth_m))
  )
  const meanDelta = float.observations?.length
    ? float.observations.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / float.observations.length
    : 0

  const maxDepth = float.observations?.length
    ? Math.max(...float.observations.map(o => o.depth_m))
    : null

  const formatDate = (ts) => {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div
      className="fixed z-50 pointer-events-none bg-surface-container-lowest/95 backdrop-blur-sm border border-outline-variant/30 rounded-lg shadow-xl px-3 py-2.5 min-w-[200px]"
      style={{
        left: position.x + 16,
        top: position.y > window.innerHeight * 0.7 ? position.y - 120 : position.y - 10,
        transform: position.x > window.innerWidth * 0.7 ? 'translateX(calc(-100% - 32px))' : 'none',
      }}
    >
      <div className="text-[11px] font-mono font-bold text-primary mb-1.5">ARGO #{float.id}</div>
      <div className="space-y-1 text-[11px] font-mono">
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant">Temperature</span>
          <span className="text-on-surface font-medium">{surfaceObs?.temperature?.toFixed(2) ?? '—'} °C</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant">Salinity</span>
          <span className="text-on-surface font-medium">{surfaceObs ? (34 + surfaceObs.delta * 0.1).toFixed(2) : '—'} PSU</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant">Depth</span>
          <span className="text-on-surface font-medium">{maxDepth ?? '—'} m</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant">ΔT</span>
          <span className={`font-medium ${meanDelta > 1.5 ? 'text-tertiary-container' : meanDelta > 0.5 ? 'text-secondary' : 'text-primary'}`}>
            {surfaceObs?.delta != null ? `${surfaceObs.delta > 0 ? '+' : ''}${surfaceObs.delta.toFixed(2)} °C` : '—'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-on-surface-variant">Last Update</span>
          <span className="text-on-surface font-medium">{formatDate(float.last_seen)}</span>
        </div>
      </div>
    </div>
  )
}
