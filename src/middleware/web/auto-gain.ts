import { logger } from '@backend/utils/logger'

// ============================================
// Frequency Band Classification
// ============================================

export type FrequencyBand = 'noaa' | '2m' | 'unknown'

const BAND_RANGES: [FrequencyBand, number, number][] = [
  ['noaa', 136e6, 138e6], // 136-138 MHz: NOAA APT satellites
  ['2m', 144e6, 146e6], // 144-146 MHz: ISS SSTV + ground SSTV
]

export function classifyBand(frequencyHz: number): FrequencyBand {
  for (const [band, min, max] of BAND_RANGES) {
    if (frequencyHz >= min && frequencyHz <= max) {
      return band
    }
  }
  return 'unknown'
}

// ============================================
// Band Gain Store
// ============================================

export interface BandGainState {
  band: FrequencyBand
  gain: number
  calibrated: boolean
}

export interface BandGainStore {
  get(band: FrequencyBand): BandGainState | undefined
  set(band: FrequencyBand, gain: number, calibrated?: boolean): void
  getForFrequency(
    frequencyHz: number,
    defaultGain: number
  ): { band: FrequencyBand; gain: number; needsCalibration: boolean }
  clear(band: FrequencyBand): void
  clearAll(): void
  getAll(): BandGainState[]
}

export function createBandGainStore(): BandGainStore {
  const store = new Map<FrequencyBand, BandGainState>()

  return {
    get(band) {
      return store.get(band)
    },

    set(band, gain, calibrated = true) {
      store.set(band, { band, gain, calibrated })
    },

    getForFrequency(frequencyHz, defaultGain) {
      const band = classifyBand(frequencyHz)
      const stored = store.get(band)
      if (stored) {
        return { band, gain: stored.gain, needsCalibration: false }
      }
      return { band, gain: defaultGain, needsCalibration: true }
    },

    clear(band) {
      store.delete(band)
    },

    clearAll() {
      store.clear()
    },

    getAll() {
      return Array.from(store.values())
    },
  }
}

// ============================================
// Auto-Gain Calibration
// ============================================

export interface AutoGainConfig {
  targetMin: number // Target noise floor minimum (dB)
  targetMax: number // Target noise floor maximum (dB)
  samplesNeeded: number // Samples before adjusting
  step: number // Gain adjustment step (dB)
  minGain: number
  maxGain: number
}

export interface AutoGainState {
  enabled: boolean
  currentGain: number
  samples: number[]
}

export type GainAdjustResult =
  | { action: 'waiting' }
  | { action: 'in_range'; gain: number }
  | { action: 'adjusted'; oldGain: number; newGain: number }
  | { action: 'limit_reached'; gain: number }

const DEFAULT_CONFIG: AutoGainConfig = {
  targetMin: -80,
  targetMax: -55,
  samplesNeeded: 10,
  step: 5,
  minGain: 0,
  maxGain: 50,
}

export function createAutoGain(
  initialGain: number,
  config: Partial<AutoGainConfig> = {}
): {
  state: AutoGainState
  config: AutoGainConfig
  feed: (bins: number[]) => GainAdjustResult
  reset: () => void
  enable: () => void
  disable: () => void
  setGain: (gain: number) => void
} {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }
  const state: AutoGainState = {
    enabled: true,
    currentGain: initialGain,
    samples: [],
  }

  function feed(bins: number[]): GainAdjustResult {
    if (!state.enabled) {
      return { action: 'waiting' }
    }

    // Use median power as noise floor estimate (more robust than min/max)
    const sorted = [...bins].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? -100
    state.samples.push(median)

    if (state.samples.length < fullConfig.samplesNeeded) {
      return { action: 'waiting' }
    }

    const avgMedian = state.samples.reduce((sum, v) => sum + v, 0) / state.samples.length
    state.samples = []

    let newGain = state.currentGain

    if (avgMedian > fullConfig.targetMax) {
      // Noise floor too high - reduce gain
      newGain = Math.max(fullConfig.minGain, state.currentGain - fullConfig.step)
      logger.info(
        `Auto-gain: noise floor ${avgMedian.toFixed(1)} dB too high, reducing gain ${state.currentGain} -> ${newGain}`
      )
    } else if (avgMedian < fullConfig.targetMin) {
      // Noise floor too low - increase gain
      newGain = Math.min(fullConfig.maxGain, state.currentGain + fullConfig.step)
      logger.info(
        `Auto-gain: noise floor ${avgMedian.toFixed(1)} dB too low, increasing gain ${state.currentGain} -> ${newGain}`
      )
    } else {
      // In range - stop calibrating
      logger.info(
        `Auto-gain: noise floor ${avgMedian.toFixed(1)} dB is in target range, gain locked at ${state.currentGain}`
      )
      state.enabled = false
      return { action: 'in_range', gain: state.currentGain }
    }

    if (newGain !== state.currentGain) {
      const oldGain = state.currentGain
      state.currentGain = newGain
      return { action: 'adjusted', oldGain, newGain }
    }

    // Hit gain limits, stop trying
    logger.info(`Auto-gain: hit gain limit at ${state.currentGain}, stopping calibration`)
    state.enabled = false
    return { action: 'limit_reached', gain: state.currentGain }
  }

  function reset() {
    state.samples = []
    state.enabled = true
  }

  function enable() {
    state.enabled = true
    state.samples = []
  }

  function disable() {
    state.enabled = false
    state.samples = []
  }

  function setGain(gain: number) {
    state.currentGain = gain
    state.enabled = false
    state.samples = []
  }

  return { state, config: fullConfig, feed, reset, enable, disable, setGain }
}
