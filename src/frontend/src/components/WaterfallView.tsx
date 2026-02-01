import type { FFTData } from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'

interface WaterfallViewProps {
  frequency: number | null
  frequencyName?: string
  isActive: boolean
  isScanning?: boolean
  fftRunning: boolean
  fftError?: string | null
  latestFFTData: FFTData | null
}

const MAX_HISTORY_ROWS = 150
const DEFAULT_FREQUENCY = 137_500_000

export function WaterfallView({
  frequency,
  frequencyName,
  isActive,
  isScanning = false,
  fftRunning,
  fftError,
  latestFFTData,
}: WaterfallViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fftHistory, setFftHistory] = useState<FFTData[]>([])
  const [currentConfig, setCurrentConfig] = useState<{
    centerFreq: number
    bandwidth: number
  } | null>(null)
  const lastDataRef = useRef<FFTData | null>(null)
  const lastProcessedTimestamp = useRef<number>(0)

  useEffect(() => {
    if (!latestFFTData || latestFFTData.timestamp === lastProcessedTimestamp.current) {
      return
    }

    lastProcessedTimestamp.current = latestFFTData.timestamp
    lastDataRef.current = latestFFTData
    setCurrentConfig({ centerFreq: latestFFTData.centerFreq, bandwidth: 200_000 })

    setFftHistory((prev) => {
      const newHistory = [...prev, latestFFTData]
      if (newHistory.length > MAX_HISTORY_ROWS) {
        return newHistory.slice(newHistory.length - MAX_HISTORY_ROWS)
      }
      return newHistory
    })
  }, [latestFFTData])

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

  const drawWaterfall = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    const historyHeight = height - 60

    ctx.fillStyle = '#1a2332'
    ctx.fillRect(0, 0, width, height)

    if (fftError) {
      ctx.fillStyle = '#ef4444'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('SDR Hardware Not Found', width / 2, height / 2 - 30)
      ctx.fillStyle = '#94a3b8'
      ctx.font = '12px sans-serif'
      ctx.fillText(fftError, width / 2, height / 2)
      ctx.fillText('Connect an RTL-SDR device and refresh', width / 2, height / 2 + 25)
      return
    }

    if (fftHistory.length === 0) {
      ctx.fillStyle = '#64748b'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'

      // Show capture message if actively receiving
      if (isActive && !fftRunning) {
        ctx.fillStyle = '#22c55e'
        ctx.font = 'bold 16px sans-serif'
        ctx.fillText('📡 Capturing Satellite Signal', width / 2, height / 2 - 30)
        ctx.fillStyle = '#94a3b8'
        ctx.font = '13px sans-serif'
        ctx.fillText('Waterfall paused during signal reception', width / 2, height / 2)
        ctx.font = '12px sans-serif'
        ctx.fillStyle = '#64748b'
        ctx.fillText('SDR device is exclusively recording the pass', width / 2, height / 2 + 25)
      } else {
        ctx.fillText(
          fftRunning ? 'Waiting for FFT data...' : 'FFT stream not running',
          width / 2,
          height / 2 - 20
        )
        ctx.font = '12px sans-serif'
        ctx.fillText('Click to start waterfall', width / 2, height / 2 + 10)
      }
      return
    }

    const rowHeight = Math.max(1, historyHeight / Math.max(fftHistory.length, 50))

    let allMin = -80
    let allMax = -40
    if (fftHistory.length > 0) {
      const recentRows = fftHistory.slice(-30)
      let measuredMin = 0
      let measuredMax = -150
      for (const row of recentRows) {
        if (row.minPower > -150 && row.minPower < 0) {
          measuredMin = Math.min(measuredMin, row.minPower)
        }
        if (row.maxPower > -150 && row.maxPower < 0) {
          measuredMax = Math.max(measuredMax, row.maxPower)
        }
      }
      if (measuredMin < -10 && measuredMax < 0) {
        allMin = measuredMin - 5
        allMax = measuredMax + 10
      }
      if (allMax - allMin < 30) {
        const mid = (allMin + allMax) / 2
        allMin = mid - 20
        allMax = mid + 15
      }
      allMin = Math.max(allMin, -120)
      allMax = Math.min(allMax, -10)
    }
    const refMin = allMin
    const refMax = allMax

    fftHistory.forEach((row, rowIndex) => {
      const y = rowIndex * rowHeight
      const binWidth = width / row.bins.length

      row.bins.forEach((power, binIndex) => {
        const x = binIndex * binWidth
        const normalized = Math.max(0, Math.min(1, (power - refMin) / (refMax - refMin)))
        ctx.fillStyle = getWaterfallColor(normalized)
        ctx.fillRect(x, y, binWidth + 1, rowHeight + 1)
      })
    })

    ctx.fillStyle = '#1a2332'
    ctx.fillRect(0, historyHeight, width, 60)

    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, historyHeight)
    ctx.lineTo(width, historyHeight)
    ctx.stroke()

    const centerFreqMHz = (currentConfig?.centerFreq || frequency || DEFAULT_FREQUENCY) / 1e6
    const bandwidthMHz = (currentConfig?.bandwidth || 50_000) / 1e6

    ctx.fillStyle = '#94a3b8'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'

    const labelCount = 5
    for (let i = 0; i < labelCount; i++) {
      const x = (width / (labelCount - 1)) * i
      const freqOffset = (i / (labelCount - 1) - 0.5) * bandwidthMHz
      const labelFreq = (centerFreqMHz + freqOffset).toFixed(3)
      ctx.fillText(`${labelFreq}`, x, historyHeight + 20)

      ctx.beginPath()
      ctx.moveTo(x, historyHeight)
      ctx.lineTo(x, historyHeight + 5)
      ctx.stroke()
    }

    ctx.fillStyle = isScanning ? '#8b5cf6' : '#22c55e'
    ctx.font = 'bold 12px monospace'
    const centerLabel = frequencyName
      ? `${centerFreqMHz.toFixed(3)} MHz - ${frequencyName}`
      : `Center: ${centerFreqMHz.toFixed(3)} MHz`
    ctx.fillText(centerLabel, width / 2, historyHeight + 40)

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

    if (lastDataRef.current) {
      const peakValue = lastDataRef.current.maxPower
      ctx.fillStyle = '#94a3b8'
      ctx.textAlign = 'right'
      ctx.fillText(`Peak: ${peakValue.toFixed(1)} dB`, width - 10, historyHeight + 40)
    }

    // Draw capture overlay if actively receiving but FFT stopped
    if (isActive && !fftRunning && fftHistory.length > 0) {
      // Semi-transparent overlay
      ctx.fillStyle = 'rgba(26, 35, 50, 0.85)'
      ctx.fillRect(0, 0, width, historyHeight)

      // Capture message
      ctx.fillStyle = '#22c55e'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('📡 Capturing Satellite Signal', width / 2, height / 2 - 35)

      ctx.fillStyle = '#94a3b8'
      ctx.font = '14px sans-serif'
      ctx.fillText('Waterfall paused during signal reception', width / 2, height / 2 - 5)

      ctx.font = '12px sans-serif'
      ctx.fillStyle = '#64748b'
      ctx.fillText('SDR device is exclusively recording the pass', width / 2, height / 2 + 25)
    }
  }, [
    fftHistory,
    fftError,
    frequency,
    frequencyName,
    isActive,
    isScanning,
    fftRunning,
    currentConfig,
    getWaterfallColor,
  ])

  useEffect(() => {
    drawWaterfall()
  }, [drawWaterfall])

  const handleClick = useCallback(() => {
    // Click handled by parent component
  }, [])

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
          className={`w-2 h-2 rounded-full ${fftError ? 'bg-red-500' : fftRunning ? (isActive ? 'bg-success animate-pulse' : isScanning ? 'bg-purple animate-pulse' : 'bg-accent') : 'bg-text-muted'}`}
        />
        <span className="text-text-secondary">
          {fftError
            ? 'No Hardware'
            : fftRunning
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
