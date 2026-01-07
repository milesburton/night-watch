import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { loadConfig } from '../src/config/config'

describe('config', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.STATION_LATITUDE = '51.5'
    process.env.STATION_LONGITUDE = '-0.1'
    process.env.STATION_ALTITUDE = '25'
    process.env.SDR_GAIN = '40'
    process.env.MIN_ELEVATION = '15'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('should load config from environment', () => {
    const config = loadConfig()

    expect(config.station.latitude).toBe(51.5)
    expect(config.station.longitude).toBe(-0.1)
    expect(config.station.altitude).toBe(25)
    expect(config.sdr.gain).toBe(40)
    expect(config.recording.minElevation).toBe(15)
  })

  it('should have valid coordinate ranges', () => {
    const config = loadConfig()

    expect(config.station.latitude).toBeGreaterThanOrEqual(-90)
    expect(config.station.latitude).toBeLessThanOrEqual(90)
    expect(config.station.longitude).toBeGreaterThanOrEqual(-180)
    expect(config.station.longitude).toBeLessThanOrEqual(180)
  })
})
