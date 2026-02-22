import type { SystemStats } from '@/types'
import { useEffect, useState } from 'react'
import { Tooltip } from './Tooltip'

const POLL_INTERVAL_MS = 10_000

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function usageColor(pct: number): string {
  if (pct >= 90) return 'bg-error'
  if (pct >= 70) return 'bg-warning'
  return 'bg-success'
}

function Gauge({ label, pct, tooltip }: { label: string; pct: number; tooltip: string }) {
  return (
    <Tooltip content={tooltip} position="top">
      <div className="flex flex-col gap-1 cursor-help min-w-0">
        <div className="flex justify-between text-[10px] font-mono">
          <span className="text-text-secondary">{label}</span>
          <span
            className={pct >= 90 ? 'text-error' : pct >= 70 ? 'text-warning' : 'text-text-primary'}
          >
            {pct}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${usageColor(pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Tooltip>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-text-secondary text-[10px]">{label}</span>
      <span className="font-mono text-[10px] text-text-primary tabular-nums">{value}</span>
    </div>
  )
}

export function ServerStats() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/system-stats')
        if (!res.ok) throw new Error()
        setStats(await res.json())
        setError(false)
      } catch {
        setError(true)
      }
    }
    fetch_()
    const id = setInterval(fetch_, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  if (error) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">Server</h2>
        <p className="text-text-muted text-xs">Stats unavailable</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">Server</h2>
        <div className="animate-pulse h-16 bg-bg-tertiary rounded" />
      </div>
    )
  }

  const { cpu, memory, disk, uptimeSeconds } = stats

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-3">Server</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Gauge
            label="CPU"
            pct={cpu.usagePercent}
            tooltip={`${cpu.cores}-core ${cpu.model.split(' ').slice(0, 3).join(' ')}`}
          />
          <StatItem
            label="Load avg"
            value={`${cpu.loadAvg[0].toFixed(2)} / ${cpu.loadAvg[1].toFixed(2)} / ${cpu.loadAvg[2].toFixed(2)}`}
          />
          <StatItem label="Cores" value={String(cpu.cores)} />
        </div>

        <div className="space-y-2">
          <Gauge
            label="RAM"
            pct={memory.usagePercent}
            tooltip={`${memory.usedMb} MB used of ${memory.totalMb} MB`}
          />
          <StatItem label="Used" value={`${memory.usedMb} MB`} />
          <StatItem label="Free" value={`${memory.freeMb} MB`} />
        </div>

        {disk ? (
          <div className="space-y-2">
            <Gauge
              label={`Disk (${disk.mountpoint})`}
              pct={disk.usagePercent}
              tooltip={`${disk.usedGb} GB used of ${disk.totalGb} GB`}
            />
            <StatItem label="Used" value={`${disk.usedGb} GB`} />
            <StatItem label="Free" value={`${disk.freeGb} GB`} />
          </div>
        ) : (
          <div className="space-y-2">
            <span className="text-text-muted text-[10px]">Disk info unavailable</span>
          </div>
        )}

        <div className="space-y-2">
          <StatItem label="Uptime" value={formatUptime(uptimeSeconds)} />
          <StatItem label="Platform" value={stats.platform.split(' ').slice(0, 2).join(' ')} />
        </div>
      </div>
    </div>
  )
}
