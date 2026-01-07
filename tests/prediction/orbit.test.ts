import { describe, expect, it } from 'bun:test'
import { createObserver, findPasses, getSatellitePosition } from '../../src/prediction/orbit'
import type { Coordinates, SatelliteInfo, TwoLineElement } from '../../src/types'

const TEST_STATION: Coordinates = {
  latitude: 51.4761,
  longitude: 0.1709,
  altitude: 10,
}

const TEST_TLE: TwoLineElement = {
  name: 'NOAA 19',
  line1: '1 33591U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990',
  line2: '2 33591  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708',
}

const TEST_SATELLITE: SatelliteInfo = {
  name: 'NOAA 19',
  noradId: 33591,
  frequency: 137.1e6,
}

describe('orbit calculations', () => {
  describe('createObserver', () => {
    it('should convert coordinates to radians', () => {
      const observer = createObserver(TEST_STATION)

      expect(observer.latitude).toBeCloseTo(0.8983, 3)
      expect(observer.longitude).toBeCloseTo(0.00298, 3)
      expect(observer.height).toBeCloseTo(0.01, 2)
    })
  })

  describe('getSatellitePosition', () => {
    it('should return valid position data', () => {
      const observer = createObserver(TEST_STATION)
      const time = new Date('2025-03-27T12:00:00Z')

      const position = getSatellitePosition(TEST_TLE, observer, time)

      expect(position).not.toBeNull()
      expect(position?.azimuth).toBeGreaterThanOrEqual(0)
      expect(position?.azimuth).toBeLessThanOrEqual(360)
      expect(position?.elevation).toBeGreaterThanOrEqual(-90)
      expect(position?.elevation).toBeLessThanOrEqual(90)
      expect(position?.rangeSat).toBeGreaterThan(0)
    })

    it('should return different positions for different times', () => {
      const observer = createObserver(TEST_STATION)
      const time1 = new Date('2025-03-27T12:00:00Z')
      const time2 = new Date('2025-03-27T12:10:00Z')

      const pos1 = getSatellitePosition(TEST_TLE, observer, time1)
      const pos2 = getSatellitePosition(TEST_TLE, observer, time2)

      expect(pos1).not.toBeNull()
      expect(pos2).not.toBeNull()
      expect(pos1?.azimuth).not.toEqual(pos2?.azimuth)
    })
  })

  describe('findPasses', () => {
    it('should find passes within a time window', () => {
      const observer = createObserver(TEST_STATION)
      const startTime = new Date('2025-03-27T00:00:00Z')
      const endTime = new Date('2025-03-27T23:59:59Z')

      const passes = findPasses(TEST_TLE, TEST_SATELLITE, observer, startTime, endTime, 10)

      expect(passes.length).toBeGreaterThan(0)
      expect(passes.length).toBeLessThanOrEqual(4)

      for (const pass of passes) {
        expect(pass.satellite.name).toBe('NOAA 19')
        expect(pass.aos.getTime()).toBeLessThan(pass.los.getTime())
        expect(pass.maxElevation).toBeGreaterThanOrEqual(10)
        expect(pass.duration).toBeGreaterThanOrEqual(240)
        expect(pass.duration).toBeLessThanOrEqual(1200)
      }
    })

    it('should return empty array when no passes above minimum elevation', () => {
      const observer = createObserver(TEST_STATION)
      const startTime = new Date('2025-03-27T00:00:00Z')
      const endTime = new Date('2025-03-27T00:30:00Z')

      const passes = findPasses(TEST_TLE, TEST_SATELLITE, observer, startTime, endTime, 85)

      expect(passes.length).toBe(0)
    })
  })
})
