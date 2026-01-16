interface DopplerChartProps {
  current: number
  min: number
  max: number
  visible: boolean
}

export function DopplerChart({ current, min, max, visible }: DopplerChartProps) {
  if (!visible) return null

  const range = max - min
  const normalizedCurrent = range > 0 ? ((current - min) / range) * 100 : 50

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Doppler Shift</h2>
      <div className="space-y-4">
        <div className="flex justify-between text-sm text-text-secondary">
          <span>Current: {current.toFixed(0)} Hz</span>
          <span>
            Range: {min.toFixed(0)} to {max.toFixed(0)} Hz
          </span>
        </div>
        <svg className="w-full h-[100px]" viewBox="0 0 600 100" preserveAspectRatio="xMidYMid meet">
          <title>Doppler Shift Chart</title>
          {/* Zero line */}
          <line
            x1="0"
            y1="50"
            x2="600"
            y2="50"
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
          {/* Current value marker */}
          <circle
            cx={normalizedCurrent * 6}
            cy="50"
            r="6"
            fill="#3b82f6"
            className="animate-pulse"
          />
          {/* Min/Max labels */}
          <text x="10" y="90" fill="#64748b" fontSize="12">
            {min.toFixed(0)} Hz
          </text>
          <text x="540" y="90" fill="#64748b" fontSize="12" textAnchor="end">
            {max.toFixed(0)} Hz
          </text>
        </svg>
      </div>
    </div>
  )
}
