import { useEffect, useRef } from 'react'
import { getFloats } from '../services/api'

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjJGdDB6MDFMSURaZnFIRjIiLCJqdGkiOiJjY2UxYThjZi0zYThjLTRhMDktODFmOS04Yjg4NGIwZGZiNzQiLCJpZCI6NDgwNjU1LCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODg1MjMxNzZ9.MMr_DwSDj1BI5Jk1H_Dd1l23Q3BiJkjf9cNbUMw2s7I'

export default function CesiumView() {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return

    let cancelled = false

    async function init() {
      const Cesium = await import('cesium')
      window.Cesium = Cesium
      Cesium.Ion.defaultAccessToken = CESIUM_TOKEN

      if (cancelled || !containerRef.current) return

      const viewer = new Cesium.Viewer(containerRef.current, {
        terrain: Cesium.Terrain.fromWorldTerrain(),
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

      // Force Cesium to fit container
      viewer.resize()
      window.dispatchEvent(new Event('resize'))

      // Dark ocean theme
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#051522')
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#051522')
      viewer.scene.fog.enabled = true
      viewer.scene.fog.density = 0.0002
      viewer.scene.fog.screenSpaceErrorFactor = 4
      viewer.scene.globe.enableLighting = true

      // Fly to Indian Ocean
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(70, 10, 5000000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 2,
      })

      // Fetch floats and add markers
      try {
        const floatData = await getFloats(1)
        if (cancelled || !viewerRef.current) return

        floatData.floats.forEach(fd => {
          const meanDelta = fd.observations?.length
            ? fd.observations.reduce((s, o) => s + Math.abs(o.delta || 0), 0) / fd.observations.length
            : 0

          let color
          if (meanDelta < 0.5) color = Cesium.Color.fromCssColorString('#5ddacb')
          else if (meanDelta < 1.5) color = Cesium.Color.fromCssColorString('#ffb873')
          else color = Cesium.Color.fromCssColorString('#ff7c71')

          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(fd.lon, fd.lat, 1000),
            point: {
              pixelSize: 8,
              color: color,
              outlineColor: Cesium.Color.WHITE.withAlpha(0.5),
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: `#${fd.id}\nΔT: ${meanDelta.toFixed(2)}°C`,
              font: '12px monospace',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -15),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              showBackground: true,
              backgroundColor: Cesium.Color.fromCssColorString('#11212f').withAlpha(0.9),
              backgroundPadding: new Cesium.Cartesian2(6, 4),
            },
          })

          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(fd.lon, fd.lat, 1000),
            ellipse: {
              semiMajorAxis: 15000,
              semiMinorAxis: 15000,
              material: color.withAlpha(0.3),
              outline: true,
              outlineColor: color.withAlpha(0.6),
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          })
        })
      } catch (err) {
        console.error('Failed to load floats for Cesium view:', err)
      }
    }

    init()

    return () => {
      cancelled = true
      if (viewerRef.current) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }
    }
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }} />
  )
}
