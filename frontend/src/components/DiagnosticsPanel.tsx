import type {
  CaptureProgress,
  GlobeState,
  SatellitePass,
  SstvStatus,
  SystemState,
  WsState,
} from '@/types'
import { useEffect, useRef, useState } from 'react'

interface DiagnosticsPanelProps {
  wsState: WsState
  systemState: SystemState | null
  globeState: GlobeState | null
  sstvStatus: SstvStatus | null
  passes: SatellitePass[]
  progress: CaptureProgress | null
  isOpen: boolean
  onClose: () => void
}

type TabId = 'console' | 'state' | 'network' | 'sdr' | 'passes'

interface LogEntry {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

export function DiagnosticsPanel({
  wsState,
  systemState,
  globeState,
  sstvStatus,
  passes,
  progress,
  isOpen,
  onClose,
}: DiagnosticsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('console')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [panelHeight, setPanelHeight] = useState(300)
  const [isResizing, setIsResizing] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Add logs based on state changes
  useEffect(() => {
    if (wsState.connected) {
      addLog('info', 'WebSocket connected')
    } else if (wsState.error) {
      addLog('error', `WebSocket error: ${wsState.error}`)
    }
  }, [wsState.connected, wsState.error])

  useEffect(() => {
    if (systemState) {
      addLog('debug', `Status changed: ${systemState.status}`)
    }
  }, [systemState?.status])

  const addLog = (level: LogEntry['level'], message: string) => {
    setLogs((prev) => [...prev.slice(-100), { timestamp: new Date(), level, message }])
  }

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Handle resize
  const handleMouseDown = () => {
    setIsResizing(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newHeight = window.innerHeight - e.clientY
      setPanelHeight(Math.max(150, Math.min(600, newHeight)))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'console', label: 'Console', icon: '>' },
    { id: 'passes', label: 'Passes', icon: '🛰' },
    { id: 'state', label: 'State', icon: '{}' },
    { id: 'network', label: 'Network', icon: '↔' },
    { id: 'sdr', label: 'SDR', icon: '📡' },
  ]

  const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d))

  const formatTime = (date: Date | string) => {
    return toDate(date).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDate = (date: Date | string) => {
    return toDate(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    })
  }

  const formatDuration = (aos: Date | string, los: Date | string) => {
    const durationMs = toDate(los).getTime() - toDate(aos).getTime()
    const mins = Math.floor(durationMs / 60000)
    const secs = Math.floor((durationMs % 60000) / 1000)
    return `${mins}m ${secs}s`
  }

  const formatCountdown = (aos: Date | string) => {
    const msUntil = toDate(aos).getTime() - Date.now()
    if (msUntil <= 0) return 'NOW'
    const hours = Math.floor(msUntil / 3600000)
    const mins = Math.floor((msUntil % 3600000) / 60000)
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'console':
        return (
          <div className="font-mono text-xs space-y-1 p-2">
            {logs.length === 0 ? (
              <p className="text-text-muted">No logs yet...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-text-muted shrink-0">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <span
                    className={`shrink-0 w-12 ${
                      log.level === 'error'
                        ? 'text-error'
                        : log.level === 'warn'
                          ? 'text-warning'
                          : log.level === 'debug'
                            ? 'text-text-muted'
                            : 'text-accent'
                    }`}
                  >
                    [{log.level}]
                  </span>
                  <span className="text-text-primary">{log.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        )

      case 'state':
        return (
          <div className="font-mono text-xs p-2 space-y-4">
            <div>
              <h4 className="text-text-secondary mb-1">System Status</h4>
              <pre className="bg-bg-tertiary p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(systemState, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="text-text-secondary mb-1">SSTV Status</h4>
              <pre className="bg-bg-tertiary p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(sstvStatus, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="text-text-secondary mb-1">Progress</h4>
              <pre className="bg-bg-tertiary p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(progress, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="text-text-secondary mb-1">Passes ({passes.length})</h4>
              <pre className="bg-bg-tertiary p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(
                  passes.slice(0, 3).map((p) => ({
                    satellite: p.satellite.name,
                    aos: p.aos,
                    maxElevation: p.maxElevation,
                  })),
                  null,
                  2
                )}
              </pre>
            </div>
            <div>
              <h4 className="text-text-secondary mb-1">Globe State</h4>
              <pre className="bg-bg-tertiary p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(
                  globeState
                    ? {
                        station: globeState.station,
                        satellites: globeState.satellites.length,
                        tracks: globeState.groundTracks.length,
                      }
                    : null,
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        )

      case 'network':
        return (
          <div className="font-mono text-xs p-2 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <span
                className={`w-3 h-3 rounded-full ${wsState.connected ? 'bg-success' : 'bg-error'}`}
              />
              <span>WebSocket: {wsState.connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            {wsState.error && (
              <div className="bg-error/10 border border-error/30 rounded p-2 text-error">
                Error: {wsState.error}
              </div>
            )}
            <div>
              <h4 className="text-text-secondary mb-1">Connection Info</h4>
              <div className="bg-bg-tertiary p-2 rounded space-y-1">
                <p>
                  URL:{' '}
                  {typeof window !== 'undefined'
                    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
                    : 'N/A'}
                </p>
                <p>Reconnect Attempts: {wsState.reconnectAttempts}</p>
              </div>
            </div>
          </div>
        )

      case 'sdr': {
        // SDR is "active" when recording, scanning, or decoding
        const sdrActive =
          systemState?.status === 'recording' ||
          systemState?.status === 'scanning' ||
          systemState?.status === 'decoding'
        // SDR is "ready" when idle or waiting (assuming hardware is present)
        const sdrReady = systemState?.status === 'idle' || systemState?.status === 'waiting'
        const sdrStatusText = sdrActive ? 'Active' : sdrReady ? 'Ready' : 'Unknown'
        const sdrStatusColor = sdrActive
          ? 'bg-success shadow-[0_0_6px_var(--success)]'
          : sdrReady
            ? 'bg-success'
            : 'bg-warning'

        return (
          <div className="font-mono text-xs p-2 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-3 h-3 rounded-full ${sdrStatusColor}`} />
              <span>SDR: {sdrStatusText}</span>
            </div>
            <div>
              <h4 className="text-text-secondary mb-1">Current Activity</h4>
              <div className="bg-bg-tertiary p-2 rounded space-y-1">
                <p>Status: {systemState?.status || 'Unknown'}</p>
                {systemState?.currentPass && (
                  <>
                    <p>Satellite: {systemState.currentPass.satellite.name}</p>
                    <p>
                      Frequency: {(systemState.currentPass.satellite.frequency / 1e6).toFixed(3)}{' '}
                      MHz
                    </p>
                    <p>Max Elevation: {systemState.currentPass.maxElevation.toFixed(1)}°</p>
                  </>
                )}
                {systemState?.status === 'scanning' && systemState?.scanningFrequency && (
                  <>
                    <p>Mode: 2M SSTV Scanning</p>
                    <p>
                      Frequency: {(systemState.scanningFrequency / 1e6).toFixed(3)} MHz (
                      {systemState.scanningFrequencyName || 'Unknown'})
                    </p>
                  </>
                )}
                {progress && (
                  <p>
                    Progress: {progress.percentage}% ({progress.elapsed}s / {progress.total}s)
                  </p>
                )}
              </div>
            </div>
            {systemState?.doppler && (
              <div>
                <h4 className="text-text-secondary mb-1">Doppler</h4>
                <div className="bg-bg-tertiary p-2 rounded space-y-1">
                  <p>Current: {systemState.doppler.current.toFixed(0)} Hz</p>
                  <p>
                    Range: {systemState.doppler.min.toFixed(0)} to{' '}
                    {systemState.doppler.max.toFixed(0)} Hz
                  </p>
                </div>
              </div>
            )}
          </div>
        )
      }

      case 'passes':
        return (
          <div className="font-mono text-xs p-2">
            <div className="mb-2 text-text-secondary">{passes.length} upcoming passes</div>
            <table className="w-full">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="py-1 pr-4">Satellite</th>
                  <th className="py-1 pr-4">Date</th>
                  <th className="py-1 pr-4">AOS</th>
                  <th className="py-1 pr-4">LOS</th>
                  <th className="py-1 pr-4">Duration</th>
                  <th className="py-1 pr-4">Max El</th>
                  <th className="py-1 pr-4">Freq</th>
                  <th className="py-1">In</th>
                </tr>
              </thead>
              <tbody>
                {passes.map((pass, idx) => (
                  <tr
                    key={`${pass.satellite.name}-${pass.aos}-${idx}`}
                    className="border-b border-border/50 hover:bg-bg-tertiary"
                  >
                    <td
                      className={`py-1 pr-4 ${pass.satellite.signalType === 'sstv' ? 'text-purple' : 'text-accent'}`}
                    >
                      {pass.satellite.name}
                    </td>
                    <td className="py-1 pr-4 text-text-muted">{formatDate(pass.aos)}</td>
                    <td className="py-1 pr-4">{formatTime(pass.aos)}</td>
                    <td className="py-1 pr-4">{formatTime(pass.los)}</td>
                    <td className="py-1 pr-4 text-text-muted">
                      {formatDuration(pass.aos, pass.los)}
                    </td>
                    <td className="py-1 pr-4">{pass.maxElevation.toFixed(0)}°</td>
                    <td className="py-1 pr-4 text-text-muted">
                      {(pass.satellite.frequency / 1e6).toFixed(3)}
                    </td>
                    <td className="py-1 text-warning">{formatCountdown(pass.aos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {passes.length === 0 && (
              <p className="text-center text-text-muted py-4">No upcoming passes</p>
            )}
          </div>
        )

      default:
        return null
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed left-0 right-0 z-40 bg-bg-primary border-t border-border shadow-2xl"
      style={{ height: panelHeight, bottom: 40 }}
    >
      {/* Resize Handle */}
      <div
        className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-accent/50 transition-colors"
        onMouseDown={handleMouseDown}
      />

      {/* Tab Bar */}
      <div className="flex items-center justify-between border-b border-border px-2">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-text-secondary hover:text-text-primary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="overflow-auto" style={{ height: panelHeight - 41 }}>
        {renderTabContent()}
      </div>
    </div>
  )
}
