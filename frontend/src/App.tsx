import {
  CaptureGallery,
  DiagnosticsPanel,
  DopplerChart,
  Header,
  PassesTable,
  ProgressSection,
  SatelliteTracking,
  SstvToggle,
  StatusBar,
  StatusCards,
} from '@/components'
import { useApi } from '@/hooks/useApi'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { VersionInfo } from '@/types'
import { useEffect, useState } from 'react'

export default function App() {
  const { wsState, systemState, globeState, sstvStatus, passes, progress } = useWebSocket()
  const { getVersion } = useApi()
  const [version, setVersion] = useState<VersionInfo | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const v = await getVersion()
        setVersion(v)
      } catch (error) {
        console.error('Failed to fetch version:', error)
      }
    }
    fetchVersion()
  }, [getVersion])

  // Auto-refresh on version change
  useEffect(() => {
    if (!version) return

    const checkVersion = async () => {
      try {
        const newVersion = await getVersion()
        if (newVersion && newVersion.version !== version.version) {
          window.location.reload()
        }
      } catch {
        // Ignore errors during version check
      }
    }

    const interval = setInterval(checkVersion, 30000)
    return () => clearInterval(interval)
  }, [version, getVersion])

  const showProgress = systemState?.status === 'recording' || systemState?.status === 'decoding'
  const showDoppler = showProgress && systemState?.doppler

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      <Header
        status={systemState?.status || 'idle'}
        statusMessage={systemState?.statusMessage}
        connected={wsState.connected}
      />

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6 pb-32">
        {/* Status Cards */}
        <StatusCards systemState={systemState} nextPass={passes[0] || null} />

        {/* Satellite Tracking */}
        <SatelliteTracking globeState={globeState} currentPass={systemState?.currentPass} />

        {/* SSTV Toggle */}
        <SstvToggle sstvStatus={sstvStatus} />

        {/* Progress Section */}
        <ProgressSection progress={progress} visible={showProgress} />

        {/* Doppler Chart */}
        {showDoppler && systemState?.doppler && (
          <DopplerChart
            current={systemState.doppler.current}
            min={systemState.doppler.min}
            max={systemState.doppler.max}
            visible={true}
          />
        )}

        {/* Passes Table */}
        <PassesTable passes={passes} />

        {/* Capture Gallery */}
        <CaptureGallery />
      </main>

      {/* Diagnostics Panel (above status bar) */}
      <DiagnosticsPanel
        wsState={wsState}
        systemState={systemState}
        globeState={globeState}
        sstvStatus={sstvStatus}
        passes={passes}
        progress={progress}
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
      />

      <StatusBar
        status={systemState?.status || 'idle'}
        sdrConnected={systemState?.sdrConnected ?? false}
        nextPass={passes[0] || null}
        version={version}
        wsConnected={wsState.connected}
        onDiagnosticsToggle={() => setDiagnosticsOpen(!diagnosticsOpen)}
        diagnosticsOpen={diagnosticsOpen}
      />
    </div>
  )
}
