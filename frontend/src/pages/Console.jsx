import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import { getDepths, getGrid, getFloats, getFloatHistory } from '../services/api'
import CesiumView from '../components/CesiumView'

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

export default function Console() {
  const navigate = useNavigate()
  const holderRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState('Connecting to API...')
  const [error, setError] = useState(null)
  const [availableDepths, setAvailableDepths] = useState([])
  const [activeDepthIdx, setActiveDepthIdx] = useState(0)
  const [activeDay, setActiveDay] = useState(1)
  const [totalDays, setTotalDays] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [disclaimer, setDisclaimer] = useState('Loading data from API...')
  const [selectedFloat, setSelectedFloat] = useState(null)
  const [floatHistory, setFloatHistory] = useState(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [viewMode, setViewMode] = useState('layers') // 'layers' | 'earth'
  const playRef = useRef(null)
  const activeDepthIdxRef = useRef(0)

  // Store scene internals in a single ref to avoid stale closures
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
    targetY: -2.2,  // where the camera target should animate to
    dragging: false, lastX: 0, lastY: 0, downPos: null,
    selectedFloatMesh: null,
    availableDepthCount: 0,
  })

  // Keep ref in sync
  useEffect(() => { activeDepthIdxRef.current = activeDepthIdx }, [activeDepthIdx])

  // ── Init Three.js scene (runs once) ──
  useEffect(() => {
    if (!holderRef.current) return
    const holder = holderRef.current
    const T = threeRef.current

    // Scene
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x050b14, 8, 26)
    T.scene = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(45, holder.clientWidth / holder.clientHeight, 0.1, 100)
    T.camera = camera

    // Renderer
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

    // ── Ambient light (needed if we switch to MeshPhongMaterial later) ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))

    // ── Pointer events ──
    renderer.domElement.addEventListener('pointerdown', (e) => {
      T.dragging = true
      T.lastX = e.clientX; T.lastY = e.clientY
      T.downPos = { x: e.clientX, y: e.clientY }
    })
    window.addEventListener('pointerup', () => { T.dragging = false })
    window.addEventListener('pointermove', (e) => {
      if (!T.dragging) return
      T.camTheta -= (e.clientX - T.lastX) * 0.006
      T.camPhi = Math.max(0.35, Math.min(1.5, T.camPhi - (e.clientY - T.lastY) * 0.006))
      T.lastX = e.clientX; T.lastY = e.clientY
      updateCamera()
    })
    renderer.domElement.addEventListener('wheel', (e) => {
      e.preventDefault()
      T.camRadius = Math.max(6, Math.min(24, T.camRadius + e.deltaY * 0.01))
      updateCamera()
    }, { passive: false })

    // ── Raycaster for float clicks ──
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    renderer.domElement.addEventListener('pointerup', (e) => {
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
        setCardOpen(true)
      } else {
        T.selectedFloatMesh = null
        setSelectedFloat(null)
        setCardOpen(false)
        setFloatHistory(null)
      }
      updateFloatColors()
    })

    // ── Resize ──
    const onResize = () => {
      camera.aspect = holder.clientWidth / holder.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(holder.clientWidth, holder.clientHeight)
    }
    window.addEventListener('resize', onResize)

    // ── Intro animation + render loop ──
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
      // Smooth camera target Y animation (lerp)
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
      renderer.dispose()
      if (holder.contains(renderer.domElement)) holder.removeChild(renderer.domElement)
    }
  }, [])

  // ── Helper functions that use threeRef (no stale closures) ──

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
    for (const pt of pts) if (pt.lat === lat && pt.lon === lon) return pt.value
    return 0
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
      for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
        const idx = j * N + i
        const v = getValueAt(i, j, di)
        const [r, g, b] = colorRamp((v - T.globalMin) / range)
        colors[idx * 3] = r; colors[idx * 3 + 1] = g; colors[idx * 3 + 2] = b
      }
      geo.attributes.color.needsUpdate = true
      T.depthMeshes[di].material.opacity = di === currentIdx ? 0.95 : 0.16
      T.depthWireframes[di].material.opacity = di === currentIdx ? 0.4 : 0.12
    }
  }

  function updateFloatColors() {
    const T = threeRef.current
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
        const depthResp = await getDepths(1)
        if (cancelled) return
        setAvailableDepths(depthResp.depths)
        setTotalDays(1)

        setLoadingMsg('Fetching grid data...')
        for (const d of depthResp.depths) {
          const grid = await getGrid({ variable: 'temperature', depth: d.depth_index, day: 1 })
          T.gridCache.set(d.depth_index, grid)
        }
        buildLatLonMaps()

        setLoadingMsg('Fetching float observations...')
        const floatData = await getFloats(1)
        if (cancelled) return
        T.allFloatData = floatData
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
    // Animate camera to center on the selected layer
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

  // ── Fetch float history when selected ──
  useEffect(() => {
    if (selectedFloat) {
      getFloatHistory(selectedFloat.id).then(setFloatHistory).catch(() => setFloatHistory(null))
    }
  }, [selectedFloat])

  // ── Reset camera ──
  function resetCamera() {
    const T = threeRef.current
    T.camTheta = 0.7; T.camPhi = 1.0; T.camRadius = 13
    T.updateCamera()
  }

  const depthLabels = ['Surface', 'Mid column', 'Deep', 'Deeper', 'Abyssal']

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

        {/* Center: View Mode Toggle */}
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
            <span className="text-secondary font-medium">GODAS vs In-Situ Argo</span>
          </div>
          {viewMode === 'layers' && (
            <button
              onClick={resetCamera}
              className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface text-[12px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">restart_alt</span>Reset View
            </button>
          )}
        </div>
      </div>

      {/* 3D Layer View (Three.js) */}
      {viewMode === 'layers' && (
        <div ref={holderRef} className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing" />
      )}

      {/* 3D Earth View (Cesium) */}
      {viewMode === 'earth' && (
        <div className="absolute inset-0 z-0" style={{ width: '100%', height: '100%' }}>
          <CesiumView />
        </div>
      )}

      {/* Left rail: controls (only for Layer view) */}
      {viewMode === 'layers' && (
      <div className="absolute top-14 left-3 z-20 w-56 flex flex-col gap-3 pointer-events-auto">
        <div className="bg-surface-container-lowest/80 backdrop-blur-md p-3 rounded-lg border border-outline-variant/20 shadow-md">
          <span className="text-[11px] font-mono text-on-surface-variant block mb-2">Variable</span>
          <div className="flex gap-1.5">
            <button className="flex-1 py-1.5 px-2 bg-primary/10 border border-primary text-primary text-[12px] font-semibold rounded transition-colors">
              Temperature
            </button>
            <button className="flex-1 py-1.5 px-2 bg-transparent border border-outline-variant/30 text-on-surface-variant text-[12px] font-semibold rounded opacity-40 cursor-not-allowed">
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

      {/* Disclaimer banner */}
      <div className="absolute top-14 right-3 z-20 max-w-xs">
        <div className="bg-surface-container-lowest/80 backdrop-blur-md px-3 py-2 rounded-lg border border-outline-variant/20 shadow-md text-[11px] text-on-surface-variant font-mono leading-relaxed">
          {disclaimer}
        </div>
      </div>

      {/* Inspection card (right rail) */}
      {cardOpen && selectedFloat && (
        <aside className="absolute top-14 right-3 bottom-14 w-[400px] max-w-[calc(100vw-1.5rem)] z-30 flex flex-col bg-surface-container-lowest/95 shadow-xl backdrop-blur-sm transition-all duration-200">
          <div className="px-4 py-3 bg-surface-container border-b border-outline-variant/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <div>
                <h3 className="text-[14px] font-bold text-on-surface leading-tight">Argo Float #{selectedFloat.id}</h3>
                <p className="text-[11px] text-on-surface-variant font-mono">
                  Active • ({selectedFloat.lat?.toFixed(2)}°, {selectedFloat.lon?.toFixed(2)}°)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {selectedFloat.observations?.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wider font-mono">Passed QC</span>
              )}
              <button onClick={() => { setCardOpen(false); setSelectedFloat(null); threeRef.current.selectedFloatMesh = null; updateFloatColors() }} className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-high transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {floatHistory?.observations?.length > 0 ? (
              <>
                {floatHistory.observations.slice(0, 3).map((obs, i) => (
                  <div key={i} className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/20">
                    <div className="text-[11px] font-mono text-on-surface-variant mb-2 flex items-center justify-between">
                      <span>OBSERVATION @ {obs.depth_m}m</span>
                      {obs.delta != null && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${Math.abs(obs.delta) > 1 ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'}`}>
                          {obs.delta > 0 ? '+' : ''}{obs.delta.toFixed(2)}°C Δ
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-surface-container p-2.5 rounded border-l-2 border-primary">
                        <span className="text-[11px] text-on-surface-variant block font-mono">Observed</span>
                        <span className="text-[18px] font-bold text-primary font-mono">{obs.temperature?.toFixed(2)}°C</span>
                      </div>
                      <div className="bg-surface-container p-2.5 rounded border-l-2 border-secondary">
                        <span className="text-[11px] text-on-surface-variant block font-mono">Model</span>
                        <span className="text-[18px] font-bold text-secondary font-mono">{obs.model_temp?.toFixed(2)}°C</span>
                      </div>
                    </div>
                  </div>
                ))}

                {floatHistory.observations.length > 1 && (
                  <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/20">
                    <span className="text-[11px] font-mono text-on-surface-variant mb-2 block">TIME SERIES</span>
                    <canvas
                      ref={(canvas) => {
                        if (!canvas) return
                        const ctx = canvas.getContext('2d')
                        const obs = floatHistory.observations
                        const w = canvas.width = canvas.clientWidth * 2
                        const h = canvas.height = 220
                        ctx.clearRect(0, 0, w, h)
                        const model = obs.map(o => o.model_temp)
                        const observed = obs.map(o => o.temperature)
                        const all = [...model, ...observed]
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
                          ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke()
                          arr.forEach((v, i) => { const [x, y] = toXY(i, v); ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill() })
                        }
                        ctx.strokeStyle = '#16334a'; ctx.lineWidth = 1
                        for (let g = 0; g <= 3; g++) { const y = pT + (g / 3) * pH; ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(w - pR, y); ctx.stroke() }
                        drawLine(model, '#2fb6a8')
                        drawLine(observed, '#f2a65a')
                      }}
                      className="w-full h-[110px] block"
                    />
                    <div className="flex gap-4 text-[11px] text-on-surface-variant mt-2">
                      <span><span className="inline-block w-2 h-2 rounded-full bg-primary-container mr-1" />Model</span>
                      <span><span className="inline-block w-2 h-2 rounded-full bg-secondary mr-1" />Observed</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => navigate(`/float/${selectedFloat.id}`)}
                  className="w-full py-2 bg-surface-container hover:bg-surface-container-high text-on-surface text-[12px] font-semibold rounded border border-outline-variant/20 transition-colors cursor-pointer"
                >
                  View Full Float Profile →
                </button>
              </>
            ) : (
              <p className="text-sm text-on-surface-variant text-center py-8">No observation data available for this float.</p>
            )}
          </div>
        </aside>
      )}

      {/* Bottom dock */}
      <footer className="absolute bottom-0 left-0 right-0 h-12 z-30 bg-surface-container-lowest/95 backdrop-blur px-4 flex items-center justify-between border-t border-outline-variant/20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPlaying(!playing)}
            className="w-7 h-7 rounded hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">{playing ? 'pause' : 'play_arrow'}</span>
          </button>
          <span className="text-[11px] font-mono text-on-surface-variant">
            {threeRef.current.floatMeshes.length} in-situ floats
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-on-surface-variant">Scale: 2°C</span>
          <div className="h-1.5 w-32 rounded bg-gradient-to-r from-[#274e8c] via-[#2fb6a8] via-50% via-[#f2a65a] to-[#e4572e]" />
        </div>
      </footer>
    </div>
  )
}
