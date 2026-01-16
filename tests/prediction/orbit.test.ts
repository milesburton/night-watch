import { createObserver, findPasses, getSatellitePosition } from '@backend/prediction/orbit'
import { describe, expect, it } from 'vitest'
import { TEST_SATELLITE, TEST_STATION, TEST_TLE } from '../fixtures'

describe('orbit calculations', () => {
  describe('createObserver', () => {
    it('should convert coordinates to radians', () => {
      const observer = createObserver(TEST_STATION)

      expect(observer.latitude).toBeCloseTo(0.899, 2)
      expect(observer.longitude).toBeCloseTo(-0.00223, 3)
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
