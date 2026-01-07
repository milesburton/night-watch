import * as satellite from 'satellite.js'
import type {
  Coordinates,
  SatelliteGeolocation,
  SatelliteInfo,
  SatellitePass,
  SatellitePosition,
  TwoLineElement,
} from '../types'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

export function createObserver(coords: Coordinates): satellite.GeodeticLocation {
  return {
    longitude: coords.longitude * DEG_TO_RAD,
    latitude: coords.latitude * DEG_TO_RAD,
    height: coords.altitude / 1000,
  }
}

const computeLookAngles = (
  positionEci: satellite.EciVec3<number>,
  observer: satellite.GeodeticLocation,
  time: Date
): SatellitePosition => {
  const gmst = satellite.gstime(time)
  const positionEcf = satellite.eciToEcf(positionEci, gmst)
  const lookAngles = satellite.ecfToLookAngles(observer, positionEcf)

  return {
    azimuth: lookAngles.azimuth * RAD_TO_DEG,
    elevation: lookAngles.elevation * RAD_TO_DEG,
    rangeSat: lookAngles.rangeSat,
    timestamp: time,
  }
}

export function getSatellitePosition(
  tle: TwoLineElement,
  observer: satellite.GeodeticLocation,
  time: Date
): SatellitePosition | null {
  try {
    const satrec = satellite.twoline2satrec(tle.line1, tle.line2)
    const positionAndVelocity = satellite.propagate(satrec, time)
    const position = positionAndVelocity.position

    return typeof position !== 'boolean' ? computeLookAngles(position, observer, time) : null
  } catch {
    return null
  }
}

export function getSatelliteGeolocation(
  tle: TwoLineElement,
  satelliteInfo: SatelliteInfo,
  time: Date
): SatelliteGeolocation | null {
  try {
    const satrec = satellite.twoline2satrec(tle.line1, tle.line2)
    const positionAndVelocity = satellite.propagate(satrec, time)
    const position = positionAndVelocity.position

    if (typeof position === 'boolean') return null

    const gmst = satellite.gstime(time)
    const geodetic = satellite.eciToGeodetic(position, gmst)

    return {
      noradId: satelliteInfo.noradId,
      name: satelliteInfo.name,
      latitude: satellite.degreesLat(geodetic.latitude),
      longitude: satellite.degreesLong(geodetic.longitude),
      altitude: geodetic.height,
      signalType: satelliteInfo.signalType,
    }
  } catch {
    return null
  }
}

export interface PassWindow {
  start: Date
  end: Date
  maxElevation: number
  maxElevationTime: Date
}

export function findPasses(
  tle: TwoLineElement,
  satelliteInfo: SatelliteInfo,
  observer: satellite.GeodeticLocation,
  startTime: Date,
  endTime: Date,
  minElevation: number,
  stepSeconds = 60
): SatellitePass[] {
  const passes: SatellitePass[] = []
  let inPass = false
  let passStart: Date | null = null
  let maxElev = 0
  let maxElevTime: Date | null = null

  const current = new Date(startTime)

  while (current <= endTime) {
    const position = getSatellitePosition(tle, observer, current)

    if (position) {
      if (position.elevation > minElevation && !inPass) {
        inPass = true
        passStart = new Date(current)
        maxElev = position.elevation
        maxElevTime = new Date(current)
      } else if (position.elevation > minElevation && inPass) {
        if (position.elevation > maxElev) {
          maxElev = position.elevation
          maxElevTime = new Date(current)
        }
      } else if (position.elevation <= minElevation && inPass && passStart && maxElevTime) {
        const duration = (current.getTime() - passStart.getTime()) / 1000

        if (duration >= 240 && duration <= 1200) {
          passes.push({
            satellite: satelliteInfo,
            aos: passStart,
            los: new Date(current),
            maxElevation: maxElev,
            maxElevationTime: maxElevTime,
            duration,
          })
        }

        inPass = false
        passStart = null
        maxElev = 0
        maxElevTime = null
      }
    }

    current.setSeconds(current.getSeconds() + stepSeconds)
  }

  return passes
}

export function refinePassTiming(
  tle: TwoLineElement,
  pass: SatellitePass,
  observer: satellite.GeodeticLocation,
  minElevation: number
): SatellitePass {
  const refineTime = (approximate: Date, searchDirection: 1 | -1): Date => {
    const current = new Date(approximate)
    current.setSeconds(current.getSeconds() + searchDirection * 60)

    for (let i = 0; i < 120; i++) {
      const position = getSatellitePosition(tle, observer, current)

      if (!position) break

      const isAboveHorizon = position.elevation > minElevation

      if (searchDirection === -1 && !isAboveHorizon) {
        current.setSeconds(current.getSeconds() + 1)
        return current
      }
      if (searchDirection === 1 && !isAboveHorizon) {
        current.setSeconds(current.getSeconds() - 1)
        return current
      }

      current.setSeconds(current.getSeconds() + searchDirection * 1)
    }

    return approximate
  }

  const refinedAos = refineTime(pass.aos, -1)
  const refinedLos = refineTime(pass.los, 1)

  let maxElev = 0
  let maxElevTime = pass.maxElevationTime
  const checkTime = new Date(refinedAos)

  while (checkTime <= refinedLos) {
    const position = getSatellitePosition(tle, observer, checkTime)

    if (position && position.elevation > maxElev) {
      maxElev = position.elevation
      maxElevTime = new Date(checkTime)
    }

    checkTime.setSeconds(checkTime.getSeconds() + 10)
  }

  return {
    ...pass,
    aos: refinedAos,
    los: refinedLos,
    maxElevation: maxElev,
    maxElevationTime: maxElevTime,
    duration: (refinedLos.getTime() - refinedAos.getTime()) / 1000,
  }
}
