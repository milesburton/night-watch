import { useCallback, useEffect, useRef, useState } from 'react'

interface WaterfallViewProps {
  frequency: number | null
  isActive: boolean
}

export function WaterfallView({ frequency, isActive }: WaterfallViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fftHistory, setFftHistory] = useState<number[][]>([])
  const animationRef = useRef<number | null>(null)

  // Generate simulated FFT data when not receiving real data
  const generateSimulatedFFT = useCallback((): number[] => {
    const bins = 256
    const data: number[] = []
    const centerBin = bins / 2

    for (let i = 0; i < bins; i++) {
      // Base noise floor
      let value = -100 + Math.random() * 10

      // Add signal peak if active
      if (isActive) {
        const distanceFromCenter = Math.abs(i - centerBin)
        if (distanceFromCenter < 20) {
          // Signal strength decreases with distance from center
          const signalStrength = 40 * Math.exp(-(distanceFromCenter * distanceFromCenter) / 50)
          value += signalStrength + Math.random() * 5
        }
      }

      data.push(value)
    }

    return data
  }, [isActive])

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

    // Draw waterfall history
    const rowHeight = Math.max(1, historyHeight / Math.max(fftHistory.length, 100))

    fftHistory.forEach((row, rowIndex) => {
      const y = rowIndex * rowHeight
      const binWidth = width / row.length

      row.forEach((value, binIndex) => {
        const x = binIndex * binWidth
        // Map dB value to color (blue -> cyan -> green -> yellow -> red)
        const normalized = Math.max(0, Math.min(1, (value + 100) / 60))
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
    const centerFreqMHz = frequency ? frequency / 1e6 : 137.5
    const bandwidthMHz = 0.05 // 50 kHz bandwidth display

    ctx.fillStyle = '#94a3b8'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'

    const labelCount = 5
    for (let i = 0; i < labelCount; i++) {
      const x = (width / (labelCount - 1)) * i
      const freqOffset = (i / (labelCount - 1) - 0.5) * bandwidthMHz
      const labelFreq = (centerFreqMHz + freqOffset).toFixed(4)
      ctx.fillText(`${labelFreq}`, x, historyHeight + 20)

      // Tick marks
      ctx.beginPath()
      ctx.moveTo(x, historyHeight)
      ctx.lineTo(x, historyHeight + 5)
      ctx.stroke()
    }

    // Center frequency label
    ctx.fillStyle = '#22c55e'
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`Center: ${centerFreqMHz.toFixed(4)} MHz`, width / 2, historyHeight + 40)

    // Status indicator
    ctx.fillStyle = isActive ? '#22c55e' : '#64748b'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(isActive ? 'RECEIVING' : 'STANDBY', 10, historyHeight + 40)

    // Signal strength indicator (current peak)
    if (fftHistory.length > 0) {
      const currentRow = fftHistory[fftHistory.length - 1]
      const peakValue = Math.max(...currentRow)
      ctx.fillStyle = '#94a3b8'
      ctx.textAlign = 'right'
      ctx.fillText(`Peak: ${peakValue.toFixed(1)} dB`, width - 10, historyHeight + 40)
    }
  }, [fftHistory, frequency, isActive])

  // Color mapping for waterfall display
  const getWaterfallColor = (normalized: number): string => {
    // Blue -> Cyan -> Green -> Yellow -> Red
    if (normalized < 0.25) {
      const t = normalized / 0.25
      return `rgb(0, 0, ${Math.floor(50 + t * 150)})`
    } else if (normalized < 0.5) {
      const t = (normalized - 0.25) / 0.25
      return `rgb(0, ${Math.floor(t * 255)}, ${Math.floor(200 - t * 100)})`
    } else if (normalized < 0.75) {
      const t = (normalized - 0.5) / 0.25
      return `rgb(${Math.floor(t * 255)}, 255, ${Math.floor(100 - t * 100)})`
    } else {
      const t = (normalized - 0.75) / 0.25
      return `rgb(255, ${Math.floor(255 - t * 200)}, 0)`
    }
  }

  // Animation loop for simulated data
  useEffect(() => {
    const updateWaterfall = () => {
      const newRow = generateSimulatedFFT()
      setFftHistory((prev) => {
        const maxRows = 150
        const newHistory = [...prev, newRow]
        if (newHistory.length > maxRows) {
          return newHistory.slice(newHistory.length - maxRows)
        }
        return newHistory
      })
      animationRef.current = requestAnimationFrame(() => {
        setTimeout(() => {
          animationRef.current = requestAnimationFrame(updateWaterfall)
        }, 100) // Update rate: 10 Hz
      })
    }

    animationRef.current = requestAnimationFrame(updateWaterfall)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [generateSimulatedFFT])

  // Draw waterfall
  useEffect(() => {
    drawWaterfall()
  }, [drawWaterfall])

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={600}
        height={350}
        className="w-full rounded-lg bg-bg-secondary"
      />
      <div className="absolute top-2 right-2 flex items-center gap-2 bg-bg-primary/80 px-2 py-1 rounded text-xs">
        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-success animate-pulse' : 'bg-text-muted'}`} />
        <span className="text-text-secondary">{isActive ? 'Signal Active' : 'Idle'}</span>
      </div>
    </div>
  )
}
