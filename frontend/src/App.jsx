import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Console from './pages/Console'
import FloatDetail from './pages/FloatDetail'
import ComparisonReport from './pages/ComparisonReport'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/console" element={<Console />} />
      <Route path="/float/:floatId" element={<FloatDetail />} />
      <Route path="/report" element={<ComparisonReport />} />
    </Routes>
  )
}

export default App
