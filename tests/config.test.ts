import { describe, expect, it } from 'bun:test'
import { loadConfig } from '../src/config/config'

describe('config', () => {
  it('should load config from environment', () => {
    const config = loadConfig()

    expect(config.station.latitude).toBe(51.4761)
    expect(config.station.longitude).toBe(0.1709)
    expect(config.station.altitude).toBe(10)
    expect(config.sdr.gain).toBe(45)
    expect(config.recording.minElevation).toBe(20)
  })

  it('should have valid coordinate ranges', () => {
    const config = loadConfig()

    expect(config.station.latitude).toBeGreaterThanOrEqual(-90)
    expect(config.station.latitude).toBeLessThanOrEqual(90)
    expect(config.station.longitude).toBeGreaterThanOrEqual(-180)
    expect(config.station.longitude).toBeLessThanOrEqual(180)
  })
})
