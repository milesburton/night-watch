import {
  CaptureGallery,
  DiagnosticsPanel,
  DopplerChart,
  Footer,
  PassTimeline,
  ProgressSection,
  SatelliteTracking,
} from '@/components'
import { useApi } from '@/hooks/useApi'
import { useFavicon } from '@/hooks/useFavicon'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useWebSocket } from '@/hooks/useWebSocket'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store'
import type { FFTData, VersionInfo } from '@/types'
import { useCallback, useEffect, useState } from 'react'

type WaterfallMode = 'satellite' | 'sstv-2m'

export default function App() {
  const [latestFFTData, setLatestFFTData] = useState<FFTData | null>(null)
  const [currentFreq, setCurrentFreq] = useState<number | null>(null)
  const [waterfallMode, setWaterfallMode] = useState<WaterfallMode>('satellite')

  const handleFFTData = useCallback((data: FFTData) => {
    setLatestFFTData(data)
  }, [])

  const handleFrequencyChange = useCallback((freq: number | null, mode: WaterfallMode) => {
    setCurrentFreq(freq)
    setWaterfallMode(mode)
  }, [])

  const {
    wsState,
    systemState,
    globeState,
    sstvStatus,
    passes,
    progress,
    fftState,
    subscribeFFT,
    unsubscribeFFT,
  } = useWebSocket({ onFFTData: handleFFTData })

  const { getVersion, getSstvStatus, toggleSstv, toggleGroundScan } = useApi()
  const [version, setVersion] = useState<VersionInfo | null>(null)
  const [serverTime, setServerTime] = useState<string>('')
  const [, setTick] = useState(0)

  const { diagnosticsOpen, toggleDiagnostics, setDiagnosticsOpen } = useUIStore()

  useFavicon(systemState?.status || 'idle')
  usePageTitle(
    systemState?.status || 'idle',
    systemState?.currentPass?.satellite.name || systemState?.nextPass?.satellite.name
  )

  const [issEnabled, setIssEnabled] = useState(false)
  const [groundEnabled, setGroundEnabled] = useState(true)
  const [noaaEnabled, setNoaaEnabled] = useState(true)
  const [sstvLoading, setSstvLoading] = useState<string | null>(null)

  useEffect(() => {
    const fetchSstvStatus = async () => {
      const status = await getSstvStatus()
      if (status) {
        setIssEnabled(status.enabled)
        setGroundEnabled(status.groundScanEnabled ?? true)
      }
    }
    fetchSstvStatus()
  }, [getSstvStatus])

  useEffect(() => {
    if (sstvStatus) {
      setIssEnabled(sstvStatus.enabled)
      setGroundEnabled(sstvStatus.groundScanEnabled ?? true)
    }
  }, [sstvStatus])

  useEffect(() => {
    const updateTime = () => {
      setTick((t) => t + 1)
      const now = new Date()
      setServerTime(
        now.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'UTC',
        })
      )
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

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

  useEffect(() => {
    if (!version) return

    const checkVersion = async () => {
      try {
        const newVersion = await getVersion()
        if (newVersion && newVersion.version !== version.version) {
          window.location.reload()
        }
      } catch {
        // Ignore errors
      }
    }

    const interval = setInterval(checkVersion, 30000)
    return () => clearInterval(interval)
  }, [version, getVersion])

  const showProgress = systemState?.status === 'recording' || systemState?.status === 'decoding'
  const status = systemState?.status || 'idle'
  const sdrConnected = systemState?.sdrConnected ?? false
  const nextPass = passes[0] || null

  const getStatusColor = () => {
    switch (status) {
      case 'recording':
        return 'bg-accent animate-pulse'
      case 'decoding':
        return 'bg-success'
      case 'waiting':
        return 'bg-warning'
      case 'scanning':
        return 'bg-purple animate-pulse'
      default:
        return 'bg-text-muted'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return 'IDLE'
      case 'waiting':
        return 'WAIT'
      case 'recording':
        return 'REC'
      case 'decoding':
        return 'DEC'
      case 'scanning':
        return 'SCAN'
      default:
        return '???'
    }
  }

  const getSdrStatus = () => {
    if (status === 'recording' || status === 'scanning') {
      return { text: 'ACT', class: 'bg-success shadow-[0_0_6px_var(--success)]' }
    }
    if (sdrConnected) {
      return { text: 'RDY', class: 'bg-success' }
    }
    return { text: 'OFF', class: 'bg-warning' }
  }

  const formatCountdown = () => {
    if (!nextPass) return '--:--:--'
    const msUntil = new Date(nextPass.aos).getTime() - Date.now()
    if (msUntil <= 0) return '00:00:00'
    const hours = Math.floor(msUntil / 3600000)
    const mins = Math.floor((msUntil % 3600000) / 60000)
    const secs = Math.floor((msUntil % 60000) / 1000)
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const formatFrequency = (freq: number | null) => {
    if (!freq) return '---'
    return `${(freq / 1e6).toFixed(3)}`
  }

  const sdrStatus = getSdrStatus()
  const versionText = `${version?.version || '-.-.-'}`

  const handleIssToggle = async () => {
    setSstvLoading('iss')
    const result = await toggleSstv(!issEnabled)
    if (result) setIssEnabled(result.enabled)
    setSstvLoading(null)
  }

  const handleGroundToggle = async () => {
    setSstvLoading('ground')
    const result = await toggleGroundScan(!groundEnabled)
    if (result) setGroundEnabled(result.groundScanEnabled ?? true)
    setSstvLoading(null)
  }

  const handleNoaaToggle = () => {
    setNoaaEnabled(!noaaEnabled)
  }

  const ToggleChip = ({
    label,
    enabled,
    loading,
    color,
    tooltip,
    onClick,
  }: {
    label: string
    enabled: boolean
    loading?: boolean
    color: string
    tooltip: string
    onClick: () => void
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={tooltip}
      className={cn(
        'px-1.5 py-0.5 rounded text-[10px] font-medium transition-all',
        enabled ? `${color} text-white` : 'bg-bg-tertiary text-text-muted',
        loading && 'opacity-50 cursor-wait',
        !loading && 'hover:opacity-80'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="h-screen bg-bg-primary text-text-primary flex flex-col overflow-hidden">
      {/* Top Status Bar - ultra compact */}
      <header
        className="bg-bg-secondary border-b border-border px-2 py-1 flex items-center justify-between text-xs shrink-0"
        data-testid="status-bar"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <ToggleChip
              label="METEOR"
              enabled={noaaEnabled}
              color="bg-accent"
              tooltip="METEOR-M LRPT weather satellites (137.9 MHz) - High-resolution weather imagery from Russian satellites"
              onClick={handleNoaaToggle}
            />
            <ToggleChip
              label="ISS"
              enabled={issEnabled}
              loading={sstvLoading === 'iss'}
              color="bg-purple"
              tooltip="ISS SSTV events on 145.800 MHz - Capture slow-scan TV from the International Space Station"
              onClick={handleIssToggle}
            />
            <ToggleChip
              label="2M"
              enabled={groundEnabled}
              loading={sstvLoading === 'ground'}
              color="bg-purple"
              tooltip="2M ground SSTV scanning (144.5, 145.5, 145.8 MHz) - Scan for amateur radio SSTV during idle time"
              onClick={handleGroundToggle}
            />
          </div>

          <div className="flex items-center gap-3 border-l border-border pl-3">
            <div className="flex items-center gap-1" data-testid="system-status">
              <span className={cn('w-1.5 h-1.5 rounded-full', getStatusColor())} />
              <span className="font-mono text-[10px]">{getStatusText()}</span>
            </div>
            <div className="flex items-center gap-1" data-testid="sdr-status">
              <span className={cn('w-1.5 h-1.5 rounded-full', sdrStatus.class)} />
              <span className="text-[10px]">{sdrStatus.text}</span>
            </div>
            <div className="flex items-center gap-1" data-testid="ws-status">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  wsState.connected ? 'bg-success' : 'bg-error animate-pulse'
                )}
              />
              <span className="text-[10px]">{wsState.connected ? 'WS' : 'WS!'}</span>
            </div>
            <div className="flex items-center gap-1 font-mono" data-testid="current-frequency">
              {status === 'scanning' && systemState?.scanningFrequency ? (
                <>
                  <span className="text-[10px] text-purple animate-pulse">
                    {formatFrequency(systemState.scanningFrequency)} MHz
                  </span>
                  <span className="text-text-muted text-[10px]">
                    {systemState.scanningFrequencyName || '2M'}
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={cn(
                      'text-[10px]',
                      waterfallMode === 'sstv-2m' ? 'text-purple' : 'text-accent'
                    )}
                  >
                    {formatFrequency(currentFreq)} MHz
                  </span>
                  <span className="text-text-muted text-[10px]">
                    {waterfallMode === 'sstv-2m' ? '2M' : 'SAT'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {nextPass && (
            <div
              className="flex items-center gap-1.5 font-mono text-[10px]"
              data-testid="next-pass"
            >
              <span className="text-accent">{nextPass.satellite.name}</span>
              <span className="text-warning">{formatCountdown()}</span>
              <span className="text-text-muted">{nextPass.maxElevation.toFixed(0)}°</span>
            </div>
          )}
          <span
            className="font-mono text-text-muted text-[10px]"
            data-testid="server-time"
            title="Server time (UTC)"
          >
            {serverTime} UTC
          </span>
          <span className="font-mono text-text-muted text-[10px]" data-testid="version">
            {versionText}
          </span>
          <button
            type="button"
            onClick={toggleDiagnostics}
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
              diagnosticsOpen ? 'bg-accent/20 text-accent' : 'hover:bg-bg-tertiary text-text-muted'
            )}
            data-testid="diagnostics-toggle"
            title={diagnosticsOpen ? 'Close dev tools' : 'Open dev tools'}
          >
            <span className="font-medium">Dev</span>
            <svg
              className={cn('w-3 h-3 transition-transform', diagnosticsOpen && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </header>

      <PassTimeline passes={passes} hoursAhead={12} />

      <main className="flex-1 overflow-auto p-2 pb-10 space-y-2">
        <div
          className={cn('grid gap-2', showProgress ? 'grid-cols-1 xl:grid-cols-3' : 'grid-cols-1')}
        >
          <div className={showProgress ? 'xl:col-span-2' : ''}>
            <SatelliteTracking
              globeState={globeState}
              currentPass={systemState?.currentPass}
              systemStatus={systemState?.status}
              scanningFrequency={systemState?.scanningFrequency}
              scanningFrequencyName={systemState?.scanningFrequencyName}
              subscribeFFT={subscribeFFT}
              unsubscribeFFT={unsubscribeFFT}
              fftRunning={fftState.running}
              fftError={fftState.error ?? null}
              latestFFTData={latestFFTData}
              onFrequencyChange={handleFrequencyChange}
            />
          </div>

          {showProgress && (
            <div className="space-y-2">
              <ProgressSection
                progress={progress}
                visible={showProgress}
                currentPass={systemState?.currentPass}
              />
              {systemState?.doppler && (
                <DopplerChart
                  current={systemState.doppler.current}
                  min={systemState.doppler.min}
                  max={systemState.doppler.max}
                  visible={true}
                />
              )}
            </div>
          )}
        </div>

        <CaptureGallery />
      </main>

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

      <Footer version={version} />
    </div>
  )
}
