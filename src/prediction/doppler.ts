import type { DopplerData, DopplerPoint, SatellitePosition } from '../types'

const SPEED_OF_LIGHT = 299792458

export function calculateRadialVelocity(
  current: SatellitePosition,
  next: SatellitePosition | undefined
): number {
  if (!next) return 0

  const dt = (next.timestamp.getTime() - current.timestamp.getTime()) / 1000
  if (dt === 0) return 0

  const dRange = (next.rangeSat - current.rangeSat) * 1000
  return dRange / dt
}

export function calculateDopplerShift(
  baseFrequency: number,
  positions: SatellitePosition[]
): DopplerData {
  if (positions.length === 0) {
    return { points: [], maxShift: 0, minShift: 0 }
  }

  const points: DopplerPoint[] = positions.map((pos, index, arr) => {
    const velocity = calculateRadialVelocity(pos, arr[index + 1])
    const shift = -baseFrequency * (velocity / SPEED_OF_LIGHT)
    return {
      timestamp: pos.timestamp,
      frequency: baseFrequency + shift,
      shift,
    }
  })

  const shifts = points.map((p) => p.shift)
  return {
    points,
    maxShift: Math.max(...shifts),
    minShift: Math.min(...shifts),
  }
}

export function formatFrequency(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(6)} GHz`
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(4)} MHz`
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kHz`
  return `${hz.toFixed(0)} Hz`
}

export function formatDopplerShift(hz: number): string {
  const sign = hz >= 0 ? '+' : ''
  if (Math.abs(hz) >= 1e3) return `${sign}${(hz / 1e3).toFixed(2)} kHz`
  return `${sign}${hz.toFixed(0)} Hz`
}
