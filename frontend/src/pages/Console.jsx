import { useState, useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { getDates, getDepths, getGrid, getFloats, getCurrents } from '../services/api'
import CesiumView from '../components/CesiumView'
import LeftFilterPanel from '../components/LeftFilterPanel'
import FloatDetailsPanel from '../components/FloatDetailsPanel'
import MapLegend from '../components/MapLegend'
import Timeline from '../components/Timeline'
import MapModeSelector from '../components/MapModeSelector'
import AnomalyToggle from '../components/AnomalyToggle'
import FloatTooltip from '../components/FloatTooltip'
import StatsBar from '../components/StatsBar'
import FindRegionButton from '../components/FindRegionButton'
import RegionResults from '../components/RegionResults'

const N = 20, M = 20, SPACING = 0.5

function colorRamp(t) {
  const stops = [
    { t: 0.0, c: [39, 78, 140] },
    { t: 0.4, c: [47, 182, 168] },
    { t: 0.7, c: [242, 166, 90] },
    { t: 1.0, c: [228, 87, 46] },
  ]
  for (let k = 0; k < stops.length - 1; k++) {
    if (t >= stops[k].t && t <= stops[k + 1].t) {
      const lt = (t - stops[k].t) / (stops[k + 1].t - stops[k].t)
      const a = stops[k].c, b = stops[k + 1].c
      return [(a[0] + (b[0] - a[0]) * lt) / 255, (a[1] + (b[1] - a[1]) * lt) / 255, (a[2] + (b[2] - a[2]) * lt) / 255]
    }
  }
  const c = stops[stops.length - 1].c
  return [c[0] / 255, c[1] / 255, c[2] / 255]
}

const DEFAULT_FILTERS = {
  dataSource: { argo: true, godas: true, inSitu: false },
  variable: 'temperature',
  depth: 'all',
  anomalyMode: 'all',
  status: { active: true, inactive: false },
}

export default function Console() {
  const holderRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState('Connecting to API...')
  const [error, setError] = useState(null)
  const [availableDepths, setAvailableDepths] = useState([])
  const [activeDepthIdx, setActiveDepthIdx] = useState(0)
  const [activeDay, setActiveDay] = useState(1)
  const [totalDays, setTotalDays] = useState(1)
  const [dates, setDates] = useState([])
  const [playing, setPlaying] = useState(false)
  const [disclaimer, setDisclaimer] = useState('Loading data from API...')
  const [selectedFloat, setSelectedFloat] = useState(null)
  const [viewMode, setViewMode] = useState('earth')
  const [presMode, setPresMode] = useState(false)
  const playRef = useRef(null)
  const activeDepthIdxRef = useRef(0)

  // New state for research UX
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [filterCollapsed, setFilterCollapsed] = useState(() => (
    typeof window !== 'undefined' && window.innerWidth < 768
  ))
  const [mapMode, setMapMode] = useState('floats')
  const [anomalyMode, setAnomalyMode] = useState('all')
  const [hoveredFloat, setHoveredFloat] = useState(null)
  const [tooltipPos, setTooltipPos] = useState(null)
  const [showTrajectory, setShowTrajectory] = useState(false)
  const [trajectoryFloatId, setTrajectoryFloatId] = useState(null)
  const [comparisonMode, setComparisonMode] = useState('absolute')
  const [cesiumFloatData, setCesiumFloatData] = useState(null)
  const [currents, setCurrents] = useState([])
  const [gridPointCount, setGridPointCount] = useState(0)
  const [foundRegions, setFoundRegions] = useState(null)
  const cesiumRef = useRef(null)

  const threeRef = useRef({
    scene: null, camera: null, renderer: null,
    depthMeshes: [], depthGeos: [], depthWireframes: [],
    floatMeshes: [],
    gridCache: new Map(),
    gridLats: [], gridLons: [],
    allFloatData: null,
    globalMin: Infinity, globalMax: -Infinity,
    camTheta: 0.7, camPhi: 1.0, camRadius: 13,
    target: new THREE.Vector3(0, -2.2, 0),
    targetY: -2.2,
    dragging: false, lastX: 0, lastY: 0, downPos: null,
    selectedFloatMesh: null,
    availableDepthCount: 0,
  })

  useEffect(() => { activeDepthIdxRef.current = activeDepthIdx }, [activeDepthIdx])

  // ── Resize Three.js when switching to layer view ──
  useEffect(() => {
    if (viewMode !== 'layers') return
    const T = threeRef.current
    if (!T.renderer || !holderRef.current) return
    // Small delay so the div has layout dimensions after becoming visible
    const id = requestAnimationFrame(() => {
      const holder = holderRef.current
      if (!holder) return
      T.camera.aspect = holder.clientWidth / holder.clientHeight
      T.camera.updateProjectionMatrix()
      T.renderer.setSize(holder.clientWidth, holder.clientHeight)
    })
    return () => cancelAnimationFrame(id)
  }, [viewMode])

  // ── Init Three.js scene ──
  useEffect(() => {
    if (!holderRef.current) return
    const T = threeRef.current
    if (T.scene) return // already initialized
    const holder = holderRef.current

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x050b14, 8, 26)
    T.scene = scene

    const camera = new THREE.PerspectiveCamera(45, holder.clientWidth / holder.clientHeight, 0.1, 100)
    T.camera = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(holder.clientWidth, holder.clientHeight)
    renderer.setClearColor(0x050b14)
    holder.appendChild(renderer.domElement)
    T.renderer = renderer

    function updateCamera() {
      const { camTheta, camPhi, camRadius, target } = T
      camera.position.x = target.x + camRadius * Math.sin(camPhi) * Math.sin(camTheta)
      camera.position.y = target.y + camRadius * Math.cos(camPhi)
      camera.position.z = target.z + camRadius * Math.sin(camPhi) * Math.cos(camTheta)
      camera.lookAt(target)
    }
    T.updateCamera = updateCamera
    updateCamera()

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))

    const onPointerDown = (e) => {
      T.dragging = true
      T.lastX = e.clientX; T.lastY = e.clientY
      T.downPos = { x: e.clientX, y: e.clientY }
    }
    const onPointerUp = () => { T.dragging = false }
    const onPointerMove = (e) => {
      if (!T.dragging) return
      T.camTheta -= (e.clientX - T.lastX) * 0.006
      T.camPhi = Math.max(0.35, Math.min(1.5, T.camPhi - (e.clientY - T.lastY) * 0.006))
      T.lastX = e.clientX; T.lastY = e.clientY
      updateCamera()
    }
    const onWheel = (e) => {
      e.preventDefault()
      T.camRadius = Math.max(6, Math.min(24, T.camRadius + e.deltaY * 0.01))
      updateCamera()
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const onFloatClick = (e) => {
      if (!T.downPos) return
      if (Math.hypot(e.clientX - T.downPos.x, e.clientY - T.downPos.y) > 5) return
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      const meshes = T.floatMeshes.map(f => f.mesh)
      const hits = raycaster.intersectObjects(meshes)
      if (hits.length) {
        const fd = hits[0].object.userData
        T.selectedFloatMesh = hits[0].object
        setSelectedFloat(fd)
      } else {
        T.selectedFloatMesh = null
        setSelectedFloat(null)
        setShowTrajectory(false)
        setTrajectoryFloatId(null)
      }
      updateFloatColors()
    }
    renderer.domElement.addEventListener('pointerup', onFloatClick)

    const onResize = () => {
      camera.aspect = holder.clientWidth / holder.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(holder.clientWidth, holder.clientHeight)
    }
    window.addEventListener('resize', onResize)

    let introT = 0
    const introStart = { phi: 0.4, radius: 20 }
    const introEnd = { phi: 1.0, radius: 13 }
    function animate() {
      requestAnimationFrame(animate)
      if (introT < 1) {
        introT = Math.min(1, introT + 0.012)
        const ease = 1 - Math.pow(1 - introT, 3)
        T.camPhi = introStart.phi + (introEnd.phi - introStart.phi) * ease
        T.camRadius = introStart.radius + (introEnd.radius - introStart.radius) * ease
        updateCamera()
      }
      const diff = T.targetY - T.target.y
      if (Math.abs(diff) > 0.01) {
        T.target.y += diff * 0.08
        updateCamera()
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('wheel', onWheel)
      renderer.domElement.removeEventListener('pointerup', onFloatClick)
      renderer.dispose()
      if (holder.contains(renderer.domElement)) holder.removeChild(renderer.domElement)
      T.scene = null
    }
  }, [])

  function buildGridGeometry() {
    const positions = new Float32Array(N * M * 3)
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const idx = j * N + i
      positions[idx * 3] = (i - (N - 1) / 2) * SPACING
      positions[idx * 3 + 1] = 0
      positions[idx * 3 + 2] = (j - (M - 1) / 2) * SPACING
    }
    const indices = []
    for (let j = 0; j < M - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = j * N + i + 1, c = (j + 1) * N + i, d = (j + 1) * N + i + 1
      indices.push(a, c, b, b, c, d)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * M * 3), 3))
    geo.setIndex(indices)
    return geo
  }

  function buildLatLonMaps() {
    const T = threeRef.current
    const lats = new Set(), lons = new Set()
    for (const pts of T.gridCache.values()) for (const pt of pts) { lats.add(pt.lat); lons.add(pt.lon) }
    T.gridLats = [...lats].sort((a, b) => a - b)
    T.gridLons = [...lons].sort((a, b) => a - b)
  }

  function getValueAt(i, j, depthIdx) {
    const T = threeRef.current
    const pts = T.gridCache.get(depthIdx)
    if (!pts || !T.gridLats.length || !T.gridLons.length) return 0
    const lat = T.gridLats[Math.round(j / (M - 1) * (T.gridLats.length - 1))]
    const lon = T.gridLons[Math.round(i / (N - 1) * (T.gridLons.length - 1))]
    let nearest = pts[0]
    let nearestDistance = Infinity
    for (const pt of pts) {
      const distance = Math.abs(pt.lat - lat) + Math.abs(pt.lon - lon)
      if (distance < nearestDistance) {
        nearest = pt
        nearestDistance = distance
      }
    }
    return nearest?.value ?? 0
  }

  function computeColorRange() {
    const T = threeRef.current
    T.globalMin = Infinity; T.globalMax = -Infinity
    for (const pts of T.gridCache.values()) for (const pt of pts) {
      if (pt.value < T.globalMin) T.globalMin = pt.value
      if (pt.value > T.globalMax) T.globalMax = pt.value
    }
  }

  function updateGridColors() {
    const T = threeRef.current
    if (!T.scene) return
    computeColorRange()
    const range = T.globalMax - T.globalMin || 1
    const depthCount = T.availableDepthCount
    const currentIdx = activeDepthIdxRef.current
    for (let di = 0; di < depthCount; di++) {
      const geo = T.depthGeos[di]
      if (!geo) continue
      const colors = geo.attributes.color.array
      const positions = geo.attributes.position.array
      for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
        const idx = j * N + i
        const v = getValueAt(i, j, di)
        const normalized = Math.max(0, Math.min(1, (v - T.globalMin) / range))
        const [r, g, b] = colorRamp(normalized)
        colors[idx * 3] = r; colors[idx * 3 + 1] = g; colors[idx * 3 + 2] = b
        positions[idx * 3 + 1] = (normalized - 0.5) * 1.35
      }
      geo.attributes.color.needsUpdate = true
      geo.attributes.position.needsUpdate = true
      T.depthMeshes[di].material.opacity = di === currentIdx ? 0.95 : 0.16
      T.depthWireframes[di].material.opacity = di === currentIdx ? 0.4 : 0.12
    }
  }

  function updateFloatColors() {
    const T = threeRef.current
    if (!T.scene) return
    T.floatMeshes.forEach(({ mesh, data }) => {
      if (data.observations && data.observations.length > 0) {
        const meanDelta = data.observations.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / data.observations.length
        const t = Math.min(1, meanDelta / 2.5)
        mesh.material.color.setRGB(0.25 + 0.7 * t, 0.75 - 0.55 * t, 0.35 * (1 - t))
      }
      mesh.scale.setScalar(mesh === T.selectedFloatMesh ? 1.7 : 1.0)
    })
  }

  function buildFloatMarkers() {
    const T = threeRef.current
    if (!T.scene) return
    T.floatMeshes.forEach(m => { T.scene.remove(m.mesh); T.scene.remove(m.line) })
    T.floatMeshes = []
    if (!T.allFloatData || !T.allFloatData.floats || !T.gridLats.length) return
    const lats = T.gridLats, lons = T.gridLons
    T.allFloatData.floats.forEach(fd => {
      const x = ((fd.lon - lons[0]) / (lons[lons.length - 1] - lons[0]) - 0.5) * (N - 1) * SPACING
      const z = ((fd.lat - lats[0]) / (lats[lats.length - 1] - lats[0]) - 0.5) * (M - 1) * SPACING
      const geo = new THREE.SphereGeometry(0.14, 16, 16)
      const mat = new THREE.MeshBasicMaterial({ color: 0xe8f1f2 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, 0.5, z)
      mesh.userData = fd
      T.scene.add(mesh)
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.5, z), new THREE.Vector3(x, 0, z)])
      const lineMat = new THREE.LineDashedMaterial({ color: 0x8fa6b3, dashSize: 0.06, gapSize: 0.06 })
      const line = new THREE.Line(lineGeo, lineMat)
      line.computeLineDistances()
      T.scene.add(line)
      T.floatMeshes.push({ mesh, line, data: fd })
    })
  }

  function initDepthMeshes(depthCount) {
    const T = threeRef.current
    if (!T.scene) return
    T.depthMeshes.forEach(m => T.scene.remove(m))
    T.depthWireframes.forEach(w => T.scene.remove(w))
    T.depthMeshes = []
    T.depthGeos = []
    T.depthWireframes = []
    T.availableDepthCount = depthCount
    for (let idx = 0; idx < depthCount; idx++) {
      const geo = buildGridGeometry()
      T.depthGeos.push(geo)
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: idx === 0 ? 0.95 : 0.16 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.y = -idx * 2.4
      T.scene.add(mesh)
      T.depthMeshes.push(mesh)
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x16334a, transparent: true, opacity: idx === 0 ? 0.4 : 0.12 }))
      wire.position.y = -idx * 2.4
      T.scene.add(wire)
      T.depthWireframes.push(wire)
    }
  }

  // ── Load data from API ──
  useEffect(() => {
    let cancelled = false
    async function init() {
      const T = threeRef.current
      try {
        setLoadingMsg('Connecting to API...')
        const datesResp = await getDates()
        if (cancelled) return
        const numDays = datesResp.dates.length
        setTotalDays(numDays)
        setDates(datesResp.dates)

        const depthResp = await getDepths(1)
        if (cancelled) return
        setAvailableDepths(depthResp.depths)

        setLoadingMsg('Fetching grid data...')
        for (const d of depthResp.depths) {
          const grid = await getGrid({ variable: 'temperature', depth: d.depth_index, day: 1 })
          T.gridCache.set(d.depth_index, grid)
        }
        buildLatLonMaps()
        setGridPointCount([...T.gridCache.values()].reduce((sum, points) => sum + points.length, 0))

        setLoadingMsg('Fetching float observations...')
        const floatData = await getFloats(1)
        if (cancelled) return
        T.allFloatData = floatData
        setCesiumFloatData(floatData)
        const currentsResp = await getCurrents(1)
        if (cancelled) return
        setCurrents(currentsResp.currents || [])
        setDisclaimer(`Live data from GODAS model + ${floatData.float_count} ARGO float${floatData.float_count !== 1 ? 's' : ''} — Indian Ocean, July 2026.`)

        initDepthMeshes(depthResp.depths.length)
        buildFloatMarkers()
        updateGridColors()
        updateFloatColors()
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        console.error('Init failed:', err)
        setError(err.message)
        setLoading(false)
        setDisclaimer('Could not connect to API. Make sure the backend is running on http://127.0.0.1:8000')
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  // ── Update grid when depth changes ──
  useEffect(() => {
    updateGridColors()
    updateFloatColors()
    const T = threeRef.current
    T.targetY = -activeDepthIdx * 2.4
  }, [activeDepthIdx])

  // ── Play/pause ──
  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setActiveDay(d => d >= totalDays ? 1 : d + 1)
      }, 900)
    } else {
      clearInterval(playRef.current)
    }
    return () => clearInterval(playRef.current)
  }, [playing, totalDays])

  // ── Re-fetch data when day changes ──
  useEffect(() => {
    if (activeDay === 1 && threeRef.current.gridCache.size > 0) return
    let cancelled = false
    async function loadDay() {
      const T = threeRef.current
      try {
        const depthResp = await getDepths(activeDay)
        if (cancelled) return

        T.gridCache.clear()
        for (const d of depthResp.depths) {
          const grid = await getGrid({ variable: 'temperature', depth: d.depth_index, day: activeDay })
          T.gridCache.set(d.depth_index, grid)
        }
        buildLatLonMaps()
        setGridPointCount([...T.gridCache.values()].reduce((sum, points) => sum + points.length, 0))
        computeColorRange()

        const floatData = await getFloats(activeDay)
        if (cancelled) return
        T.allFloatData = floatData
        setCesiumFloatData(floatData)
        const currentsResp = await getCurrents(activeDay)
        if (cancelled) return
        setCurrents(currentsResp.currents || [])

        buildFloatMarkers()
        updateGridColors()
        updateFloatColors()

        setDisclaimer(`Day ${activeDay} of ${totalDays} — ${floatData.float_count} ARGO float${floatData.float_count !== 1 ? 's' : ''}, July 2026.`)
      } catch (err) {
        console.error('Failed to load day:', err)
      }
    }
    loadDay()
    return () => { cancelled = true }
  }, [activeDay])

  // ── Escape key exits presentation mode ──
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && presMode) setPresMode(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presMode])

  function resetCamera() {
    const T = threeRef.current
    T.camTheta = 0.7; T.camPhi = 1.0; T.camRadius = 13
    T.updateCamera()
  }

  // Handler for CesiumView hover
  const handleHoverFloat = useCallback((float, pos) => {
    setHoveredFloat(float)
    setTooltipPos(pos)
  }, [])

  // Handler for CesiumView select
  const handleSelectFloat = useCallback((float) => {
    setSelectedFloat(float)
  }, [])

  // Handler for trajectory toggle
  const handleShowTrajectory = useCallback((float) => {
    if (showTrajectory && trajectoryFloatId === float.id) {
      setShowTrajectory(false)
      setTrajectoryFloatId(null)
    } else {
      setShowTrajectory(true)
      setTrajectoryFloatId(float.id)
    }
  }, [showTrajectory, trajectoryFloatId])

  // Handler for anomaly mode toggle
  const handleAnomalyToggle = useCallback((mode) => {
    setAnomalyMode(mode)
    setFilters(prev => ({ ...prev, anomalyMode: mode }))
  }, [])

  const handleMapModeChange = useCallback((mode) => {
    setMapMode(mode)
    if (mode === 'anomaly') setAnomalyMode('anomalies')
    if (mode !== 'anomaly' && anomalyMode === 'anomalies') setAnomalyMode('all')
    if (['temperature', 'salinity', 'oxygen', 'pressure'].includes(mode)) {
      setFilters(prev => ({ ...prev, variable: mode }))
    }
  }, [anomalyMode])

  const handleFiltersChange = useCallback((nextFilters) => {
    setFilters(nextFilters)
    const nextMode = nextFilters.variable === 'delta' ? 'anomaly' : nextFilters.variable
    if (['temperature', 'salinity', 'oxygen', 'pressure', 'anomaly'].includes(nextMode)) {
      setMapMode(nextMode)
    }
    setAnomalyMode(nextFilters.anomalyMode)
  }, [])

  // Handler for finding interesting regions
  const handleFindRegions = useCallback((regions) => {
    setFoundRegions(regions)
  }, [])

  // Handler for flying to a region (delegates to CesiumView)
  const handleFlyToRegion = useCallback((lat, lon) => {
    if (cesiumRef.current?.flyTo) {
      cesiumRef.current.flyTo(lat, lon)
    }
  }, [])

  const depthLabels = ['Surface', 'Mid column', 'Deep', 'Deeper', 'Abyssal']

  // Compute legend variable from mapMode
  const legendVariable = comparisonMode === 'difference' ? 'delta'
    : mapMode === 'density' ? 'temperature'
    : mapMode

  // Float count from CesiumView data
  const floatCount = cesiumFloatData?.float_count || 0

  return (
    <div className="h-screen w-screen bg-background overflow-hidden relative select-none">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/65 backdrop-blur-sm">
          <div className="w-8 h-8 border-3 border-outline-variant border-t-primary rounded-full animate-spin mb-4" />
          <span className="text-sm text-primary font-mono">{loadingMsg}</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="absolute top-3 left-3 right-3 z-40 bg-error-container/20 border border-error/30 text-error px-4 py-2 rounded-lg text-sm font-mono">
          Error: {error}
        </div>
      )}

      {/* Top HUD strip */}
      {!presMode && (
      <div className="absolute top-2 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto bg-surface-container-lowest/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-outline-variant/20 shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-[12px] font-semibold tracking-wider text-on-surface uppercase">Arabian Sea Basin</span>
          </div>
          {viewMode === 'layers' && (
            <>
              <span className="text-outline-variant">•</span>
              <span className="text-[12px] font-mono text-on-surface-variant">
                Layer: <strong className="text-primary font-medium">{depthLabels[activeDepthIdx] || 'Layer ' + activeDepthIdx} ({availableDepths[activeDepthIdx]?.depth_m}m)</strong>
              </span>
            </>
          )}
        </div>

        <div className="pointer-events-auto flex items-center bg-surface-container-lowest/80 backdrop-blur-md p-1 rounded-lg border border-outline-variant/20 shadow-md">
          <button
            onClick={() => setViewMode('layers')}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'layers'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">layers</span>
            3D Layer View
          </button>
          <button
            onClick={() => setViewMode('earth')}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'earth'
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">public</span>
            3D Earth View
          </button>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="hidden md:flex items-center gap-2 bg-surface-container-lowest/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-outline-variant/20 shadow-md font-mono text-[12px]">
            <span className="text-on-surface-variant">Comparison:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setComparisonMode('absolute')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${comparisonMode === 'absolute' ? 'bg-primary/15 text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                Absolute
              </button>
              <button
                onClick={() => setComparisonMode('difference')}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${comparisonMode === 'difference' ? 'bg-secondary/15 text-secondary' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                Δ Diff
              </button>
            </div>
          </div>
          <button
            onClick={() => setPresMode(!presMode)}
            className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">{presMode ? 'fullscreen_exit' : 'fullscreen'}</span>
            {presMode ? 'Exit Pres' : 'Present'}
          </button>
          {viewMode === 'layers' && !presMode && (
            <button
              onClick={resetCamera}
              className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">restart_alt</span>Reset View
            </button>
          )}
        </div>
      </div>
      )}

      {/* 3D Layer View (Three.js) — always mounted, hidden when in earth mode */}
      <div
        ref={holderRef}
        className={`absolute inset-0 z-0 cursor-grab active:cursor-grabbing ${viewMode === 'layers' ? 'md:left-64 md:right-0' : ''}`}
        style={{ display: viewMode === 'layers' ? 'block' : 'none' }}
      />

      {/* 3D Earth View (Cesium) */}
      {viewMode === 'earth' && (
        <div className="absolute inset-0 z-0 md:left-64" style={{ height: '100%' }}>
          <CesiumView
            ref={cesiumRef}
            floatData={cesiumFloatData}
            currents={currents}
            filters={filters}
            mapMode={mapMode}
            anomalyMode={anomalyMode}
            selectedFloatId={selectedFloat?.id}
            onSelectFloat={handleSelectFloat}
            onHoverFloat={handleHoverFloat}
            showTrajectory={showTrajectory}
            trajectoryFloatId={trajectoryFloatId}
            comparisonMode={comparisonMode}
          />
        </div>
      )}

      {/* Left Filter Panel belongs to the Earth map; Layer View has its own depth rail. */}
      {!presMode && viewMode === 'earth' && (
        <LeftFilterPanel
          filters={filters}
          onFilterChange={handleFiltersChange}
          collapsed={filterCollapsed}
          onToggleCollapse={() => setFilterCollapsed(!filterCollapsed)}
          availableDepths={availableDepths}
        />
      )}

      {/* Map Mode Selector (earth view only, non-presentation) */}
      {!presMode && viewMode === 'earth' && (
        <MapModeSelector activeMode={mapMode} onModeChange={handleMapModeChange} />
      )}

      {/* Stats Bar (earth view, non-presentation) */}
      {!presMode && viewMode === 'earth' && (
        <StatsBar floatData={cesiumFloatData} filters={filters} anomalyMode={anomalyMode} />
      )}

      {/* Find Interesting Region button (earth view, non-presentation) */}
      {!presMode && viewMode === 'earth' && !foundRegions && (
        <FindRegionButton floatData={cesiumFloatData} onFindRegions={handleFindRegions} />
      )}

      {/* Region Results panel */}
      {!presMode && viewMode === 'earth' && foundRegions && (
        <RegionResults
          regions={foundRegions}
          onFlyTo={handleFlyToRegion}
          onClose={() => setFoundRegions(null)}
        />
      )}

      {/* Left rail for Layer view controls */}
      {!presMode && viewMode === 'layers' && (
      <div className="absolute top-14 left-3 z-20 w-64 max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-5rem)] overflow-y-auto pr-1 flex flex-col gap-3 pointer-events-auto">
        <div className="bg-surface-container-lowest/80 backdrop-blur-md p-3 rounded-lg border border-outline-variant/20 shadow-md">
          <span className="text-[11px] font-mono text-on-surface-variant block mb-2">Variable</span>
          <div className="flex gap-1.5">
            <button className="flex-1 py-1.5 px-2 bg-primary/10 border border-primary text-primary text-[12px] font-semibold rounded transition-colors">
              Temperature
            </button>
            <button
              onClick={() => { setMapMode('currents'); setViewMode('earth') }}
              className="flex-1 py-1.5 px-2 bg-transparent border border-outline-variant/30 text-on-surface-variant text-[12px] font-semibold rounded hover:border-primary hover:text-primary transition-colors cursor-pointer"
            >
              Currents
            </button>
          </div>
        </div>

        <div className="bg-surface-container-lowest/80 backdrop-blur-md p-3 rounded-lg border border-outline-variant/20 shadow-md">
          <span className="text-[11px] font-mono text-on-surface-variant block mb-2">Depth Layer</span>
          <div className="flex flex-col gap-1.5">
            {availableDepths.map((d, i) => (
              <button
                key={d.depth_index}
                onClick={() => setActiveDepthIdx(i)}
                className={`text-left py-1.5 px-2 text-[12px] rounded border transition-colors ${
                  i === activeDepthIdx
                    ? 'bg-primary/10 border-primary text-on-surface'
                    : 'bg-transparent border-outline-variant/30 text-on-surface-variant hover:border-primary hover:text-on-surface'
                }`}
              >
                {depthLabels[i] || 'Layer ' + i}
                <span className="ml-2 text-[10px] text-on-surface-variant">{d.depth_m}m</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface-container-lowest/80 backdrop-blur-md p-3 rounded-lg border border-outline-variant/20 shadow-md">
          <span className="text-[11px] font-mono text-on-surface-variant block mb-2">Day</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPlaying(!playing)}
              className="w-7 h-7 rounded-full border border-outline-variant/30 bg-transparent text-on-surface flex items-center justify-center hover:border-primary transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">{playing ? 'pause' : 'play_arrow'}</span>
            </button>
            <input
              type="range"
              min={1}
              max={totalDays}
              value={activeDay}
              onChange={(e) => setActiveDay(parseInt(e.target.value))}
              className="flex-1 accent-primary h-1 bg-outline-variant/30 rounded-lg cursor-pointer"
            />
          </div>
          <span className="text-[11px] font-mono text-on-surface-variant mt-1 block">Day {activeDay} / {totalDays}</span>
        </div>

        <div className="bg-surface-container-lowest/80 backdrop-blur-md p-3 rounded-lg border border-outline-variant/20 shadow-md">
          <span className="text-[11px] font-mono text-on-surface-variant block mb-2">Scale</span>
          <div className="h-2 rounded bg-gradient-to-r from-[#274e8c] via-[#2fb6a8] via-[#f2a65a] to-[#e4572e]" />
          <div className="flex justify-between text-[10px] font-mono text-on-surface-variant mt-1">
            <span>Cold</span><span>Warm</span>
          </div>
        </div>

        <p className="text-[11px] text-on-surface-variant/50 font-mono leading-relaxed">
          Drag to orbit, scroll to zoom. Click a float marker to inspect.
        </p>
      </div>
      )}

      {/* Layer telemetry keeps the API-backed field readable while exploring depth. */}
      {!presMode && viewMode === 'layers' && (
        <div className="absolute right-3 bottom-16 z-20 w-64 max-w-[calc(100vw-1.5rem)] bg-surface-container-lowest/85 backdrop-blur-md rounded-lg border border-outline-variant/20 shadow-md p-3 pointer-events-none">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-on-surface-variant/70 uppercase tracking-widest">Live field</span>
            <span className="text-[10px] font-mono text-primary">GODAS + ARGO</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="bg-surface-container/70 rounded px-2 py-1.5"><span className="block text-on-surface-variant/60">GRID POINTS</span><span className="text-on-surface">{gridPointCount.toLocaleString()}</span></div>
            <div className="bg-surface-container/70 rounded px-2 py-1.5"><span className="block text-on-surface-variant/60">FLOATS</span><span className="text-primary">{floatCount.toLocaleString()}</span></div>
            <div className="bg-surface-container/70 rounded px-2 py-1.5"><span className="block text-on-surface-variant/60">LAYERS</span><span className="text-on-surface">{availableDepths.length}</span></div>
            <div className="bg-surface-container/70 rounded px-2 py-1.5"><span className="block text-on-surface-variant/60">DAY</span><span className="text-on-surface">{activeDay} / {totalDays}</span></div>
          </div>
        </div>
      )}

      {/* Map Legend */}
      {!presMode && viewMode === 'earth' && (
        <MapLegend variable={legendVariable} />
      )}

      {/* Anomaly Toggle */}
      {!presMode && viewMode === 'earth' && (
        <AnomalyToggle anomalyMode={anomalyMode} onToggle={handleAnomalyToggle} />
      )}

      {/* Float Tooltip (hover) */}
      {!presMode && viewMode === 'earth' && (
        <FloatTooltip float={hoveredFloat} position={tooltipPos} />
      )}

      {/* Float Details Panel (right side) */}
      {!presMode && (
        <FloatDetailsPanel
          float={selectedFloat}
          onClose={() => {
            setSelectedFloat(null)
            setShowTrajectory(false)
            setTrajectoryFloatId(null)
            threeRef.current.selectedFloatMesh = null
            updateFloatColors()
          }}
          onShowTrajectory={handleShowTrajectory}
          trajectoryVisible={showTrajectory}
          onCompareGodas={(_float) => {
            setComparisonMode('difference')
            setMapMode('floats')
          }}
        />
      )}

      {/* Disclaimer banner */}
      {!presMode && (
      <div className="absolute top-14 right-3 z-20 max-w-xs">
        <div className="bg-surface-container-lowest/80 backdrop-blur-md px-3 py-2 rounded-lg border border-outline-variant/20 shadow-md text-[11px] text-on-surface-variant font-mono leading-relaxed">
          {disclaimer}
        </div>
      </div>
      )}

      {/* Timeline (earth view, non-presentation) */}
      {!presMode && viewMode === 'earth' && (
        <Timeline
          dates={dates}
          activeDay={activeDay}
          onDayChange={setActiveDay}
          playing={playing}
          onPlayToggle={() => setPlaying(!playing)}
        />
      )}

      {/* Bottom dock */}
      {!presMode && (
      <footer className="absolute bottom-0 left-0 right-0 h-12 z-30 bg-surface-container-lowest/95 backdrop-blur px-4 flex items-center justify-between border-t border-outline-variant/20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPlaying(!playing)}
            className="w-7 h-7 rounded hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">{playing ? 'pause' : 'play_arrow'}</span>
          </button>
          <span className="text-[11px] font-mono text-on-surface-variant">
            {floatCount} in-situ floats
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-on-surface-variant">Scale: 2°C</span>
          <div className="h-1.5 w-32 rounded bg-gradient-to-r from-[#274e8c] via-[#2fb6a8] via-50% via-[#f2a65a] to-[#e4572e]" />
        </div>
      </footer>
      )}

      {/* Presentation mode bottom bar */}
      {presMode && (
      <div className="absolute bottom-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-primary animate-pulse" />
          <div>
            <h2 className="text-[18px] font-bold text-white tracking-wide">Ocean State Console</h2>
            <p className="text-[12px] text-white/60 font-mono">GODAS Model vs ARGO Floats — Indian Ocean</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {availableDepths.map((d, i) => (
              <button
                key={d.depth_index}
                onClick={() => setActiveDepthIdx(i)}
                className={`px-4 py-2 text-[14px] font-bold rounded-lg transition-all ${
                  i === activeDepthIdx
                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {depthLabels[i]}
                <span className="ml-1.5 text-[11px] font-normal opacity-70">{d.depth_m}m</span>
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-white/20" />

          <button
            onClick={() => setPlaying(!playing)}
            className="w-12 h-12 rounded-full bg-primary hover:bg-primary/80 text-white flex items-center justify-center transition-colors shadow-lg shadow-primary/30 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[28px]">{playing ? 'pause' : 'play_arrow'}</span>
          </button>

          <span className="text-[14px] font-mono text-white/80 min-w-[80px] text-center">
            Day {activeDay} / {totalDays}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 rounded bg-gradient-to-r from-[#274e8c] via-[#2fb6a8] via-[#f2a65a] to-[#e4572e]" />
            <span className="text-[12px] text-white/60 font-mono">Cold → Warm</span>
          </div>
          <button
            onClick={() => setPresMode(false)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-[13px] font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">fullscreen_exit</span>
            Exit
          </button>
        </div>
      </div>
      )}
    </div>
  )
}
