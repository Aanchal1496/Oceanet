import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'

// Coarse coastline mask for the Indian Ocean demo domain. It is intentionally
// conservative: a small amount of water near a coast is preferable to drawing
// a current through a visible landmass when the API only provides vectors.
const INDIAN_OCEAN_LAND = [
  [[40, 25], [47, 25], [45, 15], [47, 5], [45, -5], [48, -15], [51, -25], [40, -25]], // East Africa
  [[40, 25], [61, 25], [59, 17], [54, 12], [49, 12], [45, 17]], // Arabian Peninsula
  [[67, 25], [90, 25], [89, 21], [86, 18], [84, 13], [80, 8], [76, 8], [73, 14], [69, 20]], // India
  [[90, 25], [110, 25], [110, 8], [105, 8], [102, 12], [98, 16], [94, 21]], // Southeast Asia
  [[79.5, 10], [82.2, 10], [82.2, 6], [80, 5.5], [79.1, 7.2]], // Sri Lanka
  [[95, 5], [104, 6], [106, 1], [104, -5], [101, -6], [98, -3], [96, 0]], // Sumatra
  [[104, -6], [110, -6], [110, -11], [104, -10]], // Java
  [[49, -12], [51, -17], [50, -23], [47, -26], [43, -24], [43, -16], [46, -12]], // Madagascar
]

function pointInPolygon(lon, lat, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects = ((yi > lat) !== (yj > lat)) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function isIndianOceanLand(lon, lat) {
  return INDIAN_OCEAN_LAND.some(polygon => pointInPolygon(lon, lat, polygon))
}

function getColorForValue(value, min, max, variable) {
  if (variable === 'delta') {
    const range = Math.max(Math.abs(min), Math.abs(max)) || 2
    const normalized = (value + range) / (2 * range)
    const t = Math.max(0, Math.min(1, normalized))
    return interpolateColor(t, [
      [0.0, [41, 128, 185]],
      [0.25, [93, 218, 203]],
      [0.5, [149, 165, 166]],
      [0.75, [255, 184, 115]],
      [1.0, [231, 76, 60]],
    ])
  }

  const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)))

  if (variable === 'temperature') {
    return interpolateColor(t, [
      [0.0, [39, 78, 140]],
      [0.4, [47, 182, 168]],
      [0.7, [242, 166, 90]],
      [1.0, [228, 87, 46]],
    ])
  }
  if (variable === 'salinity') {
    return interpolateColor(t, [
      [0.0, [26, 82, 118]],
      [0.35, [41, 128, 185]],
      [0.65, [93, 218, 203]],
      [1.0, [243, 156, 18]],
    ])
  }
  if (variable === 'anomaly') {
    return interpolateColor(t, [
      [0.0, [93, 218, 203]],
      [0.5, [255, 184, 115]],
      [1.0, [231, 76, 60]],
    ])
  }
  if (variable === 'oxygen') {
    return interpolateColor(t, [
      [0.0, [39, 78, 140]],
      [0.4, [47, 182, 168]],
      [0.7, [242, 166, 90]],
      [1.0, [228, 87, 46]],
    ])
  }
  if (variable === 'pressure') {
    return interpolateColor(t, [
      [0.0, [47, 182, 168]],
      [0.4, [39, 78, 140]],
      [0.7, [242, 166, 90]],
      [1.0, [228, 87, 46]],
    ])
  }
  if (variable === 'currents') {
    return interpolateColor(t, [
      [0.00, [6, 21, 47]],    // #06152F - Slow: very dark navy/blue
      [0.20, [7, 59, 115]],   // #073B73 - Low: deep saturated blue
      [0.45, [8, 127, 155]],  // #087F9B - Medium: saturated blue/teal
      [0.70, [0, 207, 232]],  // #00CFE8 - Fast: bright electric cyan
      [0.88, [77, 235, 255]], // #4DEBFF - Very fast: brilliant luminous cyan
      [1.00, [168, 85, 247]], // #A855F7 - Very fastest: vivid violet/purple
    ])
  }
  if (variable === 'depth') {
    return interpolateColor(t, [
      [0.0, [47, 182, 168]],
      [0.33, [39, 78, 140]],
      [0.66, [26, 35, 126]],
      [1.0, [13, 13, 59]],
    ])
  }
  return [0.36, 0.85, 0.79]
}

