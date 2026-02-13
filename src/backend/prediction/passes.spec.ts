import { TEST_SATELLITE, TEST_SATELLITES, TEST_STATION, TEST_TLE, TEST_TLES } from '@/test-fixtures'
import {
  filterHighQualityPasses,
  formatPass,
  formatPassesTable,
  getPassPositions,
  predictPasses,
  predictPassesWithDoppler,
} from '@backend/prediction/passes'
import type { SatelliteInfo, SatellitePass } from '@backend/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('pass prediction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('predictPasses', () => {
    it('should return passes sorted by time', () => {
      const passes = predictPasses(TEST_SATELLITES, TEST_TLES, TEST_STATION, {
        hoursAhead: 48,
        minElevation: 10,
      })

      for (let i = 1; i < passes.length; i++) {
        const prev = passes[i - 1]
        const curr = passes[i]
        if (prev && curr) {
          expect(prev.aos.getTime()).toBeLessThanOrEqual(curr.aos.getTime())
        }
      }
    })

    it('should use default options when none provided', () => {
      const passes = predictPasses(TEST_SATELLITES, TEST_TLES, TEST_STATION)

      // Should use defaults: startTime=now, hoursAhead=24, minElevation=20
      expect(passes).toBeDefined()
      expect(Array.isArray(passes)).toBe(true)
    })

    it('should respect custom start time', () => {
      const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      const passes = predictPasses(TEST_SATELLITES, TEST_TLES, TEST_STATION, {
        startTime: futureStart,
        hoursAhead: 24,
      })

      // All passes should be after the start time
      for (const pass of passes) {
        expect(pass.aos.getTime()).toBeGreaterThanOrEqual(futureStart.getTime())
      }
    })

    it('should respect hoursAhead parameter', () => {
      const startTime = new Date()
      const hoursAhead = 12
      const passes = predictPasses(TEST_SATELLITES, TEST_TLES, TEST_STATION, {
        startTime,
        hoursAhead,
      })

      const endTime = new Date(startTime.getTime() + hoursAhead * 60 * 60 * 1000)

      // All passes should be within the time window
      for (const pass of passes) {
        expect(pass.aos.getTime()).toBeLessThanOrEqual(endTime.getTime())
      }
    })

    it('should match TLE by exact name (case-insensitive)', () => {
      const customSat: SatelliteInfo = {
        ...TEST_SATELLITE,
        name: 'meteor-m n2-3', // lowercase
      }

      const passes = predictPasses([customSat], TEST_TLES, TEST_STATION, {
        hoursAhead: 48,
      })

      expect(passes.length).toBeGreaterThan(0)
    })

    it('should match TLE by NORAD ID', () => {
      const customSat: SatelliteInfo = {
        ...TEST_SATELLITE,
        name: 'Different Name', // Wrong name but correct NORAD ID
        noradId: 57166,
      }

      const passes = predictPasses([customSat], TEST_TLES, TEST_STATION, {
        hoursAhead: 48,
      })

      expect(passes.length).toBeGreaterThan(0)
    })

    it('should match TLE by partial name', () => {
      const customSat: SatelliteInfo = {
        ...TEST_SATELLITE,
        name: 'METEOR-M', // Partial match
      }

      const passes = predictPasses([customSat], TEST_TLES, TEST_STATION, {
        hoursAhead: 48,
      })

      expect(passes.length).toBeGreaterThan(0)
    })

    it('should skip satellites without matching TLE', () => {
      const unknownSat: SatelliteInfo = {
        name: 'UNKNOWN SATELLITE',
        noradId: 99999,
        frequency: 137.5e6,
        signalType: 'lrpt',
        signalConfig: { type: 'lrpt', bandwidth: 120000, sampleRate: 1024000, demodulation: 'fm' },
        enabled: true,
      }

      const passes = predictPasses([unknownSat], TEST_TLES, TEST_STATION, {
        hoursAhead: 48,
      })

      expect(passes).toHaveLength(0)
    })

    it('should refine pass timing for all passes', () => {
      const passes = predictPasses(TEST_SATELLITES, TEST_TLES, TEST_STATION, {
        hoursAhead: 48,
      })

      // Refined passes should have reasonable durations
      for (const pass of passes) {
        expect(pass.duration).toBeGreaterThan(0)
        expect(pass.maxElevation).toBeGreaterThan(0)
      }
    })

    it('should handle empty satellite list', () => {
      const passes = predictPasses([], TEST_TLES, TEST_STATION)

      expect(passes).toHaveLength(0)
    })

    it('should handle empty TLE list', () => {
      const passes = predictPasses(TEST_SATELLITES, [], TEST_STATION)

      expect(passes).toHaveLength(0)
    })
  })

  describe('filterHighQualityPasses', () => {
    it('should keep high elevation passes (>= 40 degrees)', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date(),
        los: new Date(Date.now() + 600000),
        maxElevation: 45,
        maxElevationTime: new Date(Date.now() + 300000),
        duration: 600,
      }

      const filtered = filterHighQualityPasses([mockPass], 30)
      expect(filtered).toHaveLength(1)
    })

    it('should filter out low elevation passes', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date(),
        los: new Date(Date.now() + 300000),
        maxElevation: 15,
        maxElevationTime: new Date(Date.now() + 150000),
        duration: 300,
      }

      const filtered = filterHighQualityPasses([mockPass], 30)
      expect(filtered).toHaveLength(0)
    })

    it('should keep moderate elevation passes with long duration', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date(),
        los: new Date(Date.now() + 400000),
        maxElevation: 35, // Between minElevation (30) and 40
        maxElevationTime: new Date(Date.now() + 200000),
        duration: 400, // >= 360 seconds
      }

      const filtered = filterHighQualityPasses([mockPass], 30)
      expect(filtered).toHaveLength(1)
    })

    it('should filter out moderate elevation passes with short duration', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date(),
        los: new Date(Date.now() + 200000),
        maxElevation: 35, // Between minElevation (30) and 40
        maxElevationTime: new Date(Date.now() + 100000),
        duration: 200, // < 360 seconds
      }

      const filtered = filterHighQualityPasses([mockPass], 30)
      expect(filtered).toHaveLength(0)
    })

    it('should use custom minElevation parameter', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date(),
        los: new Date(Date.now() + 400000),
        maxElevation: 25, // Below default 30, but above custom 20
        maxElevationTime: new Date(Date.now() + 200000),
        duration: 400,
      }

      const filtered = filterHighQualityPasses([mockPass], 20)
      expect(filtered).toHaveLength(1)
    })

    it('should handle empty pass list', () => {
      const filtered = filterHighQualityPasses([])
      expect(filtered).toHaveLength(0)
    })

    it('should keep all high elevation passes regardless of duration', () => {
      const passes: SatellitePass[] = [
        {
          satellite: TEST_SATELLITE,
          aos: new Date(),
          los: new Date(Date.now() + 100000),
          maxElevation: 45,
          maxElevationTime: new Date(Date.now() + 50000),
          duration: 100, // Short duration but high elevation
        },
        {
          satellite: TEST_SATELLITE,
          aos: new Date(),
          los: new Date(Date.now() + 600000),
          maxElevation: 50,
          maxElevationTime: new Date(Date.now() + 300000),
          duration: 600,
        },
      ]

      const filtered = filterHighQualityPasses(passes, 30)
      expect(filtered).toHaveLength(2) // Both should be kept
    })
  })

  describe('formatPass', () => {
    it('should format pass information correctly', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date('2025-03-27T10:30:00'),
        los: new Date('2025-03-27T10:45:00'),
        maxElevation: 65.5,
        maxElevationTime: new Date('2025-03-27T10:37:30'),
        duration: 900,
      }

      const formatted = formatPass(mockPass)

      expect(formatted).toContain('METEOR-M N2-3')
      expect(formatted).toContain('15min')
      expect(formatted).toContain('65.5°')
    })

    it('should format duration in minutes', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date('2025-03-27T10:30:00'),
        los: new Date('2025-03-27T10:40:00'),
        maxElevation: 45,
        maxElevationTime: new Date('2025-03-27T10:35:00'),
        duration: 600, // 10 minutes
      }

      const formatted = formatPass(mockPass)

      expect(formatted).toContain('10min')
    })

    it('should include AOS and LOS times', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date('2025-03-27T10:30:00'),
        los: new Date('2025-03-27T10:45:00'),
        maxElevation: 65.5,
        maxElevationTime: new Date('2025-03-27T10:37:30'),
        duration: 900,
      }

      const formatted = formatPass(mockPass)

      expect(formatted).toContain('→')
    })
  })

  describe('formatPassesTable', () => {
    it('should format passes as a table', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date('2025-03-27T10:30:00'),
        los: new Date('2025-03-27T10:45:00'),
        maxElevation: 65.5,
        maxElevationTime: new Date('2025-03-27T10:37:30'),
        duration: 900,
      }

      const table = formatPassesTable([mockPass])

      expect(table).toContain('Satellite')
      expect(table).toContain('Start Time')
      expect(table).toContain('Duration')
      expect(table).toContain('Max Elev')
      expect(table).toContain('Status')
      expect(table).toContain('METEOR-M N2-3')
    })

    it('should show Pending status for future passes', () => {
      const futurePass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date(Date.now() + 3600000), // 1 hour from now
        los: new Date(Date.now() + 3900000),
        maxElevation: 45,
        maxElevationTime: new Date(Date.now() + 3750000),
        duration: 300,
      }

      const table = formatPassesTable([futurePass])

      expect(table).toContain('Pending')
    })

    it('should show Passed status for past passes', () => {
      const pastPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date(Date.now() - 3600000), // 1 hour ago
        los: new Date(Date.now() - 3300000),
        maxElevation: 45,
        maxElevationTime: new Date(Date.now() - 3450000),
        duration: 300,
      }

      const table = formatPassesTable([pastPass])

      expect(table).toContain('Passed')
    })

    it('should show Active status for current passes', () => {
      const activePass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date(Date.now() - 300000), // 5 minutes ago
        los: new Date(Date.now() + 300000), // 5 minutes from now
        maxElevation: 45,
        maxElevationTime: new Date(),
        duration: 600,
      }

      const table = formatPassesTable([activePass])

      expect(table).toContain('Active')
    })

    it('should handle multiple passes', () => {
      const passes: SatellitePass[] = [
        {
          satellite: TEST_SATELLITE,
          aos: new Date(Date.now() + 3600000),
          los: new Date(Date.now() + 3900000),
          maxElevation: 45,
          maxElevationTime: new Date(Date.now() + 3750000),
          duration: 300,
        },
        {
          satellite: TEST_SATELLITE,
          aos: new Date(Date.now() + 7200000),
          los: new Date(Date.now() + 7500000),
          maxElevation: 35,
          maxElevationTime: new Date(Date.now() + 7350000),
          duration: 300,
        },
      ]

      const table = formatPassesTable(passes)

      // Should have header + 2 pass rows
      expect(table.split('\n').length).toBeGreaterThan(5)
    })

    it('should include table borders', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date('2025-03-27T10:30:00'),
        los: new Date('2025-03-27T10:45:00'),
        maxElevation: 65.5,
        maxElevationTime: new Date('2025-03-27T10:37:30'),
        duration: 900,
      }

      const table = formatPassesTable([mockPass])

      expect(table).toContain('┌')
      expect(table).toContain('└')
      expect(table).toContain('│')
    })
  })

  describe('getPassPositions', () => {
    it('should return positions during pass', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date('2025-03-27T10:30:00'),
        los: new Date('2025-03-27T10:31:00'), // 1 minute pass
        maxElevation: 45,
        maxElevationTime: new Date('2025-03-27T10:30:30'),
        duration: 60,
      }

      const positions = getPassPositions(TEST_TLE, mockPass, TEST_STATION, 10)

      expect(positions.length).toBeGreaterThan(0)
      // With 10 second steps over 60 seconds, should have ~7 positions
      expect(positions.length).toBeGreaterThanOrEqual(6)
    })

    it('should use custom step size', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date('2025-03-27T10:30:00'),
        los: new Date('2025-03-27T10:31:00'), // 1 minute pass
        maxElevation: 45,
        maxElevationTime: new Date('2025-03-27T10:30:30'),
        duration: 60,
      }

      const positions30s = getPassPositions(TEST_TLE, mockPass, TEST_STATION, 30)
      const positions10s = getPassPositions(TEST_TLE, mockPass, TEST_STATION, 10)

      // Smaller step size should give more positions
      expect(positions10s.length).toBeGreaterThan(positions30s.length)
    })

    it('should include timestamps for each position', () => {
      const mockPass: SatellitePass = {
        satellite: TEST_SATELLITE,
        aos: new Date('2025-03-27T10:30:00'),
        los: new Date('2025-03-27T10:31:00'),
        maxElevation: 45,
        maxElevationTime: new Date('2025-03-27T10:30:30'),
        duration: 60,
      }

      const positions = getPassPositions(TEST_TLE, mockPass, TEST_STATION, 10)

      for (const pos of positions) {
        expect(pos.timestamp).toBeInstanceOf(Date)
        expect(pos.timestamp.getTime()).toBeGreaterThanOrEqual(mockPass.aos.getTime())
        // Allow small overshoot due to step iteration
        expect(pos.timestamp.getTime()).toBeLessThanOrEqual(mockPass.los.getTime() + 10000)
      }
    })
  })

  describe('predictPassesWithDoppler', () => {
    it('should return pass predictions with Doppler data', () => {
      const predictions = predictPassesWithDoppler(TEST_SATELLITES, TEST_TLES, TEST_STATION, {
        hoursAhead: 48,
      })

      expect(predictions.length).toBeGreaterThan(0)

      for (const pred of predictions) {
        expect(pred.pass).toBeDefined()
        expect(pred.positions).toBeDefined()
        expect(Array.isArray(pred.positions)).toBe(true)
      }
    })

    it('should include Doppler shift data when TLE found', () => {
      const predictions = predictPassesWithDoppler(TEST_SATELLITES, TEST_TLES, TEST_STATION, {
        hoursAhead: 48,
      })

      // At least some predictions should have Doppler data
      const withDoppler = predictions.filter((p) => p.doppler !== undefined)
      expect(withDoppler.length).toBeGreaterThan(0)
    })

    it('should handle passes without matching TLE', () => {
      const unknownSat: SatelliteInfo = {
        name: 'UNKNOWN SATELLITE',
        noradId: 99999,
        frequency: 137.5e6,
        signalType: 'lrpt',
        signalConfig: { type: 'lrpt', bandwidth: 120000, sampleRate: 1024000, demodulation: 'fm' },
        enabled: true,
      }

      // First get a valid pass, then modify it to use unknown satellite
      const validPasses = predictPasses(TEST_SATELLITES, TEST_TLES, TEST_STATION, {
        hoursAhead: 48,
      })

      if (validPasses.length > 0) {
        // Manually create a prediction with unknown satellite
        const testPass = { ...validPasses[0], satellite: unknownSat }
        const predictions = predictPassesWithDoppler([unknownSat], TEST_TLES, TEST_STATION, {
          hoursAhead: 48,
        })

        // Should handle gracefully even without TLE match
        expect(predictions).toBeDefined()
      }
    })

    it('should match TLE with space variations in satellite name', () => {
      const customSat: SatelliteInfo = {
        ...TEST_SATELLITE,
        name: 'METEOR M N2-3', // Space instead of dash
      }

      const predictions = predictPassesWithDoppler([customSat], TEST_TLES, TEST_STATION, {
        hoursAhead: 48,
      })

      expect(predictions.length).toBeGreaterThan(0)
    })
  })
})
