import { formatDuration } from '@/lib/utils'
import type { SatellitePass } from '@/types'

interface PassesTableProps {
  passes: SatellitePass[]
}

function formatTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getSignalBadgeClass(signalType: string): string {
  switch (signalType) {
    case 'apt':
      return 'bg-accent/20 text-accent'
    case 'sstv':
      return 'bg-purple/20 text-purple'
    default:
      return 'bg-text-muted/20 text-text-muted'
  }
}

export function PassesTable({ passes }: PassesTableProps) {
  if (passes.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Upcoming Passes</h2>
        <p className="text-text-secondary text-center py-8">No upcoming passes scheduled</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Upcoming Passes</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-2 text-text-secondary font-medium">Satellite</th>
              <th className="text-left py-3 px-2 text-text-secondary font-medium">Signal</th>
              <th className="text-left py-3 px-2 text-text-secondary font-medium">Frequency</th>
              <th className="text-left py-3 px-2 text-text-secondary font-medium">Time</th>
              <th className="text-left py-3 px-2 text-text-secondary font-medium">Duration</th>
              <th className="text-left py-3 px-2 text-text-secondary font-medium">Max Elev</th>
            </tr>
          </thead>
          <tbody>
            {passes.map((pass, index) => (
              <tr
                key={`${pass.satellite.name}-${pass.aos}`}
                className={`border-b border-border/50 hover:bg-bg-secondary/50 transition-colors ${
                  index === 0 ? 'bg-accent/5' : ''
                }`}
              >
                <td className="py-3 px-2 font-medium">{pass.satellite.name}</td>
                <td className="py-3 px-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium uppercase ${getSignalBadgeClass(
                      pass.satellite.signalType
                    )}`}
                  >
                    {pass.satellite.signalType}
                  </span>
                </td>
                <td className="py-3 px-2 text-text-secondary font-mono text-xs">
                  {(pass.satellite.frequency / 1e6).toFixed(3)} MHz
                </td>
                <td className="py-3 px-2 text-text-secondary">{formatTime(pass.aos)}</td>
                <td className="py-3 px-2 text-text-secondary">{formatDuration(pass.duration)}</td>
                <td className="py-3 px-2">
                  <span
                    className={`${
                      pass.maxElevation >= 45
                        ? 'text-success'
                        : pass.maxElevation >= 20
                          ? 'text-warning'
                          : 'text-text-muted'
                    }`}
                  >
                    {pass.maxElevation.toFixed(1)}°
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
