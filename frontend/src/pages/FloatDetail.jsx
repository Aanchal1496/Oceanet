import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getFloatHistory } from '../services/api'

export default function FloatDetail() {
  const { floatId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    getFloatHistory(floatId)
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [floatId])

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-outline-variant border-t-primary rounded-full animate-spin" />
        <span className="text-sm text-primary font-mono">Loading float data...</span>
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

  if (!data) return null

  const obs = data.observations || []
  const byDepth = {}
  obs.forEach(o => { if (!byDepth[o.depth_m]) byDepth[o.depth_m] = []; byDepth[o.depth_m].push(o) })
  const depths = Object.keys(byDepth).map(Number).sort((a, b) => a - b)

  const meanDelta = obs.length ? (obs.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / obs.length) : 0
  const maxDelta = obs.length ? Math.max(...obs.map(o => Math.abs(o.delta || 0))) : 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="w-full bg-surface-container-lowest border-b border-outline-variant/30 px-6 py-4 shadow-md">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/console')} className="text-on-surface-variant hover:text-on-surface p-1.5 rounded hover:bg-surface-container-high transition-colors cursor-pointer">
              <span className="material-symbols-outlined text-xl">arrow_back</span>
            </button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] rounded uppercase tracking-wider font-mono font-semibold">Float Profile</span>
                <span className="text-on-surface-variant text-[11px] font-mono">•</span>
                <span className="text-on-surface-variant text-[11px] font-mono">{data.first_seen} → {data.last_seen}</span>
              </div>
              <h1 className="text-xl font-bold text-on-surface" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Argo Float #{data.id}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-on-surface-variant">
            <span>{data.lat?.toFixed(3)}°N, {data.lon?.toFixed(3)}°E</span>
            <span>•</span>
            <span>{data.record_count} records</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard label="Mean ΔT (Model-Obs)" value={`${meanDelta.toFixed(2)}°C`} color="primary" status={meanDelta < 0.5 ? 'Good' : meanDelta < 1.5 ? 'Moderate' : 'High'} />
          <KPICard label="Max ΔT" value={`${maxDelta.toFixed(2)}°C`} color={maxDelta > 1.5 ? 'secondary' : 'primary'} status={maxDelta > 1.5 ? 'Outlier' : 'Normal'} />
          <KPICard label="Total Observations" value={obs.length} color="primary" status={`${depths.length} depth tiers`} />
        </div>

        {/* Depth profiles */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {depths.map(depth => (
            <div key={depth} className="bg-surface-container rounded border border-outline-variant/20 shadow-md overflow-hidden">
              <div className="px-4 py-2.5 bg-surface-container-high border-b border-outline-variant/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[16px]">water</span>
                  <span className="text-[13px] font-semibold text-on-surface">Depth: {depth}m</span>
                </div>
                <span className="text-[11px] font-mono text-on-surface-variant">{byDepth[depth].length} records</span>
              </div>
              <div className="p-4">
                {/* Chart */}
                <canvas
                  ref={(canvas) => {
                    if (!canvas) return
                    const ctx = canvas.getContext('2d')
                    const records = byDepth[depth]
                    const w = canvas.width = canvas.clientWidth * 2
                    const h = canvas.height = 200
                    ctx.clearRect(0, 0, w, h)
                    const model = records.map(o => o.model_temp)
                    const observed = records.map(o => o.temperature)
                    const all = [...model, ...observed]
                    if (!all.length) return
                    const min = Math.min(...all) - 0.5, max = Math.max(...all) + 0.5
                    const pL = 10, pR = 10, pT = 10, pB = 20
                    const pW = w - pL - pR, pH = h - pT - pB
                    const count = model.length
                    function toXY(i, v) {
                      return [pL + (count > 1 ? (i / (count - 1)) * pW : pW / 2), pT + (1 - (v - min) / (max - min)) * pH]
                    }
                    function drawLine(arr, color) {
                      if (!arr.length) return
                      ctx.beginPath()
                      arr.forEach((v, i) => { const [x, y] = toXY(i, v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) })
                      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()
                      arr.forEach((v, i) => { const [x, y] = toXY(i, v); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill() })
                    }
                    ctx.strokeStyle = '#16334a'; ctx.lineWidth = 1
                    for (let g = 0; g <= 3; g++) { const y = pT + (g / 3) * pH; ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(w - pR, y); ctx.stroke() }
                    drawLine(model, '#2fb6a8')
                    drawLine(observed, '#f2a65a')
                  }}
                  className="w-full h-[100px] block"
                />
                <div className="flex gap-4 text-[11px] text-on-surface-variant mt-2">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-primary-container mr-1" />Model</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-secondary mr-1" />Observed</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Full observation table */}
        <div className="bg-surface-container rounded border border-outline-variant/20 shadow-md overflow-hidden">
          <div className="px-4 py-2.5 bg-surface-container-high border-b border-outline-variant/20">
            <span className="text-[13px] font-semibold text-on-surface">All Observations</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-[11px] font-mono text-on-surface-variant uppercase border-b border-outline-variant/20">
                  <th className="py-2 px-4">Date</th>
                  <th className="py-2 px-4">Depth (m)</th>
                  <th className="py-2 px-4">Pressure (dbar)</th>
                  <th className="py-2 px-4 text-right">Observed (°C)</th>
                  <th className="py-2 px-4 text-right">Model (°C)</th>
                  <th className="py-2 px-4 text-right">Delta (°C)</th>
                  <th className="py-2 px-4 text-right">Distance (km)</th>
                </tr>
              </thead>
              <tbody className="text-[12px] font-mono divide-y divide-outline-variant/10">
                {obs.map((o, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-surface-container' : 'bg-surface-container-low'}>
                    <td className="py-2 px-4 text-on-surface-variant">{o.date}</td>
                    <td className="py-2 px-4 text-on-surface-variant">{o.depth_m}</td>
                    <td className="py-2 px-4 text-on-surface-variant">{o.pressure_dbar?.toFixed(1)}</td>
                    <td className="py-2 px-4 text-right text-primary font-medium">{o.temperature?.toFixed(2)}</td>
                    <td className="py-2 px-4 text-right text-secondary font-medium">{o.model_temp?.toFixed(2)}</td>
                    <td className={`py-2 px-4 text-right font-medium ${Math.abs(o.delta) > 1 ? 'text-secondary' : 'text-primary'}`}>
                      {o.delta > 0 ? '+' : ''}{o.delta?.toFixed(2)}
                    </td>
                    <td className="py-2 px-4 text-right text-on-surface-variant">{o.distance_km?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function KPICard({ label, value, color, status }) {
  return (
    <div className="bg-surface-container p-4 rounded border border-outline-variant/20 shadow-sm">
      <div className="text-[11px] font-mono text-on-surface-variant mb-2 uppercase">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold font-mono text-${color}`}>{value}</span>
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant/20 text-[11px] text-on-surface-variant font-mono">{status}</div>
    </div>
  )
}
