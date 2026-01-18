import type { FFTData } from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'

interface WaterfallViewProps {
  frequency: number | null
  frequencyName?: string
  isActive: boolean
  isScanning?: boolean
  subscribeFFT: (frequency?: number) => void
  unsubscribeFFT: () => void
  fftRunning: boolean
  latestFFTData: FFTData | null
}

const MAX_HISTORY_ROWS = 150
const DEFAULT_FREQUENCY = 137500000 // 137.5 MHz

export function WaterfallView({
  frequency,
  frequencyName,
  isActive,
  isScanning = false,
  subscribeFFT,
  unsubscribeFFT,
  fftRunning,
  latestFFTData,
}: WaterfallViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fftHistory, setFftHistory] = useState<FFTData[]>([])
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [currentConfig, setCurrentConfig] = useState<{
    centerFreq: number
    bandwidth: number
  } | null>(null)
  const lastDataRef = useRef<FFTData | null>(null)
  const lastProcessedTimestamp = useRef<number>(0)

  // Process incoming FFT data from props
  useEffect(() => {
    if (!latestFFTData || latestFFTData.timestamp === lastProcessedTimestamp.current) {
      return
    }

    lastProcessedTimestamp.current = latestFFTData.timestamp
    lastDataRef.current = latestFFTData
    setCurrentConfig({ centerFreq: latestFFTData.centerFreq, bandwidth: 200000 })

    setFftHistory((prev) => {
      const newHistory = [...prev, latestFFTData]
      if (newHistory.length > MAX_HISTORY_ROWS) {
        return newHistory.slice(newHistory.length - MAX_HISTORY_ROWS)
      }
      return newHistory
    })
  }, [latestFFTData])

  // Subscribe to FFT data - retry if not running
  useEffect(() => {
    const targetFreq = frequency || DEFAULT_FREQUENCY

    // Initial subscription attempt
    subscribeFFT(targetFreq)
    setIsSubscribed(true)

    // Retry subscription if FFT isn't running after initial attempt
    // This handles the case where WebSocket wasn't ready on first try
    const retryTimer = setTimeout(() => {
      if (!fftRunning) {
        subscribeFFT(targetFreq)
      }
    }, 1000)

    return () => {
      clearTimeout(retryTimer)
      unsubscribeFFT()
      setIsSubscribed(false)
    }
  }, [subscribeFFT, unsubscribeFFT, fftRunning, frequency]) // Re-run when functions change (e.g., after reconnect)

  // Update frequency when it changes (e.g., during a satellite pass)
  useEffect(() => {
    if (frequency && isSubscribed) {
      subscribeFFT(frequency)
    }
  }, [frequency, isSubscribed, subscribeFFT])

  // Auto-retry if FFT should be running but isn't
  useEffect(() => {
    if (isSubscribed && !fftRunning) {
      const retryTimer = setInterval(() => {
        const targetFreq = frequency || DEFAULT_FREQUENCY
        subscribeFFT(targetFreq)
      }, 3000)
      return () => clearInterval(retryTimer)
    }
  }, [isSubscribed, fftRunning, frequency, subscribeFFT])

  // Color mapping for waterfall display (blue -> cyan -> green -> yellow -> red)
  const getWaterfallColor = useCallback((normalized: number): string => {
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

  // Draw the waterfall display
  const drawWaterfall = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    const historyHeight = height - 60 // Reserve space for frequency scale

    // Clear canvas
    ctx.fillStyle = '#1a2332'
    ctx.fillRect(0, 0, width, height)

    if (fftHistory.length === 0) {
      // No data yet
      ctx.fillStyle = '#64748b'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(
        fftRunning ? 'Waiting for FFT data...' : 'FFT stream not running',
        width / 2,
        height / 2 - 20
      )
      ctx.font = '12px sans-serif'
      ctx.fillText('Click to start waterfall', width / 2, height / 2 + 10)
      return
    }

    // Draw waterfall history
    const rowHeight = Math.max(1, historyHeight / Math.max(fftHistory.length, 50))

    // Use fixed reference range for consistent display
    // Typical SDR signals: noise floor around -40 to -30 dB, strong signals up to 0 dB
    const refMin = -50 // Noise floor reference
    const refMax = 0 // Strong signal reference

    fftHistory.forEach((row, rowIndex) => {
      const y = rowIndex * rowHeight
      const binWidth = width / row.bins.length

      row.bins.forEach((power, binIndex) => {
        const x = binIndex * binWidth
        // Normalize power to 0-1 range using fixed reference
        const normalized = Math.max(0, Math.min(1, (power - refMin) / (refMax - refMin)))
        ctx.fillStyle = getWaterfallColor(normalized)
        ctx.fillRect(x, y, binWidth + 1, rowHeight + 1)
      })
    })

    // Draw frequency scale at bottom
    ctx.fillStyle = '#1a2332'
    ctx.fillRect(0, historyHeight, width, 60)

    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, historyHeight)
    ctx.lineTo(width, historyHeight)
    ctx.stroke()

    // Frequency labels
    const centerFreqMHz = (currentConfig?.centerFreq || frequency || DEFAULT_FREQUENCY) / 1e6
    const bandwidthMHz = (currentConfig?.bandwidth || 50000) / 1e6

    ctx.fillStyle = '#94a3b8'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'

    const labelCount = 5
    for (let i = 0; i < labelCount; i++) {
      const x = (width / (labelCount - 1)) * i
      const freqOffset = (i / (labelCount - 1) - 0.5) * bandwidthMHz
      const labelFreq = (centerFreqMHz + freqOffset).toFixed(3)
      ctx.fillText(`${labelFreq}`, x, historyHeight + 20)

      // Tick marks
      ctx.beginPath()
      ctx.moveTo(x, historyHeight)
      ctx.lineTo(x, historyHeight + 5)
      ctx.stroke()
    }

    // Center frequency label with optional name
    ctx.fillStyle = isScanning ? '#8b5cf6' : '#22c55e'
    ctx.font = 'bold 12px monospace'
    const centerLabel = frequencyName
      ? `${centerFreqMHz.toFixed(3)} MHz - ${frequencyName}`
      : `Center: ${centerFreqMHz.toFixed(3)} MHz`
    ctx.fillText(centerLabel, width / 2, historyHeight + 40)

    // Status indicator
    ctx.fillStyle = fftRunning ? (isScanning ? '#8b5cf6' : '#22c55e') : '#64748b'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    const statusText = fftRunning
      ? isActive
        ? 'RECEIVING'
        : isScanning
          ? 'SCANNING'
          : 'MONITORING'
      : 'OFFLINE'
    ctx.fillText(statusText, 10, historyHeight + 40)

    // Signal strength indicator (current peak)
    if (lastDataRef.current) {
      const peakValue = lastDataRef.current.maxPower
      ctx.fillStyle = '#94a3b8'
      ctx.textAlign = 'right'
      ctx.fillText(`Peak: ${peakValue.toFixed(1)} dB`, width - 10, historyHeight + 40)
    }
  }, [fftHistory, frequency, frequencyName, isActive, isScanning, fftRunning, currentConfig, getWaterfallColor])

  // Redraw on data change
  useEffect(() => {
    drawWaterfall()
  }, [drawWaterfall])

  // Handle click to start/restart FFT
  const handleClick = useCallback(() => {
    const targetFreq = frequency || DEFAULT_FREQUENCY
    subscribeFFT(targetFreq)
    setIsSubscribed(true)
  }, [frequency, subscribeFFT])

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={600}
        height={350}
        className="rounded-lg bg-bg-secondary cursor-pointer"
        style={{ width: '100%', height: 'auto' }}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
        role="button"
        tabIndex={0}
      />
      <div className="absolute top-2 right-2 flex items-center gap-2 bg-bg-primary/80 px-2 py-1 rounded text-xs">
        <span
          className={`w-2 h-2 rounded-full ${fftRunning ? (isActive ? 'bg-success animate-pulse' : isScanning ? 'bg-purple animate-pulse' : 'bg-accent') : 'bg-text-muted'}`}
        />
        <span className="text-text-secondary">
          {fftRunning
            ? isActive
              ? 'Signal Active'
              : isScanning
                ? 'Scanning'
                : 'Monitoring'
            : 'Offline'}
        </span>
      </div>
    </div>
  )
}
