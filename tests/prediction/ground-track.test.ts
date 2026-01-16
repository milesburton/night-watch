import { computeGroundTrack } from '@backend/prediction/ground-track'
import { describe, expect, it } from 'vitest'
import { TEST_SATELLITE, TEST_TLE } from '../fixtures'

describe('ground track computation', () => {
  describe('computeGroundTrack', () => {
    it('should compute ground track points', () => {
      const startTime = new Date('2025-03-27T12:00:00Z')
      const track = computeGroundTrack(TEST_TLE, TEST_SATELLITE, startTime, 90, 60)

      expect(track.points.length).toBeGreaterThan(0)
    })

    it('should return noradId and name in track', () => {
      const startTime = new Date('2025-03-27T12:00:00Z')
      const track = computeGroundTrack(TEST_TLE, TEST_SATELLITE, startTime, 10, 60)

      expect(track.noradId).toBe(TEST_SATELLITE.noradId)
      expect(track.name).toBe(TEST_SATELLITE.name)
      expect(track.signalType).toBe(TEST_SATELLITE.signalType)
    })

    it('should return points with valid coordinates', () => {
      const startTime = new Date('2025-03-27T12:00:00Z')
      const track = computeGroundTrack(TEST_TLE, TEST_SATELLITE, startTime, 30, 30)

      for (const point of track.points) {
        expect(point.lat).toBeGreaterThanOrEqual(-90)
        expect(point.lat).toBeLessThanOrEqual(90)
        expect(point.lng).toBeGreaterThanOrEqual(-180)
        expect(point.lng).toBeLessThanOrEqual(180)
      }
    })

    it('should compute more points for longer duration', () => {
      const startTime = new Date('2025-03-27T12:00:00Z')

      const shortTrack = computeGroundTrack(TEST_TLE, TEST_SATELLITE, startTime, 10, 60)
      const longTrack = computeGroundTrack(TEST_TLE, TEST_SATELLITE, startTime, 60, 60)

      expect(longTrack.points.length).toBeGreaterThan(shortTrack.points.length)
    })

    it('should compute more points with smaller step size', () => {
      const startTime = new Date('2025-03-27T12:00:00Z')

      const coarseTrack = computeGroundTrack(TEST_TLE, TEST_SATELLITE, startTime, 30, 120)
      const fineTrack = computeGroundTrack(TEST_TLE, TEST_SATELLITE, startTime, 30, 30)

      expect(fineTrack.points.length).toBeGreaterThan(coarseTrack.points.length)
    })

    it('should produce a continuous track (no large jumps except at date line)', () => {
      const startTime = new Date('2025-03-27T12:00:00Z')
      const track = computeGroundTrack(TEST_TLE, TEST_SATELLITE, startTime, 90, 30)

      for (let i = 1; i < track.points.length; i++) {
        const prev = track.points[i - 1]
        const curr = track.points[i]

        if (prev && curr) {
          // Allow larger longitude jumps at international date line
          const latDiff = Math.abs(curr.lat - prev.lat)
          expect(latDiff).toBeLessThan(10) // Latitude should change gradually
        }
      }
    })

    it('should handle 90-minute orbital period', () => {
      const startTime = new Date('2025-03-27T12:00:00Z')
      // Full orbit is ~90 minutes for LEO satellites
      const track = computeGroundTrack(TEST_TLE, TEST_SATELLITE, startTime, 90, 60)

      // Should have points for each minute plus endpoints
      expect(track.points.length).toBeGreaterThanOrEqual(90)
    })
  })
})
