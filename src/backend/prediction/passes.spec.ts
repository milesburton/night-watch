import { TEST_SATELLITE, TEST_SATELLITES, TEST_STATION, TEST_TLES } from '@/test-fixtures'
import { filterHighQualityPasses, formatPass, predictPasses } from '@backend/prediction/passes'
import type { SatellitePass } from '@backend/types'
import { describe, expect, it } from 'vitest'

describe('pass prediction', () => {
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
  })

  describe('filterHighQualityPasses', () => {
    it('should keep high elevation passes', () => {
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
  })
})
