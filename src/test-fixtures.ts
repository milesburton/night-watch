import type { Coordinates, SatelliteInfo, SatellitePosition, TwoLineElement } from '@backend/types'

export const TEST_STATION: Coordinates = {
  latitude: 51.5069,
  longitude: -0.1276,
  altitude: 10,
}

export const TEST_TLE: TwoLineElement = {
  name: 'NOAA 19',
  line1: '1 33591U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990',
  line2: '2 33591  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708',
}

export const TEST_SATELLITE: SatelliteInfo = {
  name: 'NOAA 19',
  noradId: 33591,
  frequency: 137.1e6,
  signalType: 'apt',
  signalConfig: { type: 'apt', bandwidth: 34000, sampleRate: 48000, demodulation: 'fm' },
  enabled: true,
}

export const TEST_ISS: SatelliteInfo = {
  name: 'ISS',
  noradId: 25544,
  frequency: 145.8e6,
  signalType: 'sstv',
  signalConfig: { type: 'sstv', bandwidth: 3000, sampleRate: 48000, demodulation: 'fm' },
  enabled: false,
  eventBased: true,
}

export const TEST_SATELLITES: SatelliteInfo[] = [TEST_SATELLITE]

export const TEST_TLES: TwoLineElement[] = [TEST_TLE]

export function createTestPosition(overrides: Partial<SatellitePosition> = {}): SatellitePosition {
  return {
    azimuth: 180,
    elevation: 45,
    rangeSat: 1000,
    timestamp: new Date('2024-01-01T12:00:00Z'),
    ...overrides,
  }
}
