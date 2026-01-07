import type { SatelliteInfo } from '../types'

export const NOAA_SATELLITES: SatelliteInfo[] = [
  {
    name: 'NOAA 15',
    noradId: 25338,
    frequency: 137.6125e6,
  },
  {
    name: 'NOAA 18',
    noradId: 28654,
    frequency: 137.9125e6,
  },
  {
    name: 'NOAA 19',
    noradId: 33591,
    frequency: 137.1e6,
  },
]

export const CELESTRAK_GP_API = 'https://celestrak.org/NORAD/elements/gp.php'

export const PASS_CONSTRAINTS = {
  minDurationSeconds: 240,
  maxDurationSeconds: 1200,
  predictionHorizonHours: 24,
  captureBufferSeconds: 60,
}

export const SIGNAL = {
  scanBandwidthHz: 25000,
  scanDurationSeconds: 5,
}
