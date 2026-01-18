import { cn } from '@/lib/utils'
import type { SystemStatus } from '@/types'
import { Tooltip } from './Tooltip'

interface HeaderProps {
  status: SystemStatus
  statusMessage?: string
  connected: boolean
}

export function Header({ status, statusMessage, connected }: HeaderProps) {
  const getStatusText = () => {
    if (statusMessage) return statusMessage
    switch (status) {
      case 'idle':
        return 'Standby'
      case 'waiting':
        return 'Waiting for Pass'
      case 'recording':
        return 'Recording'
      case 'decoding':
        return 'Decoding'
      case 'scanning':
        return 'Scanning 2m SSTV'
      default:
        return 'Unknown'
    }
  }

  const getStatusTooltip = () => {
    switch (status) {
      case 'idle':
        return 'System is idle, waiting for next scheduled pass or SSTV scan'
      case 'waiting':
        return 'Satellite pass approaching, preparing to capture'
      case 'recording':
        return 'Actively recording RF signal from satellite'
      case 'decoding':
        return 'Processing recorded audio into weather images'
      case 'scanning':
        return 'Monitoring 2M frequencies for SSTV transmissions'
      default:
        return 'System status unknown'
    }
  }

  return (
    <header className="bg-bg-secondary px-8 py-4 flex justify-between items-center border-b border-border">
      <h1 className="text-2xl font-semibold">RFCapture</h1>
      <div className="flex items-center gap-4">
        <Tooltip content={getStatusTooltip()} position="bottom">
          <span
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium cursor-help',
              status === 'idle' && 'bg-text-secondary/20 text-text-secondary',
              status === 'waiting' && 'bg-warning/20 text-warning',
              status === 'recording' && 'bg-accent/20 text-accent animate-pulse',
              status === 'decoding' && 'bg-success/20 text-success',
              status === 'scanning' && 'bg-purple/20 text-purple animate-pulse'
            )}
          >
            {getStatusText()}
          </span>
        </Tooltip>
        <Tooltip
          content={
            connected
              ? 'WebSocket connection to server is active'
              : 'Lost connection to server, attempting to reconnect'
          }
          position="bottom"
        >
          <div
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium uppercase cursor-help',
              connected ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
            )}
          >
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </Tooltip>
      </div>
    </header>
  )
}
