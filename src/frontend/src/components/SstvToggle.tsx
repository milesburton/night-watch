import { useApi } from '@/hooks/useApi'
import type { SstvStatus } from '@/types'
import { useEffect, useState } from 'react'
import { Tooltip } from './Tooltip'

interface SstvToggleProps {
  sstvStatus: SstvStatus | null
  onToggle?: (enabled: boolean) => void
}

export function SstvToggle({ sstvStatus, onToggle }: SstvToggleProps) {
  const { toggleSstv, toggleGroundScan, getSstvStatus } = useApi()
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingGround, setIsLoadingGround] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [groundScanEnabled, setGroundScanEnabled] = useState(true)
  const [initialLoaded, setInitialLoaded] = useState(false)

  useEffect(() => {
    const fetchInitialStatus = async () => {
      const status = await getSstvStatus()
      if (status) {
        setEnabled(status.enabled)
        setGroundScanEnabled(status.groundScanEnabled ?? true)
        setInitialLoaded(true)
      }
    }
    fetchInitialStatus()
  }, [getSstvStatus])

  useEffect(() => {
    if (sstvStatus && initialLoaded) {
      setEnabled(sstvStatus.enabled)
      setGroundScanEnabled(sstvStatus.groundScanEnabled ?? true)
    }
  }, [sstvStatus, initialLoaded])

  const handleToggle = async () => {
    setIsLoading(true)
    try {
      const newStatus = await toggleSstv(!enabled)
      if (newStatus) {
        setEnabled(newStatus.enabled)
        onToggle?.(newStatus.enabled)
      }
    } catch (error) {
      console.error('Failed to toggle SSTV:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGroundScanToggle = async () => {
    setIsLoadingGround(true)
    try {
      const newStatus = await toggleGroundScan(!groundScanEnabled)
      if (newStatus) {
        setGroundScanEnabled(newStatus.groundScanEnabled ?? true)
      }
    } catch (error) {
      console.error('Failed to toggle ground scan:', error)
    } finally {
      setIsLoadingGround(false)
    }
  }

  const isActive = sstvStatus?.status === 'capturing'
  const isScanning = sstvStatus?.status === 'scanning'

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">SSTV Settings</h2>

      {/* ISS SSTV Toggle */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">ISS SSTV Capture</h3>
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              isActive
                ? 'bg-accent/20 text-accent'
                : enabled
                  ? 'bg-success/20 text-success'
                  : 'bg-text-muted/20 text-text-muted'
            }`}
          >
            {isActive ? 'Capturing' : enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="text-sm text-text-secondary mb-3">
          Enable capture for ISS SSTV events (145.800 MHz)
        </p>
        <div className="flex items-center gap-3">
          <Tooltip content="Toggle ISS SSTV capture on scheduled events" position="right">
            <button
              type="button"
              onClick={handleToggle}
              disabled={isLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-primary ${
                enabled ? 'bg-accent' : 'bg-bg-tertiary'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </Tooltip>
          <span className="text-sm text-text-secondary">
            {isLoading ? 'Updating...' : enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {/* 2M Ground SSTV Scanning Toggle */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">2M Ground SSTV Scanning</h3>
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              isScanning
                ? 'bg-purple/20 text-purple animate-pulse'
                : groundScanEnabled
                  ? 'bg-success/20 text-success'
                  : 'bg-text-muted/20 text-text-muted'
            }`}
          >
            {isScanning ? 'Scanning' : groundScanEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="text-sm text-text-secondary mb-3">
          Scan 2M frequencies for ground-based SSTV transmissions during idle time (144.5, 145.5,
          145.8 MHz)
        </p>
        <div className="flex items-center gap-3">
          <Tooltip
            content="Scan for ground-based SSTV signals when no satellite passes are scheduled"
            position="right"
          >
            <button
              type="button"
              onClick={handleGroundScanToggle}
              disabled={isLoadingGround}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-primary ${
                groundScanEnabled ? 'bg-purple' : 'bg-bg-tertiary'
              } ${isLoadingGround ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  groundScanEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </Tooltip>
          <span className="text-sm text-text-secondary">
            {isLoadingGround ? 'Updating...' : groundScanEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      {sstvStatus?.lastCapture && (
        <p className="text-xs text-text-muted mt-4 pt-4 border-t border-border">
          Last SSTV capture: {new Date(sstvStatus.lastCapture).toLocaleString()}
        </p>
      )}
    </div>
  )
}
