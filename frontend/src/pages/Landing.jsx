import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrents, getDates, getFloats, getHealth } from '../services/api'
import { ErrorState, MetricCard, SectionHeader, StatusBadge, Surface } from '../components/ui'

const capabilities = [
  {
    icon: 'layers',
    title: 'Water-column analysis',
    description: 'Inspect model temperature fields through depth with an interactive Three.js layer view.',
    meta: 'GODAS grid',
  },
  {
    icon: 'public',
    title: 'Geospatial validation',
    description: 'Compare model output with Argo observations across the Indian Ocean operational domain.',
    meta: 'Cesium globe',
  },
  {
    icon: 'query_stats',
    title: 'Accuracy intelligence',
    description: 'Review error by float, depth tier and observation without changing the underlying science.',
    meta: 'Model vs observation',
  },
]

export default function Landing() {
  const [state, setState] = useState({ status: 'loading', dates: [], floats: null, currents: null, health: null, error: null })
  const [layer, setLayer] = useState('observations')

  const load = async () => {
    setState((previous) => ({ ...previous, status: 'loading', error: null }))
    try {
      const [dateData, floatData, currentData, healthData] = await Promise.all([
        getDates(), getFloats(1), getCurrents(1), getHealth(),
      ])
      setState({ status: 'ready', dates: dateData.dates || [], floats: floatData, currents: currentData, health: healthData, error: null })
    } catch (error) {
      setState({ status: 'error', dates: [], floats: null, currents: null, health: null, error: error.message })
    }
  }

  useEffect(() => { load() }, [])

  const observationCount = useMemo(() => (
    state.floats?.floats?.reduce((sum, item) => sum + (item.observations?.length || 0), 0)
  ), [state.floats])

  const latestDate = state.dates.at(-1)
  const ready = state.status === 'ready'

  return (
    <main className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <StatusBadge tone={ready ? 'success' : state.status === 'error' ? 'danger' : 'neutral'}>
            {ready ? 'Ocean service connected' : state.status === 'error' ? 'Data service delayed' : 'Connecting to sources'}
          </StatusBadge>
          <h1 id="home-title">Ocean intelligence, grounded in observation.</h1>
          <p>
            OCEANet brings model fields, Argo float records and current-vector context into one focused command surface for Indian Ocean forecast validation.
          </p>
          <div className="home-hero-actions">
            <Link className="button button--primary" to="/console">
              Open ocean console
              <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
            </Link>
            <Link className="button button--secondary" to="/report">View validation report</Link>
          </div>
          <dl className="hero-source-list">
            <div><dt>Model</dt><dd>GODAS</dd></div>
            <div><dt>Observations</dt><dd>Argo floats</dd></div>
            <div><dt>Domain</dt><dd>Indian Ocean</dd></div>
          </dl>
        </div>

        <OceanPreview state={state} layer={layer} setLayer={setLayer} />
      </section>

      <section className="home-section home-intelligence" aria-labelledby="intelligence-title">
        <div className="home-section-heading">
          <p className="eyebrow">Current platform view</p>
          <h2 id="intelligence-title">Live intelligence strip</h2>
        </div>
        <div className="metric-grid">
          <MetricCard label="Argo floats" value={ready ? state.floats?.float_count : null} detail="Loaded for the selected model day" loading={state.status === 'loading'} />
          <MetricCard label="Observations" value={ready ? observationCount : null} detail="Temperature comparisons available" loading={state.status === 'loading'} />
          <MetricCard label="Available days" value={ready ? state.dates.length : null} detail={latestDate ? `Latest cache date ${formatApiDate(latestDate)}` : 'Date range not loaded'} loading={state.status === 'loading'} tone="neutral" />
          <MetricCard label="System state" value={ready ? (state.health?.status === 'ok' ? 'Nominal' : 'Delayed') : null} detail={ready ? (state.health?.db_exists ? 'Local cache available' : 'Cache unavailable') : 'Service state not loaded'} loading={state.status === 'loading'} tone={ready ? 'accent' : 'warning'} />
        </div>
        {state.status === 'error' && <ErrorState message={state.error} onRetry={load} />}
      </section>

      <section className="home-section" aria-labelledby="capabilities-title">
        <div className="home-section-heading home-section-heading--split">
          <div>
            <p className="eyebrow">Built for research operations</p>
            <h2 id="capabilities-title">From basin overview to a single observation.</h2>
          </div>
          <p>Purpose-built workflows keep spatial context, scientific provenance and validation error visible without turning the interface into decoration.</p>
        </div>
        <div className="capability-grid">
          {capabilities.map((capability) => (
            <Surface as="article" key={capability.title} className="capability-card">
              <span className="material-symbols-outlined" aria-hidden="true">{capability.icon}</span>
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
              <small>{capability.meta}</small>
            </Surface>
          ))}
        </div>
      </section>

      <section className="home-section home-action" aria-labelledby="action-title">
        <div>
          <p className="eyebrow">Operational workspace</p>
          <h2 id="action-title">Explore the basin. Verify the model.</h2>
          <p>Open the console to move through depth, time and current context, or review the validation evidence directly.</p>
        </div>
        <Link className="button button--primary" to="/console">Enter the console</Link>
      </section>

      <footer className="home-footer">
        <span>OCEANet / Nerexis</span>
        <span>GODAS model data with Argo observation validation</span>
      </footer>
    </main>
  )
}

