import { formatDuration, formatFrequency } from '@/lib/utils'
import type { CaptureProgress, SatellitePass } from '@/types'

interface ProgressSectionProps {
  progress: CaptureProgress | null
  visible: boolean
  currentPass?: SatellitePass | null
}

const SATELLITE_INFO: Record<string, { description: string; wikiUrl: string }> = {
  'NOAA-15': {
    description: 'Weather satellite transmitting APT images at 137.62 MHz. Launched in 1998.',
    wikiUrl: 'https://en.wikipedia.org/wiki/NOAA-15',
  },
  'NOAA-18': {
    description: 'Weather satellite transmitting APT images at 137.9125 MHz. Launched in 2005.',
    wikiUrl: 'https://en.wikipedia.org/wiki/NOAA-18',
  },
  'NOAA-19': {
    description: 'Weather satellite transmitting APT images at 137.1 MHz. Launched in 2009.',
    wikiUrl: 'https://en.wikipedia.org/wiki/NOAA-19',
  },
  ISS: {
    description: 'International Space Station. Occasionally transmits SSTV images at 145.8 MHz.',
    wikiUrl: 'https://en.wikipedia.org/wiki/International_Space_Station',
  },
  'METEOR-M N2-3': {
    description:
      'Russian weather satellite transmitting LRPT images at 137.9 MHz. High-resolution digital imagery.',
    wikiUrl: 'https://en.wikipedia.org/wiki/Meteor-M_N2-3',
  },
  'METEOR-M N2-4': {
    description:
      'Russian weather satellite transmitting LRPT images at 137.9 MHz. High-resolution digital imagery.',
    wikiUrl: 'https://en.wikipedia.org/wiki/Meteor-M_N2-4',
  },
}

export function ProgressSection({ progress, visible, currentPass }: ProgressSectionProps) {
  if (!visible || !progress) return null

  const remaining = progress.total - progress.elapsed
  const percentage = Math.round((progress.elapsed / progress.total) * 100)
  const satName = currentPass?.satellite?.name || 'Unknown'
  const satInfo = SATELLITE_INFO[satName]
  const signalType = currentPass?.satellite?.signalType?.toUpperCase() || 'RF'

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Capturing: {satName}</h2>
          <p className="text-sm text-text-secondary mt-1">
            {signalType} signal at{' '}
            <span className="font-mono text-accent">
              {formatFrequency(currentPass?.satellite?.frequency || 0)}
            </span>
          </p>
        </div>
        <span className="px-2 py-1 text-xs font-medium rounded bg-accent/20 text-accent animate-pulse">
          LIVE
        </span>
      </div>

      {satInfo && (
        <div className="mb-4 p-3 bg-bg-tertiary rounded-lg">
          <p className="text-sm text-text-secondary">{satInfo.description}</p>
          <a
            href={satInfo.wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-2"
          >
            Learn more on Wikipedia
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      )}

      {currentPass && (
        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div>
            <span className="text-text-muted">Max Elevation</span>
            <p className="font-mono text-text-primary">{currentPass.maxElevation.toFixed(1)}°</p>
          </div>
          <div>
            <span className="text-text-muted">Pass Duration</span>
            <p className="font-mono text-text-primary">{formatDuration(currentPass.duration)}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="h-3 bg-bg-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-purple transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex justify-between text-sm text-text-secondary">
          <span>{percentage}%</span>
          <span>{formatDuration(remaining)} remaining</span>
        </div>
      </div>
    </div>
  )
}
