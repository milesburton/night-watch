import { loadConfig } from '@backend/config/config'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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

  it('should default to full service mode', () => {
    const config = loadConfig()
    expect(config.serviceMode).toBe('full')
  })

  it('should load sdr-relay mode from environment', () => {
    process.env.SERVICE_MODE = 'sdr-relay'
    process.env.SDR_RELAY_PORT = '3001'
    process.env.SDR_RELAY_HOST = '0.0.0.0'

    const config = loadConfig()
    expect(config.serviceMode).toBe('sdr-relay')
    expect(config.sdrRelay.port).toBe(3001)
    expect(config.sdrRelay.host).toBe('0.0.0.0')
  })

  it('should load server mode from environment', () => {
    process.env.SERVICE_MODE = 'server'
    process.env.SDR_RELAY_URL = 'http://10.0.0.100:3001'

    const config = loadConfig()
    expect(config.serviceMode).toBe('server')
    expect(config.sdrRelay.url).toBe('http://10.0.0.100:3001')
  })
})
