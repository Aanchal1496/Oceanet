import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getFloatHistory } from '../services/api'
import { ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui'

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
    <div className="page-container">
      <LoadingState label="Loading float profile" />
    </div>
  )

  if (error) return (
    <div className="page-container">
      <ErrorState title="Float profile unavailable" message={error} onRetry={() => window.location.reload()} />
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
    <div className="page-container">
      <PageHeader
        eyebrow="Argo observation profile"
        title={`Float ${data.id}`}
        description={`${data.lat?.toFixed(3)}°, ${data.lon?.toFixed(3)}° · ${data.record_count} records · ${data.first_seen} to ${data.last_seen}`}
        actions={(
          <>
            <StatusBadge tone={meanDelta < .5 ? 'success' : meanDelta < 1.5 ? 'warning' : 'danger'}>
              Mean |ΔT| {meanDelta.toFixed(2)}°C
            </StatusBadge>
            <button type="button" onClick={() => navigate('/console')} className="button button--secondary button--compact">
              <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
              Back to console
            </button>
          </>
        )}
      />
      <div className="space-y-6">
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
                      arr.forEach((v, i) => {
                        const [x, y] = toXY(i, v)
                        if (i === 0) ctx.moveTo(x, y)
                        else ctx.lineTo(x, y)
                      })
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
  const colorClass = color === 'secondary' ? 'text-secondary' : 'text-primary'
  return (
    <div className="bg-surface-container p-4 rounded border border-outline-variant/20 shadow-sm">
      <div className="text-[11px] font-mono text-on-surface-variant mb-2 uppercase">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold font-mono ${colorClass}`}>{value}</span>
      </div>
      <div className="mt-2 pt-2 border-t border-outline-variant/20 text-[11px] text-on-surface-variant font-mono">{status}</div>
    </div>
  )
}
