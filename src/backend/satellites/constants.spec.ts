import { CELESTRAK_GP_API, SATELLITES, PASS_CONSTRAINTS } from '@backend/satellites/constants'
import type { SatelliteInfo } from '@backend/types'
import { describe, expect, it } from 'vitest'

describe('satellite constants', () => {
  it('should have METEOR-M and ISS satellites defined', () => {
    expect(SATELLITES).toHaveLength(3)
  })

  it('should have correct METEOR-M satellite frequencies', () => {
    const meteorN23 = SATELLITES.find((s: SatelliteInfo) => s.name === 'METEOR-M N2-3')
    const meteorN24 = SATELLITES.find((s: SatelliteInfo) => s.name === 'METEOR-M N2-4')
    const iss = SATELLITES.find((s: SatelliteInfo) => s.name === 'ISS')

    expect(meteorN23?.frequency).toBe(137.9e6)
    expect(meteorN24?.frequency).toBe(137.9e6)
    expect(iss?.frequency).toBe(145.8e6)
  })

  it('should have correct NORAD IDs', () => {
    const meteorN23 = SATELLITES.find((s: SatelliteInfo) => s.name === 'METEOR-M N2-3')
    const meteorN24 = SATELLITES.find((s: SatelliteInfo) => s.name === 'METEOR-M N2-4')
    const iss = SATELLITES.find((s: SatelliteInfo) => s.name === 'ISS')

    expect(meteorN23?.noradId).toBe(57166)
    expect(meteorN24?.noradId).toBe(59051)
    expect(iss?.noradId).toBe(25544)
  })

  it('should have valid CelesTrak API URL', () => {
    expect(CELESTRAK_GP_API).toMatch(/^https:\/\/celestrak\.org/)
  })

  it('should have sensible pass constraints', () => {
    expect(PASS_CONSTRAINTS.minDurationSeconds).toBeLessThan(PASS_CONSTRAINTS.maxDurationSeconds)
    expect(PASS_CONSTRAINTS.predictionHorizonHours).toBeGreaterThan(0)
  })
})
