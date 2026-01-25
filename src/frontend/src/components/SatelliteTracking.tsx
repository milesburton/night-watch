import { cn } from '@/lib/utils'
import type { FFTData, GlobeState, SatellitePass, SystemStatus } from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Tooltip } from './Tooltip'
import { WaterfallView } from './WaterfallView'

const SSTV_2M_FREQUENCIES = [
  { freq: 144500000, label: '144.500', tooltip: 'SSB SSTV calling frequency (UK/EU)' },
  { freq: 145500000, label: '145.500', tooltip: 'FM SSTV calling frequency' },
]

type ViewMode = 'satellite' | 'sstv-2m'

interface SatelliteTrackingProps {
  globeState: GlobeState | null
  currentPass?: SatellitePass | null
  systemStatus?: SystemStatus
  scanningFrequency?: number
  scanningFrequencyName?: string
  subscribeFFT: (frequency?: number) => void
  unsubscribeFFT: () => void
  fftRunning: boolean
  fftError: string | null
  latestFFTData: FFTData | null
  onFrequencyChange?: (freq: number | null, mode: ViewMode) => void
}

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
    const radius = Math.min(width, height) / 2 - 15

    ctx.fillStyle = '#1a2332'
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    for (let elev = 0; elev <= 90; elev += 30) {
      const r = radius * (1 - elev / 90)
      ctx.beginPath()
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2)
      ctx.stroke()

      if (elev > 0 && elev < 90) {
        ctx.fillStyle = '#64748b'
        ctx.font = '9px sans-serif'
        ctx.fillText(`${elev}°`, centerX + 3, centerY - r + 10)
      }
    }

    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(centerX, centerY - radius)
    ctx.lineTo(centerX, centerY + radius)
    ctx.moveTo(centerX - radius, centerY)
    ctx.lineTo(centerX + radius, centerY)
    ctx.stroke()

    ctx.fillStyle = '#94a3b8'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('N', centerX, centerY - radius - 3)
    ctx.fillText('S', centerX, centerY + radius + 10)
    ctx.fillText('E', centerX + radius + 8, centerY + 3)
    ctx.fillText('W', centerX - radius - 8, centerY + 3)

    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = '#22c55e'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2)
    ctx.fill()

    for (const sat of globeState.satellites) {
      const stationLat = globeState.station.latitude
      const stationLon = globeState.station.longitude

      const latDiff = sat.latitude - stationLat
      const lonDiff = sat.longitude - stationLon

      const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff)
      if (distance > 40) continue

      const elevation = Math.max(0, 90 - distance * 3)
      const azimuth = Math.atan2(lonDiff, latDiff)

      const r = radius * (1 - elevation / 90)
      const x = centerX + r * Math.sin(azimuth)
      const y = centerY - r * Math.cos(azimuth)

      const color = sat.signalType === 'sstv' ? '#8b5cf6' : '#3b82f6'
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#f1f5f9'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(sat.name, x, y - 10)
    }
  }, [globeState])

  useEffect(() => {
    drawSkyView()
  }, [drawSkyView])

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
      width={350}
      height={350}
      className="w-full h-full rounded bg-bg-secondary"
      data-testid="sky-view"
    />
  )
}

