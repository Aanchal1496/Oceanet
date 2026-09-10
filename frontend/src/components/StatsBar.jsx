export default function StatsBar({ floatData }) {
  if (!floatData?.floats) return null

  const allFloats = floatData.floats
  const totalCount = allFloats.length

  // Compute stats from all floats
  let activeCount = 0
  const regions = new Set()

  for (const f of allFloats) {
    // Active: has observations and last_seen within 7 days
    const lastSeen = f.last_seen ? new Date(f.last_seen) : null
    const now = new Date()
    const isRecent = lastSeen && (now - lastSeen) < 7 * 24 * 60 * 60 * 1000
    if (f.observations?.length > 0 && isRecent) activeCount++

    // Region: quantize lat/lon into 5° grid cells
    if (f.lat != null && f.lon != null) {
      const regionKey = `${Math.floor(f.lat / 5) * 5}_${Math.floor(f.lon / 5) * 5}`
      regions.add(regionKey)
    }
  }

  const stats = [
    { label: 'ARGO Floats', value: totalCount, color: 'text-primary' },
    { label: 'Active', value: activeCount, color: 'text-primary-container' },
    { label: 'Regions', value: regions.size, color: 'text-on-surface-variant' },
  ]

  return (
    <div className="absolute top-24 md:top-14 left-3 z-20 pointer-events-auto">
      <div className="bg-surface-container-lowest/85 backdrop-blur-md rounded-lg border border-outline-variant/20 shadow-md px-3 py-2.5">
        <div className="flex items-center gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center min-w-[60px]">
              <div className={`text-[16px] font-bold font-mono ${stat.color}`}>
                {stat.value.toLocaleString()}
              </div>
              <div className="text-[9px] font-mono text-on-surface-variant/70 uppercase tracking-wider">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
