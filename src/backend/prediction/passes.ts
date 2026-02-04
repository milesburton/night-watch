import type {
  Coordinates,
  PassPrediction,
  SatelliteInfo,
  SatellitePass,
  SatellitePosition,
  TwoLineElement,
} from '@backend/types'
import { logger } from '../utils/logger'
import { calculateDopplerShift } from './doppler'
import { createObserver, findPasses, getSatellitePosition, refinePassTiming } from './orbit'

export interface PredictionOptions {
  startTime?: Date
  hoursAhead?: number
  minElevation?: number
}

export function predictPasses(
  satellites: SatelliteInfo[],
  tles: TwoLineElement[],
  station: Coordinates,
  options: PredictionOptions = {}
): SatellitePass[] {
  const { startTime = new Date(), hoursAhead = 24, minElevation = 20 } = options

  const endTime = new Date(startTime.getTime() + hoursAhead * 60 * 60 * 1000)
  const observer = createObserver(station)
  const allPasses: SatellitePass[] = []

  for (const sat of satellites) {
    // Try multiple name matching strategies for flexibility
    const tle = tles.find((t) => {
      const tleName = t.name.toLowerCase().replace(/\s+/g, '')
      const satName = sat.name.toLowerCase().replace(/\s+/g, '')

      // Direct match (case-insensitive, whitespace-insensitive)
      if (tleName === satName) return true

      // NORAD ID match (most reliable)
      const tleNoradMatch = t.line1.match(/^1\s+(\d+)/)
      if (tleNoradMatch?.[1] && Number.parseInt(tleNoradMatch[1]) === sat.noradId) return true

      // Partial name match (for METEOR-M2 vs METEOR-M N2 variations)
      if (tleName.includes(satName.slice(0, 8)) || satName.includes(tleName.slice(0, 8))) return true

      return false
    })

    if (!tle) {
      logger.warn(`No TLE found for ${sat.name} (NORAD ${sat.noradId})`)
      continue
    }

    const passes = findPasses(tle, sat, observer, startTime, endTime, minElevation)

    for (const pass of passes) {
      const refined = refinePassTiming(tle, pass, observer, minElevation)
      allPasses.push(refined)
    }

    logger.debug(`Found ${passes.length} passes for ${sat.name}`)
  }

  return allPasses.sort((a, b) => a.aos.getTime() - b.aos.getTime())
}

export function filterHighQualityPasses(
  passes: SatellitePass[],
  minElevation = 30
): SatellitePass[] {
  return passes.filter((pass) => {
    if (pass.maxElevation >= 40) return true
    if (pass.maxElevation >= minElevation && pass.duration >= 360) return true
    return false
  })
}

export function formatPass(pass: SatellitePass): string {
  const aos = pass.aos.toLocaleString('en-GB', { hour12: false })
  const los = pass.los.toLocaleTimeString('en-GB', { hour12: false })
  const duration = Math.round(pass.duration / 60)

  return `${pass.satellite.name}: ${aos} → ${los} (${duration}min, max ${pass.maxElevation.toFixed(1)}°)`
}

export function formatPassesTable(passes: SatellitePass[]): string {
  const lines = [
    '┌─────────────┬─────────────────────┬──────────┬───────────┬──────────┐',
    '│ Satellite   │ Start Time          │ Duration │ Max Elev  │ Status   │',
    '├─────────────┼─────────────────────┼──────────┼───────────┼──────────┤',
  ]

  const now = new Date()

  for (const pass of passes) {
    const name = pass.satellite.name.padEnd(11)
    const start = pass.aos.toLocaleString('en-GB', { hour12: false }).padEnd(19)
    const duration = `${Math.round(pass.duration / 60)}min`.padEnd(8)
    const elev = `${pass.maxElevation.toFixed(1)}°`.padEnd(9)

    let status = 'Pending'
    if (now >= pass.aos && now <= pass.los) status = 'Active'
    else if (now > pass.los) status = 'Passed'

    lines.push(`│ ${name} │ ${start} │ ${duration} │ ${elev} │ ${status.padEnd(8)} │`)
  }

  lines.push('└─────────────┴─────────────────────┴──────────┴───────────┴──────────┘')

  return lines.join('\n')
}

export function getPassPositions(
  tle: TwoLineElement,
  pass: SatellitePass,
  station: Coordinates,
  stepSeconds = 10
): SatellitePosition[] {
  const observer = createObserver(station)
  const positions: SatellitePosition[] = []
  const current = new Date(pass.aos)

  while (current <= pass.los) {
    const position = getSatellitePosition(tle, observer, current)
    if (position) {
      positions.push(position)
    }
    current.setSeconds(current.getSeconds() + stepSeconds)
  }

  return positions
}

export function predictPassesWithDoppler(
  satellites: SatelliteInfo[],
  tles: TwoLineElement[],
  station: Coordinates,
  options: PredictionOptions = {}
): PassPrediction[] {
  const passes = predictPasses(satellites, tles, station, options)

  return passes.map((pass) => {
    const tle = tles.find(
      (t) =>
        t.name.includes(pass.satellite.name) ||
        t.name.includes(pass.satellite.name.replace(' ', '-'))
    )

    if (!tle) {
      return { pass, positions: [] }
    }

    const positions = getPassPositions(tle, pass, station)
    const doppler = calculateDopplerShift(pass.satellite.frequency, positions)

    return { pass, positions, doppler }
  })
}