function SpectrumWaterfall({
  frequency,
  frequencyName,
  isScanning,
  fftRunning,
  latestFFTData,
}: {
  frequency: number
  frequencyName?: string
  isScanning: boolean
  fftRunning: boolean
  latestFFTData: FFTData | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fftHistory, setFftHistory] = useState<FFTData[]>([])
  const lastProcessedTimestamp = useRef<number>(0)

  const MAX_HISTORY_ROWS = 100
  const SPECTRUM_HEIGHT = 80

  useEffect(() => {
    if (!latestFFTData || latestFFTData.timestamp === lastProcessedTimestamp.current) {
      return
    }
    lastProcessedTimestamp.current = latestFFTData.timestamp
    setFftHistory((prev) => {
      const newHistory = [...prev, latestFFTData]
      if (newHistory.length > MAX_HISTORY_ROWS) {
        return newHistory.slice(newHistory.length - MAX_HISTORY_ROWS)
      }
      return newHistory
    })
  }, [latestFFTData])

  const getColor = useCallback((normalized: number): string => {
    if (normalized < 0.2) {
      const t = normalized / 0.2
      return `rgb(0, 0, ${Math.floor(30 + t * 170)})`
    }
    if (normalized < 0.4) {
      const t = (normalized - 0.2) / 0.2
      return `rgb(0, ${Math.floor(t * 200)}, ${Math.floor(200 - t * 50)})`
    }
    if (normalized < 0.6) {
      const t = (normalized - 0.4) / 0.2
      return `rgb(${Math.floor(t * 200)}, ${Math.floor(200 + t * 55)}, ${Math.floor(150 - t * 150)})`
    }
    if (normalized < 0.8) {
      const t = (normalized - 0.6) / 0.2
      return `rgb(${Math.floor(200 + t * 55)}, ${Math.floor(255 - t * 100)}, 0)`
    }
    const t = (normalized - 0.8) / 0.2
    return `rgb(255, ${Math.floor(155 - t * 155)}, 0)`
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    const waterfallHeight = height - SPECTRUM_HEIGHT - 40

    ctx.fillStyle = '#0f1419'
    ctx.fillRect(0, 0, width, height)

    let refMin = -100
    let refMax = -20
    if (fftHistory.length > 0) {
      const recentRows = fftHistory.slice(-20)
      for (const row of recentRows) {
        if (row.minPower > -120) refMin = Math.min(refMin, row.minPower)
        refMax = Math.max(refMax, row.maxPower)
      }
      refMin = Math.max(refMin - 5, -110)
      refMax = Math.min(refMax + 5, 0)
      if (refMax - refMin < 20) {
        const mid = (refMin + refMax) / 2
        refMin = mid - 15
        refMax = mid + 15
      }
    }

    const centerFreqMHz = frequency / 1e6
    const bandwidthMHz = 0.2

    if (fftHistory.length > 0) {
      const rowHeight = Math.max(1, waterfallHeight / Math.min(fftHistory.length, MAX_HISTORY_ROWS))

      fftHistory.forEach((row, rowIndex) => {
        const y = SPECTRUM_HEIGHT + rowIndex * rowHeight
        const binWidth = width / row.bins.length

        row.bins.forEach((power, binIndex) => {
          const x = binIndex * binWidth
          const normalized = Math.max(0, Math.min(1, (power - refMin) / (refMax - refMin)))
          ctx.fillStyle = getColor(normalized)
          ctx.fillRect(x, y, binWidth + 1, rowHeight + 1)
        })
      })
    }

    ctx.fillStyle = 'rgba(15, 20, 25, 0.85)'
    ctx.fillRect(0, 0, width, SPECTRUM_HEIGHT)

    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = (SPECTRUM_HEIGHT / 4) * i
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    ctx.fillStyle = '#64748b'
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const y = (SPECTRUM_HEIGHT / 4) * i
      const db = refMax - (i * (refMax - refMin)) / 4
      ctx.fillText(`${db.toFixed(0)}`, 25, y + 4)
    }

    if (latestFFTData && latestFFTData.bins.length > 0) {
      ctx.beginPath()
      ctx.strokeStyle = '#8b5cf6'
      ctx.lineWidth = 2

      latestFFTData.bins.forEach((power, i) => {
        const x = (i / latestFFTData.bins.length) * width
        const normalized = Math.max(0, Math.min(1, (power - refMin) / (refMax - refMin)))
        const y = SPECTRUM_HEIGHT - normalized * SPECTRUM_HEIGHT

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })
      ctx.stroke()

      ctx.lineTo(width, SPECTRUM_HEIGHT)
      ctx.lineTo(0, SPECTRUM_HEIGHT)
      ctx.closePath()
      const gradient = ctx.createLinearGradient(0, 0, 0, SPECTRUM_HEIGHT)
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.4)')
      gradient.addColorStop(1, 'rgba(139, 92, 246, 0.05)')
      ctx.fillStyle = gradient
      ctx.fill()
    }

    const scaleY = height - 40
    ctx.fillStyle = '#0f1419'
    ctx.fillRect(0, scaleY, width, 40)

    ctx.strokeStyle = '#334155'
    ctx.beginPath()
    ctx.moveTo(0, scaleY)
    ctx.lineTo(width, scaleY)
    ctx.stroke()

    ctx.fillStyle = '#94a3b8'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'

    for (let i = 0; i < 5; i++) {
      const x = (width / 4) * i
      const freqOffset = (i / 4 - 0.5) * bandwidthMHz
      const labelFreq = (centerFreqMHz + freqOffset).toFixed(3)
      ctx.fillText(`${labelFreq}`, x, scaleY + 20)

      ctx.beginPath()
      ctx.moveTo(x, scaleY)
      ctx.lineTo(x, scaleY + 5)
      ctx.stroke()
    }

    ctx.strokeStyle = '#8b5cf6'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(width / 2, 0)
    ctx.lineTo(width / 2, scaleY)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = isScanning ? '#8b5cf6' : fftRunning ? '#22c55e' : '#64748b'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'left'
    const statusText = isScanning ? '● SCANNING' : fftRunning ? '● MONITORING' : '○ OFFLINE'
    ctx.fillText(statusText, 10, scaleY + 35)

    if (frequencyName) {
      ctx.fillStyle = '#8b5cf6'
      ctx.font = '10px sans-serif'
      ctx.fillText(frequencyName, 100, scaleY + 35)
    }

    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'right'
    if (latestFFTData) {
      ctx.fillText(`Peak: ${latestFFTData.maxPower.toFixed(1)} dB`, width - 10, scaleY + 35)
    }
  }, [fftHistory, latestFFTData, frequency, frequencyName, isScanning, fftRunning, getColor])

  useEffect(() => {
    draw()
  }, [draw])

  const handleClick = useCallback(() => {
    // Click handled by parent component
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={1200}
      height={400}
      className="w-full rounded-lg cursor-pointer"
      style={{ height: 'auto', aspectRatio: '3 / 1' }}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      role="button"
      tabIndex={0}
      data-testid="spectrum-waterfall"
    />
  )
}

