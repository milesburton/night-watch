export function formatFrequency(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(6)} GHz`
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(4)} MHz`
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kHz`
  return `${hz} Hz`
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Starting...'

  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((ms % (1000 * 60)) / 1000)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function formatDopplerShift(hz: number): string {
  const sign = hz >= 0 ? '+' : ''
  if (Math.abs(hz) >= 1e3) return `${sign}${(hz / 1e3).toFixed(2)} kHz`
  return `${sign}${Math.round(hz)} Hz`
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
