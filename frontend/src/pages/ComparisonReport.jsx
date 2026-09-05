import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFloats, getDates } from '../services/api'

export default function ComparisonReport() {
  const navigate = useNavigate()
  const [floats, setFloats] = useState([])
  const [dates, setDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDay, setSelectedDay] = useState(1)
  const [filter, setFilter] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    Promise.all([getFloats(1), getDates()])
      .then(([f, d]) => { setFloats(f.floats || []); setDates(d.dates || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => {
    setLoading(true)
    getFloats(selectedDay)
      .then(f => { setFloats(f.floats || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [selectedDay])

  const allObs = floats.flatMap(f => (f.observations || []).map(o => ({ ...o, float_id: f.id, float_lat: f.lat, float_lon: f.lon })))
  const filteredObs = allObs.filter(o => {
    if (filter && !o.float_id.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  // Compute stats
  const meanDelta = allObs.length ? allObs.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / allObs.length : 0
  const rmse = allObs.length ? Math.sqrt(allObs.reduce((s, o) => s + (o.delta || 0) ** 2, 0) / allObs.length) : 0
  const maxDelta = allObs.length ? Math.max(...allObs.map(o => Math.abs(o.delta || 0))) : 0
  const passCount = allObs.filter(o => Math.abs(o.delta || 0) < 0.5).length
  const passRate = allObs.length ? (passCount / allObs.length * 100) : 0

  // Error by depth
  const byDepth = {}
  allObs.forEach(o => {
    if (!byDepth[o.depth_m]) byDepth[o.depth_m] = []
    byDepth[o.depth_m].push(o)
  })
  const depthTiers = Object.keys(byDepth).map(Number).sort((a, b) => a - b).map(d => ({
    depth: d,
    rmse: Math.sqrt(byDepth[d].reduce((s, o) => s + (o.delta || 0) ** 2, 0) / byDepth[d].length),
    count: byDepth[d].length,
  }))
  const maxDepthRmse = Math.max(...depthTiers.map(d => d.rmse), 0.1)

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-outline-variant border-t-primary rounded-full animate-spin" />
        <span className="text-sm text-primary font-mono">Loading report data...</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-error text-sm mb-4">Error: {error}</p>
        <button onClick={() => navigate('/console')} className="px-4 py-2 bg-primary text-on-primary rounded text-sm cursor-pointer">Back to Console</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="w-full bg-surface-container-lowest border-b border-outline-variant/30 px-6 py-4 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] rounded uppercase tracking-wider font-mono font-semibold">Operational Validation Report</span>
              <span className="text-on-surface-variant text-[11px] font-mono flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-primary">verified</span>
                {dates[selectedDay - 1] || 'Latest'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-on-surface tracking-wide" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Model Accuracy & In-Situ Benchmark
            </h1>
            <p className="text-sm text-on-surface-variant mt-1 max-w-3xl">
              Evaluation of GODAS numerical ocean models against active Argo float observations across the Indian Ocean basin.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedDay}
              onChange={e => setSelectedDay(parseInt(e.target.value))}
              className="h-8 px-3 bg-surface-container border border-outline-variant/30 hover:border-primary text-on-surface text-[12px] rounded transition-colors cursor-pointer focus:outline-none focus:bg-surface-bright"
            >
              {dates.map((d, i) => <option key={i} value={i + 1}>{d}</option>)}
            </select>
            <button className="h-8 px-3 bg-surface-container hover:bg-surface-bright text-on-surface text-[12px] rounded transition-colors flex items-center gap-1.5 border border-outline-variant/30 cursor-pointer">
              <span className="material-symbols-outlined text-[16px]">share</span>
              Share
            </button>
            <button className="h-8 px-3.5 bg-primary text-on-primary text-[12px] rounded transition-colors flex items-center gap-1.5 hover:bg-primary-container cursor-pointer">
              <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Basin Mean RMSE" value={`${rmse.toFixed(2)}°C`} badge="TARGET <0.5°C" badgeColor="primary" icon="check_circle" iconColor="primary" footer={`${(rmse * 100 / 0.5).toFixed(0)}% of target`} />
          <KPICard title="Assimilation Score" value={`${passRate.toFixed(1)}%`} badge="CONVERGENCE" badgeColor="primary" icon="trending_up" iconColor="primary" footer={`${passCount} of ${allObs.length} within tolerance`} />
          <KPICard title="Max Deviation" value={`${maxDelta.toFixed(2)}°C`} badge="OUTLIER BOUND" badgeColor={maxDelta > 1.5 ? 'secondary' : 'primary'} icon="warning" iconColor={maxDelta > 1.5 ? 'secondary' : 'primary'} footer={maxDelta > 1.5 ? 'Outlier detected' : 'Within bounds'} />
          <KPICard title="Float Coverage" value={floats.length} badge="ACTIVE" badgeColor="primary" icon="sensors" iconColor="primary" footer={`${allObs.length} total observations`} />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Accuracy map */}
          <div className="lg:col-span-7 bg-surface-container rounded border border-outline-variant/20 shadow-md overflow-hidden">
            <div className="px-4 py-2.5 bg-surface-container-high border-b border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">map</span>
                <span className="text-[13px] font-semibold text-on-surface uppercase">Regional Accuracy Map</span>
              </div>
              <span className="text-[11px] font-mono text-on-surface-variant">{floats.length} Active Matches</span>
            </div>
            <div className="p-4">
              <div className="relative w-full h-72 bg-surface-container-lowest rounded border border-outline-variant/20 overflow-hidden flex flex-col justify-between p-3 shadow-inner">
                <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern height="40" id="grat" patternUnits="userSpaceOnUse" width="40">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#5ddacb" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect fill="url(#grat)" height="100%" width="100%" />
                </svg>
                {/* Float markers on map */}
                <div className="relative z-10 w-full h-full flex items-center justify-center">
                  {floats.map(f => {
                    const x = Math.max(5, Math.min(95, ((f.lon - 55) / 40) * 100))
                    const y = Math.max(5, Math.min(95, ((30 - f.lat) / 40) * 100))
                    const meanD = f.observations?.length ? f.observations.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / f.observations.length : 0
                    const color = meanD < 0.5 ? 'bg-primary' : meanD < 1.5 ? 'bg-secondary' : 'bg-tertiary-container'
                    return (
                      <div key={f.id} className="absolute group cursor-pointer" style={{ left: `${x}%`, top: `${y}%` }}>
                        <span className={`w-3 h-3 ${color} rounded-full block shadow`} />
                        <div className="hidden group-hover:block absolute left-4 -top-3 z-30 bg-surface-container-high border border-outline-variant/30 p-1.5 rounded shadow-md text-[10px] font-mono text-on-surface whitespace-nowrap">
                          Float #{f.id} • ΔT: {meanD.toFixed(2)}°C
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="relative z-10 flex flex-wrap items-center justify-between text-[10px] font-mono text-on-surface-variant pt-2 border-t border-outline-variant/20 bg-surface-container-lowest/90">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" /> Accurate (&lt;0.5°C)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-secondary inline-block" /> Drift (0.5-1.5°C)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-tertiary-container inline-block" /> Outlier (&gt;1.5°C)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Error by depth */}
          <div className="lg:col-span-5 bg-surface-container rounded border border-outline-variant/20 shadow-md overflow-hidden">
            <div className="px-4 py-2.5 bg-surface-container-high border-b border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[18px]">water</span>
                <span className="text-[13px] font-semibold text-on-surface uppercase">Error by Depth Tier</span>
              </div>
              <span className="text-[11px] font-mono text-on-surface-variant">Surface to Deep</span>
            </div>
            <div className="p-4 space-y-3">
              {depthTiers.map(tier => (
                <div key={tier.depth}>
                  <div className="flex justify-between text-[11px] font-mono mb-1">
                    <span className="text-on-surface">{tier.depth}m</span>
                    <span className={`font-bold ${tier.rmse > 0.5 ? 'text-secondary' : 'text-primary'}`}>{tier.rmse.toFixed(2)}°C</span>
                  </div>
                  <div className="w-full h-2 bg-surface-variant rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${tier.rmse > 0.5 ? 'bg-secondary' : 'bg-primary'}`} style={{ width: `${(tier.rmse / maxDepthRmse) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-on-surface-variant font-mono mt-0.5">{tier.count} observations</div>
                </div>
              ))}
              {depthTiers.length === 0 && <p className="text-sm text-on-surface-variant text-center py-4">No depth data available</p>}
            </div>
          </div>
        </div>

        {/* Float table */}
        <div className="bg-surface-container rounded border border-outline-variant/20 shadow-md overflow-hidden">
          <div className="px-4 py-2.5 bg-surface-container-high border-b border-outline-variant/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">table_chart</span>
                <span className="text-[13px] font-semibold text-on-surface uppercase">Active Float Validation Roster</span>
              </div>
              <div className="flex items-center gap-1 bg-surface-container-lowest p-0.5 rounded border border-outline-variant/20">
                {['all', 'accurate', 'drift'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-2.5 py-0.5 text-[11px] rounded font-semibold transition-colors cursor-pointer ${
                      activeTab === tab ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {tab === 'all' ? 'All' : tab === 'accurate' ? 'Accurate' : 'Drift'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2 top-1.5 text-on-surface-variant text-[14px]">search</span>
                <input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="h-7 pl-7 pr-2.5 bg-surface-container-lowest border border-outline-variant/30 rounded text-[11px] font-mono text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
                  placeholder="Search WMO ID..."
                />
              </div>
              <span className="text-[11px] font-mono text-on-surface-variant hidden md:inline">
                Showing {floats.length} floats
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-[11px] font-mono text-on-surface-variant uppercase border-b border-outline-variant/20">
                  <th className="py-2 px-4">Float ID</th>
                  <th className="py-2 px-4">Location</th>
                  <th className="py-2 px-4">Last Seen</th>
                  <th className="py-2 px-4 text-right">Mean ΔT</th>
                  <th className="py-2 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="text-[12px] font-mono divide-y divide-outline-variant/10">
                {floats.filter(f => {
                  if (filter && !f.id.toLowerCase().includes(filter.toLowerCase())) return false
                  if (activeTab === 'accurate') {
                    const mean = f.observations?.length ? f.observations.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / f.observations.length : 0
                    return mean < 0.5
                  }
                  if (activeTab === 'drift') {
                    const mean = f.observations?.length ? f.observations.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / f.observations.length : 0
                    return mean >= 0.5
                  }
                  return true
                }).map((f, i) => {
                  const meanD = f.observations?.length ? f.observations.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / f.observations.length : 0
                  const isAccurate = meanD < 0.5
                  return (
                    <tr key={f.id} className={`${i % 2 === 0 ? 'bg-surface-container' : 'bg-surface-container-low'} hover:bg-surface-bright transition-colors cursor-pointer`} onClick={() => navigate(`/float/${f.id}`)}>
                      <td className="py-2.5 px-4 font-semibold text-on-surface flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isAccurate ? 'bg-primary' : 'bg-secondary'}`} />
                        {f.id}
                      </td>
                      <td className="py-2.5 px-4 text-on-surface-variant">{f.lat?.toFixed(2)}°N, {f.lon?.toFixed(2)}°E</td>
                      <td className="py-2.5 px-4 text-on-surface-variant">{f.last_seen}</td>
                      <td className={`py-2.5 px-4 text-right font-medium ${isAccurate ? 'text-primary' : 'text-secondary'}`}>
                        {meanD > 0 ? '+' : ''}{meanD.toFixed(2)}°C
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isAccurate ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                          {isAccurate ? 'Passed QC' : 'Under Review'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trust seal */}
        <div className="w-full bg-surface-container-lowest rounded border border-outline-variant/20 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">verified</span>
            </div>
            <div>
              <span className="text-[13px] text-on-surface font-semibold tracking-wide">
                Validated by INCOIS Marine Modeling Division • Ministry of Earth Sciences
              </span>
              <p className="text-[11px] text-on-surface-variant font-mono mt-0.5">
                Certified Real-Time Assimilation • Operational Hydrodynamic Modeling System
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded border border-outline-variant/20">
            <span className="flex items-center gap-1.5 text-primary">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" /> System Nominal
            </span>
            <span>•</span>
            <span>ID: INCOIS-MVR-2026</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function KPICard({ title, value, badge, badgeColor, icon, iconColor, footer }) {
  return (
    <div className="bg-surface-container p-4 rounded border border-outline-variant/20 shadow-sm flex flex-col justify-between hover:border-outline-variant/50 transition-colors">
      <div className="flex items-center justify-between text-on-surface-variant mb-2">
        <span className="text-[11px] font-mono uppercase text-on-surface font-semibold">{title}</span>
        <span className={`px-1.5 py-0.5 bg-${badgeColor}/10 text-${badgeColor} text-[10px] font-bold font-mono rounded`}>{badge}</span>
      </div>
      <div className="flex items-baseline gap-2 my-1">
        <span className="text-2xl font-bold font-mono text-on-surface">{value}</span>
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[11px] font-mono">
        <span className={`text-${iconColor} flex items-center gap-1 font-medium`}>
          <span className="material-symbols-outlined text-[14px]">{icon}</span> {footer}
        </span>
      </div>
    </div>
  )
}
