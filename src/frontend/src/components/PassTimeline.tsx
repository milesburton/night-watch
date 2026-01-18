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

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const getShortName = (name: string): string => {
    if (name.includes('NOAA')) {
      const num = name.match(/\d+/)?.[0]
      return num ? `N${num}` : 'N??'
    }
    if (name === 'ISS') return 'ISS'
    if (name.includes('METEOR')) return 'MET'
    return name.substring(0, 3).toUpperCase()
  }

  const getSatIcon = (name: string): string => {
    if (name.includes('NOAA') || name.includes('METEOR')) return '🛰'
    if (name === 'ISS') return '🚀'
    return '📡'
  }

  const now = Date.now()
  const endTime = now + hoursAhead * 60 * 60 * 1000
  const timeRange = endTime - now

  const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d))

  const visiblePasses = passes.filter((pass) => {
    const aosTime = toDate(pass.aos).getTime()
    const losTime = toDate(pass.los).getTime()
    return losTime >= now && aosTime <= endTime
  })

  const getPassStartPos = (pass: SatellitePass): number => {
    const aosTime = Math.max(toDate(pass.aos).getTime(), now)
    return ((aosTime - now) / timeRange) * 100
  }

  const getPassWidth = (pass: SatellitePass): number => {
    const aosTime = Math.max(toDate(pass.aos).getTime(), now)
    const losTime = Math.min(toDate(pass.los).getTime(), endTime)
    return ((losTime - aosTime) / timeRange) * 100
  }

  const getElevationOpacity = (elevation: number): number => {
    return 0.4 + (elevation / 90) * 0.6
  }

  const getPassColor = (pass: SatellitePass): { bg: string; text: string; border: string } => {
    if (pass.satellite.signalType === 'sstv') {
      return { bg: 'bg-purple', text: 'text-purple', border: 'border-purple' }
    }
    return { bg: 'bg-accent', text: 'text-accent', border: 'border-accent' }
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

  const formatCountdown = (ms: number): string => {
    if (ms <= 0) return 'NOW'
    const hours = Math.floor(ms / 3600000)
    const mins = Math.floor((ms % 3600000) / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    if (hours > 0) {
      return `${hours}h ${mins.toString().padStart(2, '0')}m`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
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

  const hourMarkers = []
  for (let h = 2; h < hoursAhead; h += 2) {
    const pos = (h / hoursAhead) * 100
    hourMarkers.push({ hour: h, pos })
  }

  const nextPass = visiblePasses[0] || null
  const msToNext = nextPass ? toDate(nextPass.aos).getTime() - now : null
  const isPassActive = nextPass && msToNext !== null && msToNext <= 0

  return (
    <div
      ref={containerRef}
      className="relative h-12 bg-bg-tertiary border-b border-border flex"
      onMouseMove={handleMouseMove}
      data-testid="pass-timeline"
    >
      {/* Next pass countdown panel */}
      <div className="w-32 shrink-0 flex items-center justify-center border-r border-border px-2">
        {nextPass ? (
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <span className="text-sm">{getSatIcon(nextPass.satellite.name)}</span>
              <span
                className={cn(
                  'text-xs font-medium',
                  nextPass.satellite.signalType === 'sstv' ? 'text-purple' : 'text-accent'
                )}
              >
                {getShortName(nextPass.satellite.name)}
              </span>
            </div>
            <div
              className={cn(
                'font-mono text-sm font-bold',
                isPassActive ? 'text-success animate-pulse' : 'text-warning'
              )}
            >
              {msToNext !== null ? formatCountdown(msToNext) : '--:--'}
            </div>
          </div>
        ) : (
          <span className="text-[10px] text-text-muted">No passes</span>
        )}
      </div>

      {/* Timeline area */}
      <div className="flex-1 relative px-2">
        {/* Timeline track */}
        <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-1 bg-border/50 rounded">
          {/* Now marker */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-success rounded-full shadow-[0_0_4px_var(--success)]" />

          {/* Hour markers */}
          {hourMarkers.map(({ hour, pos }) => (
            <div
              key={hour}
              className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${pos}%` }}
            >
              <div className="w-px h-2 bg-text-muted/30" />
              <span className="text-[8px] text-text-muted/50 mt-1">{hour}h</span>
            </div>
          ))}
        </div>

        {/* Pass duration bars */}
        {visiblePasses.map((pass, idx) => {
          const startPos = getPassStartPos(pass)
          const width = getPassWidth(pass)
          const colors = getPassColor(pass)
          const isHovered = hoveredPass === pass
          const opacity = getElevationOpacity(pass.maxElevation)
          const shortName = getShortName(pass.satellite.name)

          return (
            <div
              key={`${pass.satellite.name}-${pass.aos}-${idx}`}
              className={cn(
                'absolute top-1/2 -translate-y-1/2 h-6 rounded cursor-pointer transition-all border',
                colors.bg,
                colors.border,
                isHovered ? 'h-8 z-20 shadow-lg' : 'z-10'
              )}
              style={{
                left: `calc(${startPos}% + 8px)`,
                width: `max(${width}%, 24px)`,
                opacity,
              }}
              onMouseEnter={(e) => handleMouseEnter(e, pass)}
              onMouseLeave={() => setHoveredPass(null)}
            >
              {/* Pass label inside bar */}
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden px-1">
                <span className="text-[9px] font-bold text-white drop-shadow truncate">
                  {shortName}
                </span>
                {width > 3 && (
                  <span className="text-[8px] text-white/80 ml-1 hidden sm:inline">
                    {pass.maxElevation.toFixed(0)}°
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* Tooltip */}
        {hoveredPass && (
          <div
            className="absolute z-30 bg-bg-secondary border border-border rounded px-2 py-1.5 shadow-lg pointer-events-none min-w-[140px]"
            style={{
              left: Math.min(tooltipPos.x, (containerRef.current?.offsetWidth || 300) - 160),
              top: 36,
            }}
          >
            <div className="text-[10px] space-y-0.5">
              <div className="flex items-center gap-1 font-medium text-text-primary">
                <span>{getSatIcon(hoveredPass.satellite.name)}</span>
                <span>{hoveredPass.satellite.name}</span>
              </div>
              <div className="text-text-muted">
                {formatTime(hoveredPass.aos)} → {formatTime(hoveredPass.los)}
              </div>
              <div className="flex justify-between text-text-muted">
                <span>El: {hoveredPass.maxElevation.toFixed(0)}°</span>
                <span>{formatDuration(hoveredPass.aos, hoveredPass.los)}</span>
              </div>
              <div className="text-accent font-mono">
                {(hoveredPass.satellite.frequency / 1e6).toFixed(3)} MHz
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {visiblePasses.length === 0 && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-text-muted">
            No passes in next {hoursAhead}h
          </span>
        )}
      </div>
    </div>
  )
}
