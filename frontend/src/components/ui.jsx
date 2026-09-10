export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Surface({ as: Component = 'section', className = '', children, ...props }) {
  return <Component className={`surface ${className}`.trim()} {...props}>{children}</Component>
}

export function SectionHeader({ title, description, meta }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {meta && <span className="section-meta">{meta}</span>}
    </div>
  )
}

export function MetricCard({ label, value, detail, tone = 'accent', loading = false }) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <p>{label}</p>
      {loading ? <span className="skeleton skeleton--metric" /> : <strong>{value ?? 'Not loaded'}</strong>}
      <small>{detail}</small>
    </article>
  )
}

export function StatusBadge({ tone = 'neutral', children }) {
  return <span className={`status-badge status-badge--${tone}`}><span aria-hidden="true" />{children}</span>
}

export function LoadingState({ label = 'Loading data' }) {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div><strong>{label}</strong><p>Connecting to the ocean intelligence service.</p></div>
    </div>
  )
}

export function ErrorState({ title = 'Data source unavailable', message, onRetry }) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <span className="material-symbols-outlined" aria-hidden="true">cloud_off</span>
      <div><strong>{title}</strong><p>{message || 'This source could not be reached.'}</p></div>
      {onRetry && <button className="button button--secondary button--compact" onClick={onRetry} type="button">Retry</button>}
    </div>
  )
}

export function EmptyState({ title = 'No data available', message }) {
  return (
    <div className="empty-state">
      <span className="material-symbols-outlined" aria-hidden="true">water_drop</span>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  )
}
