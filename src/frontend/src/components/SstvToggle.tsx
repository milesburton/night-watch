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

  // System is automatic - all SSTV controls hidden
  // Display status only, no manual toggles
  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">SSTV Status</h2>

      {/* ISS SSTV Status */}
      <section className="mb-6" aria-labelledby="iss-sstv-heading">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium" id="iss-sstv-heading">
            ISS SSTV
          </h3>
          <output
            className={`px-2 py-1 rounded text-xs font-medium ${
              isActive
                ? 'bg-accent/20 text-accent'
                : enabled
                  ? 'bg-success/20 text-success'
                  : 'bg-text-muted/20 text-text-muted'
            }`}
            aria-live="polite"
            aria-label={`ISS SSTV status: ${isActive ? 'Capturing' : enabled ? 'Enabled' : 'Disabled'}`}
          >
            {isActive ? 'Capturing' : enabled ? 'Enabled' : 'Disabled'}
          </output>
        </div>
        <p className="text-sm text-text-secondary mb-3">
          Automatic capture for ISS SSTV events (145.800 MHz)
        </p>
      </section>

      {/* 2M Ground Scan Status */}
      <section className="mb-6" aria-labelledby="2m-scan-heading">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium" id="2m-scan-heading">
            2M Ground Scan
          </h3>
          <output
            className={`px-2 py-1 rounded text-xs font-medium ${
              isScanning
                ? 'bg-purple/20 text-purple'
                : groundScanEnabled
                  ? 'bg-success/20 text-success'
                  : 'bg-text-muted/20 text-text-muted'
            }`}
            aria-live="polite"
            aria-label={`2M Ground Scan status: ${isScanning ? 'Scanning' : groundScanEnabled ? 'Enabled' : 'Disabled'}`}
          >
            {isScanning ? 'Scanning' : groundScanEnabled ? 'Enabled' : 'Disabled'}
          </output>
        </div>
        <p className="text-sm text-text-secondary">
          Automatic scanning on 144.5, 145.5, and 145.8 MHz
        </p>
      </section>

      {sstvStatus?.lastCapture && (
        <p className="text-xs text-text-muted mt-4 pt-4 border-t border-border">
          Last SSTV capture: {new Date(sstvStatus.lastCapture).toLocaleString()}
        </p>
      )}
    </div>
  )
}