export function SatelliteTracking({
  globeState,
  currentPass,
  systemStatus,
  scanningFrequency,
  scanningFrequencyName,
  subscribeFFT,
  unsubscribeFFT,
  fftRunning,
  fftError,
  latestFFTData,
  onFrequencyChange,
}: SatelliteTrackingProps) {
  const [mode, setMode] = useState<ViewMode>('satellite')
  const [sstvFreqIndex, setSstvFreqIndex] = useState(0)

  const isCapturing = !!currentPass
  const isScanning = systemStatus === 'scanning'

  useEffect(() => {
    if (systemStatus === 'recording' || systemStatus === 'decoding' || systemStatus === 'waiting') {
      setMode('satellite')
    } else if (systemStatus === 'scanning') {
      setMode('sstv-2m')
    }
  }, [systemStatus])

  const getCurrentFrequency = useCallback(() => {
    if (mode === 'satellite') {
      return currentPass?.satellite?.frequency ?? 137500000
    }
    // 2M SSTV mode: use scanning frequency if scanner is active, else manual selection
    if (isScanning && scanningFrequency) {
      return scanningFrequency
    }
    return SSTV_2M_FREQUENCIES[sstvFreqIndex]?.freq ?? 145500000
  }, [mode, currentPass, sstvFreqIndex, isScanning, scanningFrequency])

  const currentFrequency = getCurrentFrequency()

  useEffect(() => {
    onFrequencyChange?.(currentFrequency, mode)
  }, [currentFrequency, mode, onFrequencyChange])

  useEffect(() => {
    subscribeFFT(currentFrequency)
    return () => {
      unsubscribeFFT()
    }
  }, [currentFrequency, subscribeFFT, unsubscribeFFT])

  const tabs = [
    {
      id: 'satellite' as const,
      label: 'Satellites',
      color: 'accent',
      tooltip: 'Track NOAA weather satellites and ISS passes',
    },
    {
      id: 'sstv-2m' as const,
      label: '2M SSTV',
      color: 'purple',
      tooltip: 'Monitor 2-meter amateur radio SSTV frequencies',
    },
  ]

  return (
    <div className="card" data-testid="satellite-tracking">
      <div className="border-b border-border">
        <nav className="flex -mb-px" aria-label="Tabs">
          {tabs.map((tab) => (
            <Tooltip key={tab.id} content={tab.tooltip} position="bottom">
              <button
                type="button"
                onClick={() => setMode(tab.id)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0',
                  mode === tab.id
                    ? tab.color === 'purple'
                      ? 'border-purple text-purple'
                      : 'border-accent text-accent'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                )}
              >
                {tab.label}
              </button>
            </Tooltip>
          ))}

          {mode === 'sstv-2m' && (
            <div className="flex items-center gap-2 ml-auto pr-4">
              <span className="text-xs text-text-muted">Freq:</span>
              {SSTV_2M_FREQUENCIES.map((f, idx) => (
                <Tooltip key={f.freq} content={f.tooltip} position="bottom">
                  <button
                    type="button"
                    onClick={() => setSstvFreqIndex(idx)}
                    className={cn(
                      'px-2 py-1 text-xs font-mono rounded transition-colors',
                      sstvFreqIndex === idx
                        ? 'bg-purple text-white'
                        : 'bg-bg-tertiary text-text-secondary hover:bg-bg-secondary'
                    )}
                  >
                    {f.label}
                  </button>
                </Tooltip>
              ))}
            </div>
          )}
        </nav>
      </div>

      <div className="p-2">
        {mode === 'satellite' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="flex justify-center items-center">
              <div className="aspect-square w-full max-w-[500px]">
                <SkyView globeState={globeState} />
              </div>
            </div>
            <div data-testid="waterfall-container" className="flex items-center justify-center">
              <div className="w-full max-w-[600px]">
                <WaterfallView
                  frequency={currentFrequency}
                  frequencyName={currentPass?.satellite?.name}
                  isActive={isCapturing}
                  isScanning={false}
                  fftRunning={fftRunning}
                  fftError={fftError}
                  latestFFTData={latestFFTData}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full">
            <SpectrumWaterfall
              frequency={currentFrequency}
              frequencyName={
                isScanning ? scanningFrequencyName : SSTV_2M_FREQUENCIES[sstvFreqIndex]?.label
              }
              isScanning={isScanning}
              fftRunning={fftRunning}
              latestFFTData={latestFFTData}
            />
          </div>
        )}
      </div>
    </div>
  )
}