function OceanPreview({ state, layer, setLayer }) {
  const floats = state.floats?.floats || []
  const currents = state.currents?.currents || []
  const isCurrentLayer = layer === 'currents'

  return (
    <Surface className="ocean-preview" aria-label="Indian Ocean intelligence preview">
      <SectionHeader
        title="Indian Ocean overview"
        description={isCurrentLayer ? 'Directional model-demo vectors from the current endpoint' : 'Argo observation positions for the loaded day'}
        meta={state.floats?.date ? formatApiDate(state.floats.date) : 'Awaiting timestamp'}
      />
      <div className="preview-controls" aria-label="Preview layers">
        <button type="button" aria-pressed={!isCurrentLayer} onClick={() => setLayer('observations')} className={!isCurrentLayer ? 'is-active' : ''}>Observations</button>
        <button type="button" aria-pressed={isCurrentLayer} onClick={() => setLayer('currents')} className={isCurrentLayer ? 'is-active' : ''}>Current vectors</button>
      </div>
      <div className="preview-map" data-testid="home-map-preview">
        <svg viewBox="0 0 760 450" role="img" aria-label={isCurrentLayer ? 'Model-demo current vectors across the Indian Ocean' : 'Argo float locations across the Indian Ocean'}>
          <defs>
            <pattern id="ocean-grid" width="38" height="38" patternUnits="userSpaceOnUse">
              <path d="M 38 0 L 0 0 0 38" fill="none" stroke="rgba(121,169,186,.12)" strokeWidth="1" />
            </pattern>
            <radialGradient id="ocean-light" cx="70%" cy="18%">
              <stop offset="0" stopColor="#174a5d" stopOpacity=".5" />
              <stop offset="1" stopColor="#07131e" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="760" height="450" fill="#07131e" />
          <rect width="760" height="450" fill="url(#ocean-light)" />
          <rect width="760" height="450" fill="url(#ocean-grid)" />
          <path className="map-land" d="M0 52 L86 45 132 77 123 129 156 181 128 257 93 301 52 450 0 450ZM173 0 520 0 507 58 474 104 438 94 419 138 397 120 376 75 329 53 278 64 230 44ZM518 0 760 0 760 175 704 183 648 151 614 116 555 89Z" />
          <path className="map-land" d="M178 266 C205 250 232 270 226 319 C219 373 189 411 164 389 C149 358 158 293 178 266ZM502 173 C518 164 533 178 530 202 C525 224 506 227 497 209 C491 195 493 181 502 173Z" />
          {state.status === 'ready' && !isCurrentLayer && floats.map((item) => {
            const [x, y] = project(item.lon, item.lat)
            const mean = item.observations?.length ? item.observations.reduce((sum, observation) => sum + Math.abs(observation.delta || 0), 0) / item.observations.length : null
            return <circle key={item.id} cx={x} cy={y} r="4.5" className={mean !== null && mean >= .5 ? 'map-point map-point--warning' : 'map-point'}><title>{`Argo ${item.id}: ${mean === null ? 'No error value' : `mean absolute delta ${mean.toFixed(2)} °C`}`}</title></circle>
          })}
          {state.status === 'ready' && isCurrentLayer && currents.filter((_, index) => index % 3 === 0).map((item, index) => {
            const [x, y] = project(item.lon, item.lat)
            const length = 8 + Math.min(13, (item.speed || 0) * 14)
            const radians = ((item.direction || 0) - 90) * Math.PI / 180
            const x2 = x + Math.cos(radians) * length
            const y2 = y + Math.sin(radians) * length
            return <g key={`${item.lon}-${item.lat}-${index}`} className="map-vector"><line x1={x} y1={y} x2={x2} y2={y2} /><circle cx={x2} cy={y2} r="1.8" /><title>{`${item.speed?.toFixed(2) ?? '—'} m/s, ${item.direction?.toFixed(0) ?? '—'}°, ${item.lat}°, ${item.lon}°`}</title></g>
          })}
        </svg>
        {state.status === 'loading' && <div className="preview-overlay"><span className="spinner" /><strong>Loading ocean context</strong></div>}
        {state.status === 'error' && <div className="preview-overlay preview-overlay--error"><span className="material-symbols-outlined">cloud_off</span><strong>Preview source unavailable</strong><small>Open the console after the API reconnects.</small></div>}
        <div className="preview-coordinate">40°E–110°E · 30°S–30°N</div>
      </div>
      <div className="preview-footer">
        <span><i className={isCurrentLayer ? 'legend-line' : 'legend-dot'} />{isCurrentLayer ? 'Direction and relative speed' : 'Loaded observation position'}</span>
        <span>Source: {isCurrentLayer ? state.currents?.source || 'not loaded' : 'Argo / GODAS comparison'}</span>
      </div>
    </Surface>
  )
}

function project(lon, lat) {
  const x = 28 + ((lon - 40) / 70) * 704
  const y = 28 + ((30 - lat) / 60) * 394
  return [Math.max(28, Math.min(732, x)), Math.max(28, Math.min(422, y))]
}

function formatApiDate(value) {
  if (!value) return 'Unavailable'
  if (/^\d{8}$/.test(value)) return `${value.slice(6, 8)} ${value.slice(4, 6)} ${value.slice(0, 4)}`
  return value
}
