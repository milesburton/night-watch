import { cn } from '@/lib/utils'
import type { SystemStatus } from '@/types'

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

  return (
    <header className="bg-bg-secondary px-8 py-4 flex justify-between items-center border-b border-border">
      <h1 className="text-2xl font-semibold">RFCapture</h1>
      <div className="flex items-center gap-4">
        <span
          className={cn(
            'px-3 py-1 rounded-full text-sm font-medium',
            status === 'idle' && 'bg-text-secondary/20 text-text-secondary',
            status === 'waiting' && 'bg-warning/20 text-warning',
            status === 'recording' && 'bg-accent/20 text-accent animate-pulse',
            status === 'decoding' && 'bg-success/20 text-success',
            status === 'scanning' && 'bg-purple/20 text-purple animate-pulse'
          )}
        >
          {getStatusText()}
        </span>
        <div
          className={cn(
            'px-3 py-1 rounded-full text-xs font-medium uppercase',
            connected ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
          )}
        >
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </header>
  )
}
