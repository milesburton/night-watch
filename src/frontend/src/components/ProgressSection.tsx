import { formatDuration } from '@/lib/utils'
import type { CaptureProgress } from '@/types'

interface ProgressSectionProps {
  progress: CaptureProgress | null
  visible: boolean
}

export function ProgressSection({ progress, visible }: ProgressSectionProps) {
  if (!visible || !progress) return null

  const remaining = progress.total - progress.elapsed
  const percentage = Math.round((progress.elapsed / progress.total) * 100)

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Capture Progress</h2>
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