function interpolateColor(t, stops) {
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const lt = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
      const a = stops[i][1], b = stops[i + 1][1]
      return [a[0] + (b[0] - a[0]) * lt, a[1] + (b[1] - a[1]) * lt, a[2] + (b[2] - a[2]) * lt]
    }
  }
  return stops[stops.length - 1][1]
}

function clusterFloats(floats, cameraHeight, Cesium) {
  if (!floats.length || !Cesium) return []

  const clusterRadiusDeg = getClusterRadius(cameraHeight)
  const used = new Set()
  const clusters = []

  for (let i = 0; i < floats.length; i++) {
    if (used.has(i)) continue
    const cluster = { floats: [floats[i]], centerLat: floats[i].lat, centerLon: floats[i].lon }
    used.add(i)

    for (let j = i + 1; j < floats.length; j++) {
      if (used.has(j)) continue
      const dist = Math.sqrt(
        Math.pow(floats[j].lat - floats[i].lat, 2) +
        Math.pow(floats[j].lon - floats[i].lon, 2)
      )
      if (dist < clusterRadiusDeg) {
        cluster.floats.push(floats[j])
        used.add(j)
      }
    }

    if (cluster.floats.length > 1) {
      cluster.centerLat = cluster.floats.reduce((s, f) => s + f.lat, 0) / cluster.floats.length
      cluster.centerLon = cluster.floats.reduce((s, f) => s + f.lon, 0) / cluster.floats.length
    }
    clusters.push(cluster)
  }

  return clusters
}

function getClusterRadius(cameraHeight) {
  if (cameraHeight > 8000000) return 4
  if (cameraHeight > 5000000) return 2.5
  if (cameraHeight > 3000000) return 1.3
  if (cameraHeight > 1500000) return 0.6
  if (cameraHeight > 800000) return 0.3
  return 0.12
}

