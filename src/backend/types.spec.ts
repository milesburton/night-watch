import type {
  Coordinates,
  SatelliteInfo,
  SatellitePass,
  SignalConfig,
  SignalType,
  SystemStatus,
  TwoLineElement,
} from '@backend/types'
import { describe, expect, it } from 'vitest'

describe('shared types', () => {
  describe('Coordinates', () => {
    it('should accept valid coordinates', () => {
      const coords: Coordinates = {
        latitude: 51.5074,
        longitude: -0.1278,
        altitude: 10,
      }

      expect(coords.latitude).toBe(51.5074)
      expect(coords.longitude).toBe(-0.1278)
      expect(coords.altitude).toBe(10)
    })
  })

  describe('TwoLineElement', () => {
    it('should accept valid TLE data', () => {
      const tle: TwoLineElement = {
        name: 'NOAA 19',
        line1: '1 33591U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990',
        line2: '2 33591  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708',
      }

      expect(tle.name).toBe('NOAA 19')
      expect(tle.line1).toMatch(/^1 /)
      expect(tle.line2).toMatch(/^2 /)
    })
  })

  describe('SignalType', () => {
    it('should accept apt signal type', () => {
      const signalType: SignalType = 'apt'
      expect(signalType).toBe('apt')
    })

    it('should accept sstv signal type', () => {
      const signalType: SignalType = 'sstv'
      expect(signalType).toBe('sstv')
    })
  })

  describe('SignalConfig', () => {
    it('should accept APT signal config', () => {
      const config: SignalConfig = {
        type: 'apt',
        bandwidth: 34000,
        sampleRate: 48000,
        demodulation: 'fm',
      }

      expect(config.type).toBe('apt')
      expect(config.bandwidth).toBe(34000)
    })

    it('should accept SSTV signal config', () => {
      const config: SignalConfig = {
        type: 'sstv',
        bandwidth: 3000,
        sampleRate: 48000,
        demodulation: 'fm',
      }

      expect(config.type).toBe('sstv')
      expect(config.bandwidth).toBe(3000)
    })
  })

  describe('SatelliteInfo', () => {
    it('should accept full satellite info', () => {
      const sat: SatelliteInfo = {
        name: 'NOAA 19',
        noradId: 33591,
        frequency: 137.1e6,
        signalType: 'apt',
        signalConfig: { type: 'apt', bandwidth: 34000, sampleRate: 48000, demodulation: 'fm' },
        enabled: true,
      }

      expect(sat.name).toBe('NOAA 19')
      expect(sat.noradId).toBe(33591)
      expect(sat.frequency).toBe(137100000)
    })

    it('should accept event-based satellite', () => {
      const sat: SatelliteInfo = {
        name: 'ISS',
        noradId: 25544,
        frequency: 145.8e6,
        signalType: 'sstv',
        signalConfig: { type: 'sstv', bandwidth: 3000, sampleRate: 48000, demodulation: 'fm' },
        enabled: false,
        eventBased: true,
      }

      expect(sat.eventBased).toBe(true)
    })
  })

  describe('SatellitePass', () => {
    it('should accept valid pass data', () => {
      const sat: SatelliteInfo = {
        name: 'NOAA 19',
        noradId: 33591,
        frequency: 137.1e6,
        signalType: 'apt',
        signalConfig: { type: 'apt', bandwidth: 34000, sampleRate: 48000, demodulation: 'fm' },
        enabled: true,
      }

      const pass: SatellitePass = {
        satellite: sat,
        aos: new Date('2025-01-01T10:00:00Z'),
        los: new Date('2025-01-01T10:15:00Z'),
        maxElevation: 45,
        maxElevationTime: new Date('2025-01-01T10:07:30Z'),
        duration: 900,
      }

      expect(pass.maxElevation).toBe(45)
      expect(pass.duration).toBe(900)
      expect(pass.los.getTime() - pass.aos.getTime()).toBe(900000)
    })
  })

  describe('SystemStatus', () => {
    it('should accept idle status', () => {
      const status: SystemStatus = 'idle'
      expect(status).toBe('idle')
    })

    it('should accept capturing status', () => {
      const status: SystemStatus = 'capturing'
      expect(status).toBe('capturing')
    })

    it('should accept waiting status', () => {
      const status: SystemStatus = 'waiting'
      expect(status).toBe('waiting')
    })

    it('should accept decoding status', () => {
      const status: SystemStatus = 'decoding'
      expect(status).toBe('decoding')
    })
  })
})
