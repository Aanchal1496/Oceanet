import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

const navGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Home', icon: 'home' },
      { to: '/console', label: 'Ocean Console', icon: 'radar' },
    ],
  },
  {
    label: 'Research',
    items: [
      { to: '/report', label: 'Validation Report', icon: 'analytics' },
    ],
  },
]

const routeMeta = {
  '/console': { eyebrow: 'Operations', title: 'Ocean State Console' },
  '/report': { eyebrow: 'Research', title: 'Model Validation' },
}

function Brand() {
  return (
    <NavLink to="/" className="brand-lockup" aria-label="OCEANet home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        <strong>OCEANet</strong>
        <small>Nerexis Intelligence</small>
      </span>
    </NavLink>
  )
}

function Sidebar({ mobile = false, onNavigate }) {
  return (
    <aside className={mobile ? 'mobile-sidebar' : 'app-sidebar'} aria-label="Primary navigation">
      <div className="sidebar-brand-row">
        <Brand />
        {mobile && (
          <button className="icon-button" type="button" onClick={onNavigate} aria-label="Close navigation">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        {navGroups.map((group) => (
          <section key={group.label} className="sidebar-section" aria-labelledby={`nav-${group.label.toLowerCase()}`}>
            <h2 id={`nav-${group.label.toLowerCase()}`}>{group.label}</h2>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}
              >
                <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </section>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="system-chip">
          <span className="status-dot status-dot--nominal" aria-hidden="true" />
          <span>
            <strong>Indian Ocean</strong>
            <small>Operational domain</small>
          </span>
        </div>
        <p>GODAS model validation<br />with Argo observations</p>
      </div>
    </aside>
  )
}

export default function AppShell() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const drawerRef = useRef(null)
  const isHome = location.pathname === '/'
  const isConsole = location.pathname === '/console'
  const meta = location.pathname.startsWith('/float/')
    ? { eyebrow: 'Observation profile', title: 'Argo Float' }
    : routeMeta[location.pathname] || { eyebrow: 'OCEANet', title: 'Marine Intelligence' }

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const drawer = drawerRef.current
    const focusable = drawer?.querySelectorAll('a[href], button:not([disabled])') || []
    focusable[0]?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
        return
      }
      if (event.key !== 'Tab' || !focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  if (isHome) {
    return (
      <div className="site-shell">
        <header className="site-header">
          <Brand />
          <nav aria-label="Homepage navigation">
            <NavLink to="/console">Console</NavLink>
            <NavLink to="/report">Validation</NavLink>
          </nav>
          <NavLink className="button button--primary button--compact" to="/console">Open console</NavLink>
        </header>
        <Outlet />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-frame">
        <header className="topbar">
          <button
            ref={menuButtonRef}
            className="icon-button topbar-menu"
            type="button"
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen(true)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">menu</span>
          </button>
          <div className="topbar-title">
            <span>{meta.eyebrow}</span>
            <strong>{meta.title}</strong>
          </div>
          <div className="topbar-context" aria-label="System status">
            <span className="status-dot status-dot--nominal" aria-hidden="true" />
            <span>System nominal</span>
          </div>
        </header>
        <main className={isConsole ? 'app-main app-main--console' : 'app-main'}>
          <Outlet />
        </main>
      </div>

      {menuOpen && (
        <div className="mobile-nav-layer" role="presentation">
          <button className="mobile-nav-backdrop" type="button" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />
          <div ref={drawerRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Mobile navigation">
            <Sidebar mobile onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}

