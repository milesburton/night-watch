import { useApi } from '@/hooks/useApi'
import { cn, formatCountdown, formatFrequency } from '@/lib/utils'
import type { CaptureSummary, SatellitePass, StationConfig, SystemState } from '@/types'
import { useEffect, useState } from 'react'

interface StatusCardsProps {
  systemState: SystemState | null
  nextPass: SatellitePass | null
}

export function StatusCards({ systemState, nextPass }: StatusCardsProps) {
  const { getSummary, getConfig } = useApi()
  const [summary, setSummary] = useState<CaptureSummary | null>(null)
  const [config, setConfig] = useState<StationConfig | null>(null)
  const [countdown, setCountdown] = useState<string>('-')

  const status = systemState?.status || 'idle'
  const currentPass = systemState?.currentPass || null

  // Fetch summary and config on mount
  useEffect(() => {
    const fetchData = async () => {
      const [summaryData, configData] = await Promise.all([getSummary(), getConfig()])
      if (summaryData) setSummary(summaryData)
      if (configData) setConfig(configData)
    }
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [getSummary, getConfig])

  useEffect(() => {
    if (!nextPass) {
      setCountdown('-')
      return
    }

    const updateCountdown = () => {
      const now = Date.now()
      const passTime = new Date(nextPass.aos).getTime()
      const diff = passTime - now
      setCountdown(formatCountdown(diff))
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [nextPass])

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* System Status Card */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">System Status</h2>
        <div className="mb-4">
          <span className={cn('status-badge', `status-${status}`)}>
            {status === 'idle' && 'Standby'}
            {status === 'waiting' && 'Waiting for Pass'}
            {status === 'recording' && 'Recording'}
            {status === 'decoding' && 'Decoding'}
            {status === 'scanning' && 'Scanning 2m SSTV'}
          </span>
        </div>
        {currentPass && (
          <div className="pt-4 border-t border-border space-y-1 text-sm">
            <p className="text-text-secondary">
              <strong className="text-text-primary">Current:</strong> {currentPass.satellite.name}
            </p>
            <p className="text-text-secondary">
              <strong className="text-text-primary">Frequency:</strong>{' '}
              <span className="font-mono text-accent">
                {formatFrequency(currentPass.satellite.frequency)}
              </span>
            </p>
            <p className="text-text-secondary">
              <strong className="text-text-primary">Max Elevation:</strong>{' '}
              {currentPass.maxElevation.toFixed(1)}°
            </p>
          </div>
        )}
        {config && (
          <div className="pt-4 border-t border-border space-y-1 text-sm">
            <p className="text-text-secondary">
              <strong className="text-text-primary">QTH:</strong>{' '}
              <span className="font-mono">
                {config.station.latitude.toFixed(4)}°, {config.station.longitude.toFixed(4)}°
              </span>
            </p>
            <p className="text-text-secondary">
              <strong className="text-text-primary">SDR Gain:</strong>{' '}
              <span className="font-mono">{config.sdr.gain}</span>
            </p>
            <p className="text-text-secondary">
              <strong className="text-text-primary">Min Elevation:</strong>{' '}
              <span className="font-mono">{config.recording.minElevation}°</span>
            </p>
          </div>
        )}
      </div>

      {/* Next Pass Card */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Next Pass</h2>
        {nextPass ? (
          <div className="space-y-2">
            <p className="text-2xl font-semibold">{nextPass.satellite.name}</p>
            <p className="font-mono text-sm text-accent">
              {formatFrequency(nextPass.satellite.frequency)}
            </p>
            <p className="text-text-secondary text-sm">{new Date(nextPass.aos).toLocaleString()}</p>
            <p className="text-xl font-mono text-accent">{countdown}</p>
          </div>
        ) : (
          <p className="text-text-secondary">No upcoming passes</p>
        )}
      </div>

      {/* Statistics Card */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Statistics</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <span className="block text-3xl font-bold">{summary?.total || 0}</span>
            <span className="text-xs text-text-secondary uppercase">Total</span>
          </div>
          <div>
            <span className="block text-3xl font-bold text-success">
              {summary?.successful || 0}
            </span>
            <span className="text-xs text-text-secondary uppercase">Success</span>
          </div>
          <div>
            <span className="block text-3xl font-bold text-error">{summary?.failed || 0}</span>
            <span className="text-xs text-text-secondary uppercase">Failed</span>
          </div>
        </div>
      </div>
    </div>
  )
}
