import type { DopplerData, DopplerPoint, SatellitePosition } from '@backend/types'

export const SPEED_OF_LIGHT = 299792458

export function calculateRadialVelocity(
  prev: SatellitePosition | undefined,
  current: SatellitePosition,
  next: SatellitePosition | undefined
): number {
  if (next) {
    const dt = (next.timestamp.getTime() - current.timestamp.getTime()) / 1000
    if (dt !== 0) {
      const dRange = (next.rangeSat - current.rangeSat) * 1000
      return dRange / dt
    }
  }

  if (prev) {
    const dt = (current.timestamp.getTime() - prev.timestamp.getTime()) / 1000
    if (dt !== 0) {
      const dRange = (current.rangeSat - prev.rangeSat) * 1000
      return dRange / dt
    }
  }

  return 0
}

export function calculateDopplerShift(
  baseFrequency: number,
  positions: SatellitePosition[]
): DopplerData {
  if (positions.length === 0) {
    return { points: [], maxShift: 0, minShift: 0 }
  }

  let maxShift = Number.NEGATIVE_INFINITY
  let minShift = Number.POSITIVE_INFINITY

  const points: DopplerPoint[] = positions.map((pos, index, arr) => {
    const velocity = calculateRadialVelocity(arr[index - 1], pos, arr[index + 1])
    const shift = -baseFrequency * (velocity / SPEED_OF_LIGHT)

    if (shift > maxShift) maxShift = shift
    if (shift < minShift) minShift = shift

    return {
      timestamp: pos.timestamp,
      frequency: baseFrequency + shift,
      shift,
    }
  })

  return {
    points,
    maxShift: maxShift === Number.NEGATIVE_INFINITY ? 0 : maxShift,
    minShift: minShift === Number.POSITIVE_INFINITY ? 0 : minShift,
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
