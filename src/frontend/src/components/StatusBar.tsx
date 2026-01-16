import { cn } from '@/lib/utils'
import type { SatellitePass, SystemStatus, VersionInfo } from '@/types'
import { useEffect, useState } from 'react'

interface StatusBarProps {
  status: SystemStatus
  nextPass: SatellitePass | null
  sdrConnected: boolean
  version: VersionInfo | null
  wsConnected: boolean
  onDiagnosticsToggle: () => void
  diagnosticsOpen: boolean
}

export function StatusBar({
  status,
  nextPass,
  sdrConnected,
  version,
  wsConnected,
  onDiagnosticsToggle,
  diagnosticsOpen,
}: StatusBarProps) {
  const [, setTick] = useState(0)

  // Force re-render every second for countdown
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const getStatusMessage = () => {
    switch (status) {
      case 'waiting':
        return nextPass ? `Waiting for ${nextPass.satellite.name}` : 'Waiting for Pass'
      case 'recording':
        return 'Recording Signal'
      case 'decoding':
        return 'Decoding Image'
      case 'scanning':
        return 'Scanning 2m SSTV'
      default:
        return 'Night Watch - Satellite Signal Capture Station'
    }
  }

  const getSdrStatus = () => {
    if (status === 'recording' || status === 'scanning') {
      return { text: 'SDR: Active', class: 'bg-success shadow-[0_0_6px_var(--success)]' }
    }
    if (sdrConnected) {
      return { text: 'SDR: Ready', class: 'bg-success' }
    }
    return { text: 'SDR: Standby', class: 'bg-warning animate-pulse' }
  }

  const formatBuildDateTime = (buildTime: string | null): string => {
    if (!buildTime) return ''
    const date = new Date(buildTime)
    const dateStr = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    const timeStr = date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${dateStr} ${timeStr}`
  }

  const sdrStatus = getSdrStatus()
  const commitShort = version?.commit?.substring(0, 7) || '---'
  const buildDateTime = formatBuildDateTime(version?.buildTime ?? null)
  const versionText = `v${version?.version || '-.-.-'} (${commitShort})${buildDateTime ? ` - ${buildDateTime}` : ''}`

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-bg-secondary border-t border-border px-4 py-2 flex justify-between items-center text-xs z-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', sdrStatus.class)} />
          <span>{sdrStatus.text}</span>
        </div>
      </div>
      <div className="text-center">
        <span className="text-text-secondary">{getStatusMessage()}</span>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onDiagnosticsToggle}
          className={cn(
            'flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-tertiary transition-colors',
            diagnosticsOpen && 'bg-bg-tertiary'
          )}
          title="Toggle Diagnostics Panel"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          <span>Diagnostics</span>
          {!wsConnected && <span className="w-2 h-2 rounded-full bg-error" />}
        </button>
        <span className="font-mono text-text-secondary">{versionText}</span>
      </div>
    </footer>
  )
}
