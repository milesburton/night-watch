import type { CaptureProgress, FFTData, SatellitePass } from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'

interface WaterfallViewProps {
  frequency: number | null
  frequencyName?: string
  isActive: boolean
  isScanning?: boolean
  fftRunning: boolean
  fftError?: string | null
  latestFFTData: FFTData | null
  progress?: CaptureProgress | null
  currentPass?: SatellitePass | null
}

const DEFAULT_FREQUENCY = 137_500_000
const CANVAS_WIDTH = 1024
const CANVAS_HEIGHT = 600
const LABEL_HEIGHT = 60
const WATERFALL_HEIGHT = CANVAS_HEIGHT - LABEL_HEIGHT
const ROW_PX = 2

function getWaterfallColorRGB(normalized: number): [number, number, number] {
  if (normalized < 0.2) {
    const t = normalized / 0.2
    return [0, 0, Math.floor(30 + t * 170)]
  }
  if (normalized < 0.4) {
    const t = (normalized - 0.2) / 0.2
    return [0, Math.floor(t * 200), Math.floor(200 - t * 50)]
  }
  if (normalized < 0.6) {
    const t = (normalized - 0.4) / 0.2
    return [Math.floor(t * 200), Math.floor(200 + t * 55), Math.floor(150 - t * 150)]
  }
  if (normalized < 0.8) {
    const t = (normalized - 0.6) / 0.2
    return [Math.floor(200 + t * 55), Math.floor(255 - t * 100), 0]
  }
  const t = (normalized - 0.8) / 0.2
  return [255, Math.floor(155 - t * 155), 0]
}

