import type { DemodulationType, SatelliteInfo, SignalConfig, SignalType } from '@backend/types'

export const SIGNAL_CONFIGS: Record<SignalType, SignalConfig> = {
  sstv: {
    type: 'sstv' as const,
    bandwidth: 3000,
    sampleRate: 48000,
    demodulation: 'fm' as DemodulationType,
  },
  lrpt: {
    type: 'lrpt' as const,
    bandwidth: 120000,
    sampleRate: 1024000,
    demodulation: 'fm' as DemodulationType,
  },
}

export const SATELLITES: SatelliteInfo[] = [
  {
    name: 'ISS',
    noradId: 25544,
    frequency: 145.8e6,
    signalType: 'sstv',
    signalConfig: SIGNAL_CONFIGS.sstv,
    enabled: false,
    eventBased: true,
  },
  {
    name: 'METEOR-M N2-3',
    noradId: 57166,
    frequency: 137.9e6,
    signalType: 'lrpt',
    signalConfig: SIGNAL_CONFIGS.lrpt,
    enabled: true,
  },
  {
    name: 'METEOR-M N2-4',
    noradId: 59051,
    frequency: 137.9e6,
    signalType: 'lrpt',
    signalConfig: SIGNAL_CONFIGS.lrpt,
    enabled: true,
  },
]

// All LRPT weather satellites
export const WEATHER_SATELLITES = SATELLITES.filter((s) => s.signalType === 'lrpt')

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
