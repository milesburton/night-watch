import { describe, expect, it } from 'bun:test'
import { filterHighQualityPasses, formatPass, predictPasses } from '../../src/prediction/passes'
import type { Coordinates, SatelliteInfo, SatellitePass, TwoLineElement } from '../../src/types'

const TEST_STATION: Coordinates = {
  latitude: 51.4761,
  longitude: 0.1709,
  altitude: 10,
}

const TEST_SATELLITES: SatelliteInfo[] = [{ name: 'NOAA 19', noradId: 33591, frequency: 137.1e6 }]

const TEST_TLES: TwoLineElement[] = [
  {
    name: 'NOAA 19',
    line1: '1 33591U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990',
    line2: '2 33591  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708',
  },
]

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
        satellite: TEST_SATELLITES[0]!,
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
        satellite: TEST_SATELLITES[0]!,
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
        satellite: { name: 'NOAA 19', noradId: 33591, frequency: 137.1e6 },
        aos: new Date('2025-03-27T10:30:00'),
        los: new Date('2025-03-27T10:45:00'),
        maxElevation: 65.5,
        maxElevationTime: new Date('2025-03-27T10:37:30'),
        duration: 900,
      }

      const formatted = formatPass(mockPass)

      expect(formatted).toContain('NOAA 19')
      expect(formatted).toContain('15min')
      expect(formatted).toContain('65.5°')
    })
  })
})