export function WaterfallView({
  frequency,
  frequencyName,
  isActive,
  isScanning = false,
  fftRunning,
  fftError,
  latestFFTData,
  progress,
  currentPass,
}: WaterfallViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const lastProcessedTimestamp = useRef<number>(0)
  const lastDataRef = useRef<FFTData | null>(null)
  const [currentConfig, setCurrentConfig] = useState<{
    centerFreq: number
    bandwidth: number
  } | null>(null)

  const powerHistoryRef = useRef<{ min: number; max: number }[]>([])
  const POWER_HISTORY_LEN = 60

  const getOffscreen = useCallback(() => {
    if (!offscreenRef.current) {
      const oc = document.createElement('canvas')
      oc.width = CANVAS_WIDTH
      oc.height = WATERFALL_HEIGHT
      const ctx = oc.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#1a2332'
        ctx.fillRect(0, 0, CANVAS_WIDTH, WATERFALL_HEIGHT)
      }
      offscreenRef.current = oc
    }
    return offscreenRef.current
  }, [])

  const appendRow = useCallback(
    (data: FFTData, refMin: number, refMax: number) => {
      const oc = getOffscreen()
      const ctx = oc.getContext('2d')
      if (!ctx) return

      ctx.drawImage(
        oc,
        0,
        ROW_PX,
        CANVAS_WIDTH,
        WATERFALL_HEIGHT - ROW_PX,
        0,
        0,
        CANVAS_WIDTH,
        WATERFALL_HEIGHT - ROW_PX
      )

      const imageData = ctx.createImageData(CANVAS_WIDTH, ROW_PX)
      const pixels = imageData.data
      const numBins = data.bins.length

      for (let y = 0; y < ROW_PX; y++) {
        for (let x = 0; x < CANVAS_WIDTH; x++) {
          const binIndex = Math.floor((x / CANVAS_WIDTH) * numBins)
          const power = data.bins[binIndex] ?? refMin
          const normalized = Math.max(0, Math.min(1, (power - refMin) / (refMax - refMin)))
          const [r, g, b] = getWaterfallColorRGB(normalized)
          const offset = (y * CANVAS_WIDTH + x) * 4
          pixels[offset] = r
          pixels[offset + 1] = g
          pixels[offset + 2] = b
          pixels[offset + 3] = 255
        }
      }

      ctx.putImageData(imageData, 0, WATERFALL_HEIGHT - ROW_PX)
    },
    [getOffscreen]
  )

  const computeRange = useCallback((): [number, number] => {
    const hist = powerHistoryRef.current
    if (hist.length === 0) return [-80, -40]

    let measuredMin = 0
    let measuredMax = -150
    for (const h of hist) {
      if (h.min > -150 && h.min < 0) measuredMin = Math.min(measuredMin, h.min)
      if (h.max > -150 && h.max < 0) measuredMax = Math.max(measuredMax, h.max)
    }

    let allMin = -80
    let allMax = -40
    if (measuredMin < -10 && measuredMax < 0) {
      allMin = measuredMin - 5
      allMax = measuredMax + 10
    }
    if (allMax - allMin < 30) {
      const mid = (allMin + allMax) / 2
      allMin = mid - 20
      allMax = mid + 15
    }
    return [Math.max(allMin, -120), Math.min(allMax, -10)]
  }, [])

  useEffect(() => {
    if (!latestFFTData || latestFFTData.timestamp === lastProcessedTimestamp.current) return
    lastProcessedTimestamp.current = latestFFTData.timestamp
    lastDataRef.current = latestFFTData
    setCurrentConfig({ centerFreq: latestFFTData.centerFreq, bandwidth: 200_000 })

    powerHistoryRef.current.push({ min: latestFFTData.minPower, max: latestFFTData.maxPower })
    if (powerHistoryRef.current.length > POWER_HISTORY_LEN) {
      powerHistoryRef.current.shift()
    }

    const [refMin, refMax] = computeRange()
    appendRow(latestFFTData, refMin, refMax)
  }, [latestFFTData, appendRow, computeRange])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas

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

    const hasData = powerHistoryRef.current.length > 0

    if (!hasData) {
      ctx.fillStyle = '#64748b'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      if (isActive && !fftRunning) {
        ctx.fillStyle = '#22c55e'
        ctx.font = 'bold 18px sans-serif'
        ctx.fillText('🔴 Recording in Progress', width / 2, height / 2 - 50)
        if (currentPass) {
          const satelliteName = currentPass.satellite?.name || 'Unknown'
          ctx.fillStyle = '#94a3b8'
          ctx.font = '16px sans-serif'
          ctx.fillText(`Capturing ${satelliteName}`, width / 2, height / 2 - 20)
        } else if (frequencyName) {
          ctx.fillStyle = '#94a3b8'
          ctx.font = '16px sans-serif'
          ctx.fillText(`Capturing ${frequencyName}`, width / 2, height / 2 - 20)
        }
        ctx.fillStyle = '#64748b'
        ctx.font = '14px sans-serif'
        ctx.fillText('Waterfall paused during signal reception', width / 2, height / 2 + 10)
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

    const oc = offscreenRef.current
    if (oc) ctx.drawImage(oc, 0, 0, width, WATERFALL_HEIGHT)

    ctx.fillStyle = '#1a2332'
    ctx.fillRect(0, WATERFALL_HEIGHT, width, LABEL_HEIGHT)

    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, WATERFALL_HEIGHT)
    ctx.lineTo(width, WATERFALL_HEIGHT)
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
      ctx.fillText(`${labelFreq}`, x, WATERFALL_HEIGHT + 20)

      ctx.beginPath()
      ctx.moveTo(x, WATERFALL_HEIGHT)
      ctx.lineTo(x, WATERFALL_HEIGHT + 5)
      ctx.stroke()
    }

    ctx.fillStyle = isScanning ? '#8b5cf6' : '#22c55e'
    ctx.font = 'bold 12px monospace'
    const centerLabel = frequencyName
      ? `${centerFreqMHz.toFixed(3)} MHz - ${frequencyName}`
      : `Center: ${centerFreqMHz.toFixed(3)} MHz`
    ctx.fillText(centerLabel, width / 2, WATERFALL_HEIGHT + 40)

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
    ctx.fillText(statusText, 10, WATERFALL_HEIGHT + 40)

    if (lastDataRef.current) {
      const peakValue = lastDataRef.current.maxPower
      ctx.fillStyle = '#94a3b8'
      ctx.textAlign = 'right'
      ctx.fillText(`Peak: ${peakValue.toFixed(1)} dB`, width - 10, WATERFALL_HEIGHT + 40)
    }

    if (isActive && !fftRunning) {
      ctx.fillStyle = 'rgba(26, 35, 50, 0.90)'
      ctx.fillRect(0, 0, width, WATERFALL_HEIGHT)

      let yPos = height / 2 - 60

      ctx.fillStyle = '#22c55e'
      ctx.font = 'bold 22px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('🔴 Signal Detected - Recording in Progress', width / 2, yPos)

      yPos += 35

      if (currentPass) {
        const satelliteName = currentPass.satellite?.name || 'Unknown'
        const signalType = currentPass.satellite?.signalType?.toUpperCase() || ''
        const freqMhz = (currentPass.satellite?.frequency || 0) / 1e6
        ctx.fillStyle = '#94a3b8'
        ctx.font = '16px sans-serif'
        ctx.fillText(
          `Recording ${satelliteName} ${signalType} at ${freqMhz.toFixed(3)} MHz`,
          width / 2,
          yPos
        )
      } else if (frequencyName) {
        ctx.fillStyle = '#94a3b8'
        ctx.font = '16px sans-serif'
        ctx.fillText(`Recording ${frequencyName}`, width / 2, yPos)
      }

      yPos += 30

      if (progress) {
        const remaining = progress.total - progress.elapsed
        const remainingMin = Math.floor(remaining / 60)
        const remainingSec = remaining % 60

        ctx.fillStyle = '#fbbf24'
        ctx.font = 'bold 18px sans-serif'
        ctx.fillText(
          `Time Remaining: ${remainingMin}:${remainingSec.toString().padStart(2, '0')}`,
          width / 2,
          yPos
        )

        yPos += 25

        const barWidth = 400
        const barHeight = 8
        const barX = (width - barWidth) / 2
        const barY = yPos

        ctx.fillStyle = '#334155'
        ctx.fillRect(barX, barY, barWidth, barHeight)

        const progressWidth = (barWidth * progress.percentage) / 100
        ctx.fillStyle = '#22c55e'
        ctx.fillRect(barX, barY, progressWidth, barHeight)

        yPos += 30
      }

      ctx.font = '14px sans-serif'
      ctx.fillStyle = '#64748b'
      ctx.fillText('Waterfall paused - SDR device exclusively recording', width / 2, yPos)

      yPos += 20

      ctx.font = '13px sans-serif'
      ctx.fillStyle = '#475569'
      ctx.fillText('Please wait for recording to complete...', width / 2, yPos)
    }
  }, [
    fftError,
    frequency,
    frequencyName,
    isActive,
    isScanning,
    fftRunning,
    currentConfig,
    progress,
    currentPass,
  ])

  useEffect(() => {
    let rafId: number | null = null
    rafId = requestAnimationFrame(() => {
      drawCanvas()
      rafId = null
    })
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [drawCanvas])

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="rounded-lg bg-bg-secondary cursor-pointer"
        style={{ width: '100%', height: 'auto' }}
        role="button"
        tabIndex={0}
        title="Real-time frequency spectrum waterfall visualization."
        aria-label={`Waterfall display${isActive ? ' - Recording in progress' : ''} at ${frequencyName || (frequency ? (frequency / 1e6).toFixed(3) : 'Unknown')}`}
      />{' '}
      <output
        className="absolute top-2 right-2 flex items-center gap-2 bg-bg-primary/80 px-2 py-1 rounded text-xs"
        aria-live="polite"
      >
        <span
          className={`w-2 h-2 rounded-full ${fftError ? 'bg-red-500' : fftRunning ? (isActive ? 'bg-success animate-pulse' : isScanning ? 'bg-purple animate-pulse' : 'bg-accent') : 'bg-text-muted'}`}
          aria-hidden="true"
        />
        <span
          className="text-text-secondary"
          aria-label={`FFT status: ${fftError ? 'Hardware error' : fftRunning ? (isActive ? 'Signal detected and recording' : isScanning ? 'System scanning' : 'Monitoring') : 'FFT stream offline'}`}
        >
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
      </output>
    </div>
  )
}
