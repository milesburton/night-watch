import { describe, expect, it } from 'bun:test'
import { CELESTRAK_GP_API, NOAA_SATELLITES, PASS_CONSTRAINTS } from '../../src/satellites/constants'
import type { SatelliteInfo } from '../../src/types'

describe('satellite constants', () => {
  it('should have three NOAA satellites defined', () => {
    expect(NOAA_SATELLITES).toHaveLength(3)
  })

  it('should have correct NOAA satellite frequencies', () => {
    const noaa15 = NOAA_SATELLITES.find((s: SatelliteInfo) => s.name === 'NOAA 15')
    const noaa18 = NOAA_SATELLITES.find((s: SatelliteInfo) => s.name === 'NOAA 18')
    const noaa19 = NOAA_SATELLITES.find((s: SatelliteInfo) => s.name === 'NOAA 19')

    expect(noaa15?.frequency).toBe(137.6125e6)
    expect(noaa18?.frequency).toBe(137.9125e6)
    expect(noaa19?.frequency).toBe(137.1e6)
  })

  it('should have correct NORAD IDs', () => {
    const noaa15 = NOAA_SATELLITES.find((s: SatelliteInfo) => s.name === 'NOAA 15')
    const noaa18 = NOAA_SATELLITES.find((s: SatelliteInfo) => s.name === 'NOAA 18')
    const noaa19 = NOAA_SATELLITES.find((s: SatelliteInfo) => s.name === 'NOAA 19')

    expect(noaa15?.noradId).toBe(25338)
    expect(noaa18?.noradId).toBe(28654)
    expect(noaa19?.noradId).toBe(33591)
  })

  it('should have valid CelesTrak API URL', () => {
    expect(CELESTRAK_GP_API).toMatch(/^https:\/\/celestrak\.org/)
  })

  it('should have sensible pass constraints', () => {
    expect(PASS_CONSTRAINTS.minDurationSeconds).toBeLessThan(PASS_CONSTRAINTS.maxDurationSeconds)
    expect(PASS_CONSTRAINTS.predictionHorizonHours).toBeGreaterThan(0)
  })
})
