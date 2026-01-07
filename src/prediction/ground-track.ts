import * as satellite from 'satellite.js'
import type { GroundTrack, GroundTrackPoint, SatelliteInfo, TwoLineElement } from '../types'

export function computeGroundTrack(
  tle: TwoLineElement,
  satelliteInfo: SatelliteInfo,
  startTime: Date,
  durationMinutes: number,
  stepSeconds: number
): GroundTrack {
  const points: GroundTrackPoint[] = []
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2)
  const current = new Date(startTime)
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000)

  while (current <= endTime) {
    try {
      const positionAndVelocity = satellite.propagate(satrec, current)
      const position = positionAndVelocity.position

      if (typeof position !== 'boolean') {
        const gmst = satellite.gstime(current)
        const geodetic = satellite.eciToGeodetic(position, gmst)

        points.push({
          lat: satellite.degreesLat(geodetic.latitude),
          lng: satellite.degreesLong(geodetic.longitude),
        })
      }
    } catch {
      // Skip invalid positions
    }

    current.setSeconds(current.getSeconds() + stepSeconds)
  }

  return {
    noradId: satelliteInfo.noradId,
    name: satelliteInfo.name,
    signalType: satelliteInfo.signalType,
    points,
  }
}