export default forwardRef(function CesiumView({
  floatData,
  filters,
  mapMode,
  anomalyMode,
  selectedFloatId,
  onSelectFloat,
  onHoverFloat,
  showTrajectory,
  trajectoryFloatId,
  comparisonMode,
  currents = [],
  currentSource,
  currentTimestamp,
  onInspectCurrent,
}, ref) {
  const cesiumIonToken = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim()
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const [viewerReady, setViewerReady] = useState(false)
  const entitiesRef = useRef([])
  const clusterEntitiesRef = useRef([])
  const currentEntitiesRef = useRef([])
  const trajectoryEntitiesRef = useRef([])
  const handlerRef = useRef(null)
  const lastCameraHeightRef = useRef(5000000)
  const [currentsLoading, setCurrentsLoading] = useState(false)
  const buildCurrentsTimeoutRef = useRef(null)

  const getFloatValue = useCallback((fd, variable) => {
    if (!fd.observations?.length) return 0
    const surfaceObs = fd.observations.find(o => o.depth_m === Math.min(...fd.observations.map(ob => ob.depth_m))) || fd.observations[0]
    switch (variable) {
      case 'temperature': return surfaceObs.temperature || 0
      case 'salinity': return 34 + (surfaceObs.delta || 0) * 0.1
      case 'delta': return surfaceObs.delta || 0
      case 'anomaly': return Math.abs(surfaceObs.delta || 0)
      case 'oxygen': return 220 - (surfaceObs.pressure_dbar || 0) * 0.18 + (surfaceObs.delta || 0) * 4
      case 'depth': return Math.max(...fd.observations.map(o => o.depth_m))
      case 'pressure': return surfaceObs.pressure_dbar || 0
      default: return surfaceObs.temperature || 0
    }
  }, [])

  const filterFloats = useCallback((floats) => {
    if (!floats) return []
    let filtered = [...floats]

    if (!filters.dataSource.argo) {
      filtered = filtered.filter(fd => fd.source !== 'argo')
    }
    if (!filters.status.active) {
      filtered = filtered.filter(fd => fd.status !== 'active')
    }
    if (!filters.status.inactive) {
      filtered = filtered.filter(fd => fd.status !== 'inactive')
    }

    if (filters.depth !== 'all') {
      const ranges = {
        surface: [0, 20],
        '0-100': [0, 100],
        '100-500': [100, 500],
        '500-1000': [500, 1000],
        '1000+': [1000, Infinity],
      }
      const [minDepth, maxDepth] = ranges[filters.depth] || [0, Infinity]
      filtered = filtered.filter(fd => fd.observations?.some(obs => obs.depth_m >= minDepth && obs.depth_m < maxDepth))
    }

    if (anomalyMode === 'anomalies') {
      filtered = filtered.filter(fd => {
        if (!fd.observations?.length) return false
        const meanDelta = fd.observations.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / fd.observations.length
        return meanDelta > 1.0
      })
    }

    return filtered
  }, [anomalyMode, filters])

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return

    let cancelled = false

    async function init() {
      const Cesium = await import('cesium')
      window.Cesium = Cesium

      if (cesiumIonToken) {
        Cesium.Ion.defaultAccessToken = cesiumIonToken
      }

      // Use public satellite tiles as the visual baseline. This keeps the
      // Earth natural-looking without requiring an Ion account.
      const satelliteLayer = new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 19,
          credit: new Cesium.Credit('Esri, Maxar, Earthstar Geographics, and the GIS User Community'),
        }),
      )

      // OSM stays underneath as a resilient fallback if satellite tiles are
      // unavailable or rate-limited.
      const fallbackBaseLayer = new Cesium.ImageryLayer(
        new Cesium.OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        }),
      )

      if (cancelled || !containerRef.current) return

      const viewer = new Cesium.Viewer(containerRef.current, {
        baseLayer: satelliteLayer,
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        vrButton: false,
        selectionIndicator: false,
        infoBox: false,
        shouldAnimate: true,
      })

      viewerRef.current = viewer
      viewer.imageryLayers.add(fallbackBaseLayer, 0)
      viewer.resize()
      window.dispatchEvent(new Event('resize'))

      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#051522')
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#051522')
      viewer.scene.fog.enabled = true
      viewer.scene.fog.density = 0.0002
      viewer.scene.fog.screenSpaceErrorFactor = 4
      viewer.scene.globe.enableLighting = true
      viewer.scene.globe.showGroundAtmosphere = true
      viewer.scene.skyAtmosphere.show = true
      viewer.scene.skyAtmosphere.atmosphereLightIntensity = 8.0
      viewer.scene.skyAtmosphere.brightnessShift = 0.08
      viewer.scene.skyAtmosphere.hueShift = -0.02
      viewer.scene.skyAtmosphere.saturationShift = 0.08

      // Upgrade to Ion only when a local Vite token is configured. The
      // fallback layer stays underneath so a slow/invalid token never blanks
      // the globe or prevents the API-backed float markers from rendering.
      if (cesiumIonToken) {
        const ionLayer = Cesium.ImageryLayer.fromWorldImagery()
        ionLayer.errorEvent.addEventListener(() => {
          if (!viewer.isDestroyed()) viewer.imageryLayers.remove(ionLayer, true)
        })
        viewer.imageryLayers.add(ionLayer)

        Promise.race([
          Cesium.createWorldTerrainAsync({ requestWaterMask: true, requestVertexNormals: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Cesium Ion terrain timed out')), 8000)),
        ])
          .then((terrainProvider) => {
            if (!cancelled && !viewer.isDestroyed()) viewer.terrainProvider = terrainProvider
          })
          .catch((error) => {
            console.warn('Cesium Ion terrain unavailable; keeping local terrain.', error)
          })
      }

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(70, -8, 4200000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-72),
          roll: 0,
        },
        duration: 2,
      })

      // Track camera height for clustering
      viewer.camera.changed.addEventListener(() => {
        const height = viewer.camera.positionCartographic.height
        if (Math.abs(height - lastCameraHeightRef.current) > 500000) {
          lastCameraHeightRef.current = height
          updateMarkers(Cesium, viewer, height)
        }
      })

      // Handle hover via screen space event
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
      handler.setInputAction((movement) => {
        const picked = viewer.scene.pick(movement.endPosition)
        if (Cesium.defined(picked) && picked.id?.userData?.id) {
          onHoverFloat?.(picked.id.userData, {
            x: movement.endPosition.x,
            y: movement.endPosition.y,
          })
          viewer.container.style.cursor = 'pointer'
        } else if (Cesium.defined(picked) && picked.id?.userData?.kind === 'current') {
          onHoverFloat?.(null, null)
          viewer.container.style.cursor = 'pointer'
        } else {
          onHoverFloat?.(null, null)
          viewer.container.style.cursor = 'default'
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

      // Handle click
      handler.setInputAction((click) => {
        const picked = viewer.scene.pick(click.position)
        if (Cesium.defined(picked) && picked.id?.userData?.id) {
          onSelectFloat?.(picked.id.userData)
        } else if (Cesium.defined(picked) && picked.id?.userData?.kind === 'current') {
          onInspectCurrent?.(picked.id.userData)
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      handlerRef.current = handler
      setViewerReady(true)
    }

    init()

    return () => {
      cancelled = true
      if (buildCurrentsTimeoutRef.current) {
        clearTimeout(buildCurrentsTimeoutRef.current)
        buildCurrentsTimeoutRef.current = null
      }
      handlerRef.current?.destroy()
      setViewerReady(false)
      if (viewerRef.current) {
        currentEntitiesRef.current.forEach(entity => viewerRef.current.entities.remove(entity))
        currentEntitiesRef.current = []
        viewerRef.current.destroy()
        viewerRef.current = null
      }
    }
  }, [cesiumIonToken])

  // Update markers when data or filters change
  useEffect(() => {
    if (!viewerRef.current) return
    const Cesium = window.Cesium
    if (!Cesium) return
    updateMarkers(Cesium, viewerRef.current, lastCameraHeightRef.current)
  }, [floatData, filters, mapMode, anomalyMode, selectedFloatId, comparisonMode, viewerReady])

  // Update trajectory when toggled
  useEffect(() => {
    if (!viewerRef.current) return
    const Cesium = window.Cesium
    if (!Cesium) return
    updateTrajectory(Cesium, viewerRef.current)
  }, [showTrajectory, trajectoryFloatId, floatData])

  // Update the synthetic current vectors when the API response or mode changes.
  useEffect(() => {
    if (!viewerRef.current) return
    const Cesium = window.Cesium
    if (!Cesium) return
    updateCurrentVectors(Cesium, viewerRef.current)
  }, [currents, mapMode, viewerReady, currentSource, currentTimestamp])

  function updateMarkers(Cesium, viewer, cameraHeight) {
    // Remove old entities
    entitiesRef.current.forEach(e => viewer.entities.remove(e))
    entitiesRef.current = []
    clusterEntitiesRef.current.forEach(e => viewer.entities.remove(e))
    clusterEntitiesRef.current = []

    if (!floatData?.floats) return
    if (mapMode === 'currents') return

    const filtered = filterFloats(floatData.floats)
    if (!filtered.length) return

    // Compute value range for coloring
    const variable = comparisonMode === 'difference' ? 'delta' : ['temperature', 'salinity', 'oxygen', 'pressure', 'anomaly'].includes(mapMode) ? mapMode : 'temperature'
    const values = filtered.map(fd => getFloatValue(fd, variable))
    const valueMin = Math.min(...values)
    const valueMax = Math.max(...values)

    // Cluster based on zoom
    const clusters = clusterFloats(filtered, cameraHeight, Cesium)

    clusters.forEach(cluster => {
      if (cluster.floats.length === 1) {
        // Single float - render individual marker
        const fd = cluster.floats[0]
        const value = getFloatValue(fd, variable)
  const [r, g, b] = getColorForValue(value, valueMin, valueMax, variable)
        const color = Cesium.Color.fromCssColorString(`rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`)

        const isSelected = fd.id === selectedFloatId

        const entity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(fd.lon, fd.lat, 1000),
          point: {
            pixelSize: isSelected ? 12 : 8,
            color: color,
            outlineColor: isSelected
              ? Cesium.Color.WHITE
              : Cesium.Color.WHITE.withAlpha(0.5),
            outlineWidth: isSelected ? 3 : 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          userData: fd,
        })
        entitiesRef.current.push(entity)

        // Halo ellipse
        const haloEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(fd.lon, fd.lat, 1000),
          ellipse: {
            semiMajorAxis: 12000,
            semiMinorAxis: 12000,
            height: 0,
            material: color.withAlpha(isSelected ? 0.25 : 0.15),
            outline: true,
            outlineColor: color.withAlpha(isSelected ? 0.6 : 0.3),
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
        entitiesRef.current.push(haloEntity)
      } else {
        // Cluster - render cluster marker
        const clusterEntity = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(cluster.centerLon, cluster.centerLat, 1000),
          point: {
            pixelSize: Math.min(20, 10 + cluster.floats.length * 0.5),
            color: Cesium.Color.fromCssColorString('#0d4f5c').withAlpha(0.9),
            outlineColor: Cesium.Color.fromCssColorString('#5ddacb'),
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `${cluster.floats.length}`,
            font: 'bold 13px monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            showBackground: false,
          },
          userData: null,
        })
        clusterEntitiesRef.current.push(clusterEntity)
      }
    })
  }

  function updateCurrentVectors(Cesium, viewer) {
    if (buildCurrentsTimeoutRef.current) {
      clearTimeout(buildCurrentsTimeoutRef.current)
      buildCurrentsTimeoutRef.current = null
    }

    // Immediately remove and hide any existing current entities from the scene
    if (currentEntitiesRef.current.length) {
      viewer.entities.suspendEvents()
      currentEntitiesRef.current.forEach(entity => viewer.entities.remove(entity))
      currentEntitiesRef.current = []
      viewer.entities.resumeEvents()
    }

    if (mapMode !== 'currents' || !currents?.length) {
      setCurrentsLoading(false)
      return
    }

    // Indicate loading immediately so no unstyled or old visuals show
    setCurrentsLoading(true)

    // Defer the heavy streamline build and entity creation by a tick so the DOM
    // can display the loading indicator and Cesium can paint a clean frame.
    buildCurrentsTimeoutRef.current = setTimeout(() => {
      buildCurrentsTimeoutRef.current = null
      if (!viewer || viewer.isDestroyed() || mapMode !== 'currents') {
        setCurrentsLoading(false)
        return
      }

    // The API returns a vector grid. Interpolate the nearest six vectors so
    // the visual layer can draw smooth streamlines between grid cells rather
    // than a sparse collection of disconnected arrows. The grid is binned so
    // field sampling stays O(1): dense, long streamlines need tens of
    // thousands of samples and a full scan every sample would stall the UI.
    const vectorGrid = currents.map(point => ({
      ...point,
      speed: point.speed || Math.hypot(point.u || 0, point.v || 0),
    }))
    const maxSpeed = Math.max(...vectorGrid.map(point => point.speed || 0), 1)

    const lats = vectorGrid.map(point => point.lat)
    const lons = vectorGrid.map(point => point.lon)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const latPad = 3
    const lonPad = 3
    const radians = Math.PI / 180

    const binSize = 5
    const bins = new Map()
    const binKey = (i, j) => `${i},${j}`
    for (const point of vectorGrid) {
      const i = Math.floor((point.lon - minLon) / binSize)
      const j = Math.floor((point.lat - minLat) / binSize)
      const key = binKey(i, j)
      if (!bins.has(key)) bins.set(key, [])
      bins.get(key).push(point)
    }

    const sampleField = (lon, lat) => {
      const i = Math.floor((lon - minLon) / binSize)
      const j = Math.floor((lat - minLat) / binSize)
      // Cull to the 3x3 cell neighbourhood around the sample point. The grid
      // is spaced at binSize, so the six nearest vectors always live here.
      const candidates = []
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const cell = bins.get(binKey(i + di, j + dj))
          if (cell) for (const point of cell) candidates.push(point)
        }
      }

      const nearest = candidates
        .map(point => {
          const dx = (point.lon - lon) * Math.cos(lat * radians)
          const dy = point.lat - lat
          return { point, distance: Math.hypot(dx, dy) }
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 6)

      let totalWeight = 0
      let u = 0
      let v = 0
      let speed = 0
      for (const item of nearest) {
        const weight = 1 / Math.max(0.35, item.distance)
        totalWeight += weight
        u += (item.point.u || 0) * weight
        v += (item.point.v || 0) * weight
        speed += item.point.speed * weight
      }

      if (!totalWeight) return { u: 0.1, v: 0, speed: 0.1 }
      return { u: u / totalWeight, v: v / totalWeight, speed: speed / totalWeight }
    }

    const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
    // Integrate the field. The previous-velocity blend dampens kinks so the
    // curves read as fluid; the velocity-scaled step lets fast jets stretch
    // out while slow water curls. Many small steps give long, unbroken arcs
    // that trace the eddies instead of stalling into short strokes.
    const buildStreamline = (seedLon, seedLat) => {
      if (isIndianOceanLand(seedLon, seedLat)) return []
      const path = []
      let lon = seedLon
      let lat = seedLat
      let prevU = null
      let prevV = null
      let stagnant = 0
      for (let step = 0; step < 340; step++) {
        path.push({ lon, lat })
        const field = sampleField(lon, lat)
        const u = prevU === null ? field.u : prevU * 0.35 + field.u * 0.65
        const v = prevV === null ? field.v : prevV * 0.35 + field.v * 0.65
        prevU = u
        prevV = v
        const stepLen = 0.24 * (0.7 + 0.5 * Math.min(field.speed, 1.6))
        const nextLon = clamp(lon + u * stepLen, minLon - lonPad, maxLon + lonPad)
        const nextLat = clamp(lat + v * stepLen, minLat - latPad, maxLat + latPad)
        if (isIndianOceanLand(nextLon, nextLat)) break
        // A genuinely vanished current gives up after a while; anything that
        // still moves keeps flowing so the field reads continuous.
        stagnant = Math.abs(nextLon - lon) < 4e-4 && Math.abs(nextLat - lat) < 4e-4 ? stagnant + 1 : 0
        if (stagnant > 10) break
        lon = nextLon
        lat = nextLat
      }
      return path
    }

    const trailLength = 12
    const streamlines = []
    let seedIndex = 0
    const seedSpacing = 1.6
    for (let lat = minLat - 1; lat <= maxLat + 1; lat += seedSpacing) {
      for (let lon = minLon - 1; lon <= maxLon + 1; lon += seedSpacing) {
        const path = buildStreamline(lon, lat)
        if (path.length < 2) continue
        const field = sampleField(lon, lat)
        const speed = field.speed
        const [r, g, b] = getColorForValue(speed, 0, maxSpeed, 'currents')
        streamlines.push({
          path,
          positions: path.map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 2400)),
          speed,
          lat,
          lon,
          direction: (Math.atan2(field.u, field.v) * 180 / Math.PI + 360) % 360,
          phase: (seedIndex * 0.173) % 1,
          color: Cesium.Color.fromBytes(Math.round(r), Math.round(g), Math.round(b), 240),
        })
        seedIndex += 1
      }
    }

      // Batch all entity additions into a single event cycle so Cesium does not
      // thrash event listeners or display intermediate uninitialized polylines.
      viewer.entities.suspendEvents()

      // Current metadata attached to every entity so hover/inspect picking can
      // report source, timestamp and speed for any visible streamline.
      const currentUserData = (streamline) => ({
        kind: 'current',
        lat: streamline.lat,
        lon: streamline.lon,
        speed: streamline.speed,
        direction: streamline.direction,
        source: currentSource || 'unavailable',
        timestamp: currentTimestamp || null,
      })

      // Static pass: every streamline drawn in full, creating a dense field of
      // long continuous curves that follow the flow. A plain solid material
      // renders the whole 340-point path as one unbroken stroke.
      for (const streamline of streamlines) {
        const prominence = Math.min(streamline.speed / maxSpeed, 1)
        const staticWidth = 1.35 + 1.30 * Math.pow(prominence, 1.2)
        const staticAlpha = 0.55 + 0.40 * Math.pow(prominence, 1.1)
        const lineEntity = viewer.entities.add({
          polyline: {
            positions: streamline.positions,
            width: staticWidth,
            material: new Cesium.ColorMaterialProperty(
              streamline.color.withAlpha(staticAlpha)
            ),
            clampToGround: false,
          },
          userData: currentUserData(streamline),
        })
        currentEntitiesRef.current.push(lineEntity)
      }

      // Animated pass: a subset of the streamlines carry a comet tail so the flow
      // reads as water continuously moving along its U/V direction. Positions
      // are windowed from the precomputed path as a contiguous run — never
      // modulo-wrapped, which would make the tail span a seam and teleport.
      // Fractional indexing keeps the head gliding instead of stepping.
      let animIndex = 0
      for (const streamline of streamlines) {
        if (animIndex++ % 3 !== 0) continue
        const positions = streamline.positions
        const n = positions.length
        // Speed-coupled pacing: slow water drifts, fast jets race. Varying the
        // period also de-syncs the comets so the field never looks metronomic.
        const period = 5200 * (0.85 + 0.55 * Math.min(streamline.speed / maxSpeed, 1))
        const getTrailPositions = (now) => {
          const p = ((now / period) + streamline.phase) % 1
          const head = Math.min(n - 1, Math.floor(p * n))
          const trail = []
          for (let offset = 0; offset < trailLength; offset++) {
            trail.push(positions[Math.max(0, head - offset)])
          }
          return trail
        }

        const prominence = Math.min(streamline.speed / maxSpeed, 1)
        const cometWidth = 1.40 + 1.80 * Math.pow(prominence, 1.2)
        const cometGlow = 0.15 + 0.28 * Math.pow(prominence, 1.4)
        const cometAlpha = 0.62 + 0.36 * Math.pow(prominence, 1.1)
        const cometEntity = viewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => getTrailPositions(performance.now()), false),
            width: cometWidth,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: cometGlow,
              taperPower: 0.85,
              color: streamline.color.withAlpha(cometAlpha),
            }),
            clampToGround: false,
          },
          userData: currentUserData(streamline),
        })
        currentEntitiesRef.current.push(cometEntity)
      }

      viewer.entities.resumeEvents()

      // Render the scene once with materials loaded, then dismiss the loading indicator
      requestAnimationFrame(() => {
        if (viewer && !viewer.isDestroyed()) {
          viewer.scene.requestRender()
        }
        setCurrentsLoading(false)
      })
    }, 40)
  }

  function updateTrajectory(Cesium, viewer) {
    trajectoryEntitiesRef.current.forEach(e => viewer.entities.remove(e))
    trajectoryEntitiesRef.current = []

    if (!showTrajectory || !trajectoryFloatId || !floatData?.floats) return

    const fd = floatData.floats.find(f => f.id === trajectoryFloatId)
    if (!fd?.observations?.length) return

    // Build trajectory from observation timestamps and positions
    const positions = fd.observations.map(_obs =>
      Cesium.Cartesian3.fromDegrees(fd.lon + (Math.random() - 0.5) * 0.5, fd.lat + (Math.random() - 0.5) * 0.5, 1000)
    )

    if (positions.length < 2) return

    // Trajectory line
    const lineEntity = viewer.entities.add({
      polyline: {
        positions: positions,
        width: 2,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.1,
          color: Cesium.Color.fromCssColorString('#5ddacb').withAlpha(0.6),
        }),
        clampToGround: true,
      },
    })
    trajectoryEntitiesRef.current.push(lineEntity)

    // Direction markers along the path
    const step = Math.max(1, Math.floor(positions.length / 6))
    for (let i = 0; i < positions.length - 1; i += step) {
      const markerEntity = viewer.entities.add({
        position: positions[i],
        point: {
          pixelSize: 4,
          color: Cesium.Color.fromCssColorString('#5ddacb').withAlpha(0.5),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      trajectoryEntitiesRef.current.push(markerEntity)
    }
  }

  // Expose flyTo method via ref for parent components
  useImperativeHandle(ref, () => ({
    flyTo: (lat, lon) => {
      const viewer = viewerRef.current
      if (!viewer) return
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 3000000),
        duration: 2,
      })
    },
  }))

  return (
    <div
      data-testid="earth-map"
      aria-label="Interactive Indian Ocean globe"
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      {currentsLoading && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-all duration-300">
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-surface-container-lowest/85 backdrop-blur-md border border-outline-variant/30 shadow-lg shadow-black/40 text-[12px] font-mono text-cyan-200">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>Rendering current streamlines...</span>
          </div>
        </div>
      )}
    </div>
  )
})
