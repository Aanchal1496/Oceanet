import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/AppShell'

const Landing = lazy(() => import('./pages/Landing'))
const Console = lazy(() => import('./pages/Console'))
const FloatDetail = lazy(() => import('./pages/FloatDetail'))
const ComparisonReport = lazy(() => import('./pages/ComparisonReport'))

function PageFallback() {
  return (
    <div className="route-fallback" role="status" aria-label="Loading page">
      <span className="spinner" aria-hidden="true" />
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Landing />} />
          <Route path="/console" element={<Console />} />
          <Route path="/dashboard" element={<Navigate to="/console" replace />} />
          <Route path="/float/:floatId" element={<FloatDetail />} />
          <Route path="/report" element={<ComparisonReport />} />
          <Route path="/reports" element={<Navigate to="/report" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
