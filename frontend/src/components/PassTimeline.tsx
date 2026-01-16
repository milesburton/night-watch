import { cn } from '@/lib/utils'
import type { SatellitePass } from '@/types'
import { useEffect, useRef, useState } from 'react'

interface PassTimelineProps {
  passes: SatellitePass[]
  hoursAhead?: number
}

export function PassTimeline({ passes, hoursAhead = 12 }: PassTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredPass, setHoveredPass] = useState<SatellitePass | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [, setTick] = useState(0)

  // Update every minute for timeline position
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  const now = Date.now()
  const endTime = now + hoursAhead * 60 * 60 * 1000
  const timeRange = endTime - now

  const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d))

  // Filter passes within the time window
  const visiblePasses = passes.filter((pass) => {
    const passTime = toDate(pass.aos).getTime()
    return passTime >= now && passTime <= endTime
  })

  const getPassPosition = (pass: SatellitePass): number => {
    const passTime = toDate(pass.aos).getTime()
    return ((passTime - now) / timeRange) * 100
  }

  const getPassColor = (pass: SatellitePass): string => {
    if (pass.satellite.signalType === 'sstv') return 'bg-purple'
    return 'bg-accent'
  }

  const formatTime = (date: Date | string) => {
    return toDate(date).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (aos: Date | string, los: Date | string) => {
    const durationMs = toDate(los).getTime() - toDate(aos).getTime()
    const mins = Math.floor(durationMs / 60000)
    const secs = Math.floor((durationMs % 60000) / 1000)
    return `${mins}m ${secs}s`
  }

  const handleMouseEnter = (e: React.MouseEvent, pass: SatellitePass) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setTooltipPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }
    setHoveredPass(pass)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect && hoveredPass) {
      setTooltipPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }
  }

  // Generate hour markers
  const hourMarkers = []
  for (let h = 1; h < hoursAhead; h += 2) {
    const pos = (h / hoursAhead) * 100
    hourMarkers.push({ hour: h, pos })
  }

  return (
    <div
      ref={containerRef}
      className="relative h-4 bg-bg-tertiary border-b border-border px-2"
      onMouseMove={handleMouseMove}
      data-testid="pass-timeline"
    >
      {/* Timeline track */}
      <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 bg-border rounded">
        {/* Now marker */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2 bg-success rounded-full" />

        {/* Hour markers */}
        {hourMarkers.map(({ hour, pos }) => (
          <div
            key={hour}
            className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
            style={{ left: `${pos}%` }}
          >
            <div className="w-px h-1.5 bg-text-muted opacity-50" />
            <span className="text-[8px] text-text-muted mt-0.5">{hour}h</span>
          </div>
        ))}
      </div>

      {/* Pass dots */}
      {visiblePasses.map((pass, idx) => {
        const pos = getPassPosition(pass)
        const color = getPassColor(pass)
        const isHovered = hoveredPass === pass

        return (
          <div
            key={`${pass.satellite.name}-${pass.aos}-${idx}`}
            className={cn(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full cursor-pointer transition-all',
              color,
              isHovered ? 'w-2.5 h-2.5 z-10' : 'w-1.5 h-1.5'
            )}
            style={{ left: `calc(${pos}% + 8px)` }}
            onMouseEnter={(e) => handleMouseEnter(e, pass)}
            onMouseLeave={() => setHoveredPass(null)}
          />
        )
      })}

      {/* Tooltip */}
      {hoveredPass && (
        <div
          className="absolute z-20 bg-bg-secondary border border-border rounded px-2 py-1 shadow-lg pointer-events-none"
          style={{
            left: Math.min(tooltipPos.x, (containerRef.current?.offsetWidth || 300) - 150),
            top: tooltipPos.y + 16,
          }}
        >
          <div className="text-[10px] space-y-0.5">
            <div className="font-medium text-text-primary">{hoveredPass.satellite.name}</div>
            <div className="text-text-muted">
              AOS: {formatTime(hoveredPass.aos)} | LOS: {formatTime(hoveredPass.los)}
            </div>
            <div className="text-text-muted">
              Max El: {hoveredPass.maxElevation.toFixed(0)}° | Duration:{' '}
              {formatDuration(hoveredPass.aos, hoveredPass.los)}
            </div>
            <div className="text-text-muted">
              {(hoveredPass.satellite.frequency / 1e6).toFixed(3)} MHz
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {visiblePasses.length === 0 && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] text-text-muted">
          No passes in next {hoursAhead}h
        </span>
      )}
    </div>
  )
}
