import type { GlobeState, SatellitePass } from '@/types'
import { useCallback, useEffect, useRef } from 'react'
import { WaterfallView } from './WaterfallView'

interface SatelliteTrackingProps {
  globeState: GlobeState | null
  currentPass?: SatellitePass | null
}

// Sky view canvas component
function SkyView({ globeState }: { globeState: GlobeState | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const drawSkyView = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !globeState) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) / 2 - 20

    // Clear canvas
    ctx.fillStyle = '#1a2332'
    ctx.fillRect(0, 0, width, height)

    // Draw concentric elevation circles (90°, 60°, 30°, 0°)
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    for (let elev = 0; elev <= 90; elev += 30) {
      const r = radius * (1 - elev / 90)
      ctx.beginPath()
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2)
      ctx.stroke()

      // Labels
      if (elev > 0 && elev < 90) {
        ctx.fillStyle = '#64748b'
        ctx.font = '10px sans-serif'
        ctx.fillText(`${elev}°`, centerX + 4, centerY - r + 12)
      }
    }

    // Draw cardinal directions
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(centerX, centerY - radius)
    ctx.lineTo(centerX, centerY + radius)
    ctx.moveTo(centerX - radius, centerY)
    ctx.lineTo(centerX + radius, centerY)
    ctx.stroke()

    // Cardinal labels
    ctx.fillStyle = '#94a3b8'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('N', centerX, centerY - radius - 5)
    ctx.fillText('S', centerX, centerY + radius + 15)
    ctx.fillText('E', centerX + radius + 10, centerY + 4)
    ctx.fillText('W', centerX - radius - 10, centerY + 4)

    // Draw horizon circle
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()

    // Station marker at center
    ctx.fillStyle = '#22c55e'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2)
    ctx.fill()

    // Draw satellites
    for (const sat of globeState.satellites) {
      // Calculate position in sky view
      // This is a simplified calculation - in reality you'd need proper AZ/EL
      const stationLat = globeState.station.latitude
      const stationLon = globeState.station.longitude

      // Rough approximation of azimuth/elevation from lat/lon difference
      const latDiff = sat.latitude - stationLat
      const lonDiff = sat.longitude - stationLon

      // Very simplified - assumes satellite is visible if within ~30 degrees
      const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff)
      if (distance > 40) continue // Satellite too far away to be visible

      // Rough elevation estimate (0 at horizon, 90 at zenith)
      const elevation = Math.max(0, 90 - distance * 3)
      const azimuth = Math.atan2(lonDiff, latDiff) // Radians from north

      // Convert to canvas coordinates
      const r = radius * (1 - elevation / 90)
      const x = centerX + r * Math.sin(azimuth)
      const y = centerY - r * Math.cos(azimuth)

      // Draw satellite
      const color = sat.signalType === 'sstv' ? '#8b5cf6' : '#3b82f6'
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.fill()

      // Label
      ctx.fillStyle = '#f1f5f9'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(sat.name, x, y - 12)
    }
  }, [globeState])

  useEffect(() => {
    drawSkyView()
  }, [drawSkyView])

  // Redraw on animation frame for smoother updates
  useEffect(() => {
    let animationId: number

    const animate = () => {
      drawSkyView()
      animationId = requestAnimationFrame(animate)
    }

    animate()
    return () => cancelAnimationFrame(animationId)
  }, [drawSkyView])

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={400}
      className="w-full max-w-[400px] rounded-lg bg-bg-secondary"
    />
  )
}

export function SatelliteTracking({ globeState, currentPass }: SatelliteTrackingProps) {
  const isCapturing = !!currentPass
  const currentFrequency = currentPass?.satellite?.frequency ?? null

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Live Satellite Tracking</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-2">Sky View</h3>
          <div className="flex justify-center">
            <SkyView globeState={globeState} />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-text-secondary mb-2">Waterfall</h3>
          <WaterfallView frequency={currentFrequency} isActive={isCapturing} />
        </div>
      </div>
      <div className="flex flex-wrap gap-6 mt-4 justify-center">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="w-3 h-3 rounded-full bg-success" />
          <span>Ground Station</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="w-3 h-3 rounded-full bg-accent" />
          <span>NOAA (APT)</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="w-3 h-3 rounded-full bg-purple" />
          <span>ISS (SSTV)</span>
        </div>
      </div>
    </div>
  )
}
