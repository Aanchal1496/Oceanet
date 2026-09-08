import { useState } from 'react'

const DEFAULT_CONDITIONS = {
  minDelta: 2.0,
  minObservations: 5,
  recentDays: 7,
}

export default function FindRegionButton({ floatData, onFindRegions }) {
  const [open, setOpen] = useState(false)
  const [conditions, setConditions] = useState(DEFAULT_CONDITIONS)

  const handleFind = () => {
    if (!floatData?.floats) return

    const now = new Date()
    const cutoffMs = conditions.recentDays * 24 * 60 * 60 * 1000

    // Filter floats meeting conditions
    const qualifyingFloats = floatData.floats.filter(f => {
      if (!f.observations?.length) return false

      // Check observation count
      if (f.observations.length < conditions.minObservations) return false

      // Check if observations are within recent days
      const recentObs = f.observations.filter(o => {
        const ts = o.timestamp ? new Date(o.timestamp) : null
        return ts && (now - ts) < cutoffMs
      })
      if (recentObs.length < conditions.minObservations) return false

      // Check delta threshold
      const maxDelta = Math.max(...recentObs.map(o => Math.abs(o.delta || 0)))
      if (maxDelta < conditions.minDelta) return false

      return true
    })

    // Cluster qualifying floats into regions (5° grid cells)
    const regionMap = new Map()
    for (const f of qualifyingFloats) {
      if (f.lat == null || f.lon == null) continue
      const regionKey = `${Math.floor(f.lat / 5) * 5}_${Math.floor(f.lon / 5) * 5}`
      if (!regionMap.has(regionKey)) {
        regionMap.set(regionKey, {
          key: regionKey,
          centerLat: 0,
          centerLon: 0,
          floats: [],
          maxDelta: 0,
          totalAnomalyObs: 0,
        })
      }
      const region = regionMap.get(regionKey)
      region.floats.push(f)

      // Update center
      region.centerLat += f.lat
      region.centerLon += f.lon

      // Track max delta
      const maxDelta = Math.max(...f.observations.map(o => Math.abs(o.delta || 0)))
      if (maxDelta > region.maxDelta) region.maxDelta = maxDelta

      // Count anomaly observations
      region.totalAnomalyObs += f.observations.filter(o => Math.abs(o.delta || 0) >= conditions.minDelta).length
    }

    // Finalize regions
    const regions = Array.from(regionMap.values()).map(r => ({
      ...r,
      centerLat: r.centerLat / r.floats.length,
      centerLon: r.centerLon / r.floats.length,
      label: getRegionLabel(r.centerLat / r.floats.length, r.centerLon / r.floats.length),
    }))

    // Sort by severity (max delta)
    regions.sort((a, b) => b.maxDelta - a.maxDelta)

    onFindRegions(regions)
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute top-14 right-3 z-20 pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-lowest/85 backdrop-blur-md rounded-lg border border-outline-variant/20 shadow-md text-[11px] font-semibold text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
      >
        <span className="material-symbols-outlined text-[14px]">explore</span>
        Find Interesting Region
      </button>

      {open && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-2xl w-[380px] max-w-[90vw]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-bold text-on-surface">Find Interesting Region</h3>
                <p className="text-[11px] text-on-surface-variant mt-0.5">Define conditions to identify anomalous regions</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Conditions */}
            <div className="px-5 py-4 space-y-4">
              {/* Temperature Difference */}
              <div>
                <label className="text-[10px] font-mono text-on-surface-variant/70 uppercase tracking-widest block mb-1.5">
                  Temperature Difference &gt;
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.5}
                    max={5}
                    step={0.5}
                    value={conditions.minDelta}
                    onChange={e => setConditions({ ...conditions, minDelta: parseFloat(e.target.value) })}
                    className="flex-1 accent-secondary h-1"
                  />
                  <span className="text-[13px] font-mono text-secondary font-bold min-w-[40px] text-right">
                    {conditions.minDelta} °C
                  </span>
                </div>
              </div>

              {/* Min Observations */}
              <div>
                <label className="text-[10px] font-mono text-on-surface-variant/70 uppercase tracking-widest block mb-1.5">
                  At Least
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={conditions.minObservations}
                    onChange={e => setConditions({ ...conditions, minObservations: parseInt(e.target.value) })}
                    className="flex-1 accent-primary h-1"
                  />
                  <span className="text-[13px] font-mono text-primary font-bold min-w-[40px] text-right">
                    {conditions.minObservations}
                  </span>
                </div>
              </div>

              {/* Recent Days */}
              <div>
                <label className="text-[10px] font-mono text-on-surface-variant/70 uppercase tracking-widest block mb-1.5">
                  Last
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={30}
                    step={1}
                    value={conditions.recentDays}
                    onChange={e => setConditions({ ...conditions, recentDays: parseInt(e.target.value) })}
                    className="flex-1 accent-on-surface-variant h-1"
                  />
                  <span className="text-[13px] font-mono text-on-surface font-bold min-w-[40px] text-right">
                    {conditions.recentDays} days
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-3 border-t border-outline-variant/20 flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2 text-[12px] font-semibold rounded border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleFind}
                className="flex-1 py-2 text-[12px] font-semibold rounded bg-primary text-on-primary hover:bg-primary-container transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">search</span>
                Find Regions
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function getRegionLabel(lat, lon) {
  // Simple region naming based on Indian Ocean geography
  if (lat > 20 && lon < 70) return 'Arabian Sea (North)'
  if (lat > 20 && lon >= 70) return 'Bay of Bengal (North)'
  if (lat > 10 && lat <= 20 && lon < 75) return 'Arabian Sea (Central)'
  if (lat > 10 && lat <= 20 && lon >= 75) return 'Bay of Bengal (Central)'
  if (lat > 0 && lat <= 10 && lon < 75) return 'Western Indian Ocean'
  if (lat > 0 && lat <= 10 && lon >= 75) return 'Eastern Indian Ocean'
  if (lat <= 0 && lat > -10 && lon < 75) return 'South-West Indian Ocean'
  if (lat <= 0 && lat > -10 && lon >= 75) return 'South-East Indian Ocean'
  if (lat <= -10) return 'Southern Indian Ocean'
  return `Region (${lat.toFixed(0)}°, ${lon.toFixed(0)}°)`
}
