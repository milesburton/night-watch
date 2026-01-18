import { type ChildProcess, spawn } from 'node:child_process'
import { logger } from '../utils/logger'

export interface FFTData {
  timestamp: number
  centerFreq: number
  bins: number[]
  minPower: number
  maxPower: number
}

export interface FFTStreamConfig {
  frequency: number // Center frequency in Hz
  bandwidth: number // Bandwidth in Hz (default 50kHz)
  binSize: number // FFT bin size in Hz (default 1kHz)
  gain: number // SDR gain
  interval: number // Update interval in seconds
}

export interface NotchFilter {
  frequency: number // Center frequency to notch in Hz
  width: number // Width of notch in Hz (applied +/- from center)
  enabled: boolean
}

type FFTCallback = (data: FFTData) => void

let fftProcess: ChildProcess | null = null
let currentCallback: FFTCallback | null = null
let currentConfig: FFTStreamConfig | null = null
let isRunning = false

// Notch filters to remove persistent interference
const notchFilters: NotchFilter[] = []

const DEFAULT_CONFIG: Partial<FFTStreamConfig> = {
  bandwidth: 200000, // 200 kHz for better view
  binSize: 500, // 500 Hz bins = ~400 bins for good resolution
  interval: 1, // 1 second (rtl_power minimum)
}

/**
 * Apply notch filters to FFT data
 * Replaces bins at notched frequencies with interpolated values from neighbors
 */
function applyNotchFilters(
  data: FFTData,
  startFreq: number,
  binSize: number
): FFTData {
  if (notchFilters.length === 0) return data

  const filteredBins = [...data.bins]
  const enabledFilters = notchFilters.filter((f) => f.enabled)

  for (const filter of enabledFilters) {
    // Calculate which bins fall within the notch
    const notchStart = filter.frequency - filter.width
    const notchEnd = filter.frequency + filter.width

    for (let i = 0; i < filteredBins.length; i++) {
      const binFreq = startFreq + i * binSize
      if (binFreq >= notchStart && binFreq <= notchEnd) {
        // Replace with interpolated value from neighbors outside the notch
        const leftIdx = Math.max(
          0,
          Math.floor((notchStart - startFreq) / binSize) - 1
        )
        const rightIdx = Math.min(
          filteredBins.length - 1,
          Math.ceil((notchEnd - startFreq) / binSize) + 1
        )

        // Use average of neighbors (or just neighbor if at edge)
        const leftVal = data.bins[leftIdx] ?? data.bins[0]
        const rightVal = data.bins[rightIdx] ?? data.bins[data.bins.length - 1]
        filteredBins[i] = (leftVal + rightVal) / 2
      }
    }
  }

  // Recalculate min/max after filtering
  let minPower = Number.POSITIVE_INFINITY
  let maxPower = Number.NEGATIVE_INFINITY
  for (const power of filteredBins) {
    minPower = Math.min(minPower, power)
    maxPower = Math.max(maxPower, power)
  }

  return {
    ...data,
    bins: filteredBins,
    minPower: minPower === Number.POSITIVE_INFINITY ? -100 : minPower,
    maxPower: maxPower === Number.NEGATIVE_INFINITY ? -50 : maxPower,
  }
}

/**
 * Parse rtl_power CSV output line into FFT data
 * Format: date, time, Hz low, Hz high, Hz step, samples, dB, dB, dB, ...
 */
function parseRtlPowerLine(
  line: string,
  centerFreq: number,
  applyFilters = true
): FFTData | null {
  const parts = line.trim().split(',')
  if (parts.length < 7) return null

  // Skip header/metadata lines
  const hzLow = Number.parseFloat(parts[2] ?? '0')
  if (Number.isNaN(hzLow)) return null

  // Get the bin size (Hz step) from rtl_power output
  const hzStep = Number.parseFloat(parts[4] ?? '0')
  if (Number.isNaN(hzStep) || hzStep <= 0) return null

  // Extract power readings (starting from index 6)
  const bins: number[] = []
  let minPower = Number.POSITIVE_INFINITY
  let maxPower = Number.NEGATIVE_INFINITY

  for (let i = 6; i < parts.length; i++) {
    const power = Number.parseFloat(parts[i] ?? '0')
    if (!Number.isNaN(power) && Number.isFinite(power)) {
      bins.push(power)
      minPower = Math.min(minPower, power)
      maxPower = Math.max(maxPower, power)
    }
  }

  if (bins.length === 0) return null

  let fftData: FFTData = {
    timestamp: Date.now(),
    centerFreq,
    bins,
    minPower: minPower === Number.POSITIVE_INFINITY ? -100 : minPower,
    maxPower: maxPower === Number.NEGATIVE_INFINITY ? -50 : maxPower,
  }

  // Apply notch filters if enabled
  if (applyFilters && notchFilters.length > 0) {
    fftData = applyNotchFilters(fftData, hzLow, hzStep)
  }

  return fftData
}

/**
 * Start FFT streaming from the SDR
 */
export function startFFTStream(config: FFTStreamConfig, callback: FFTCallback): boolean {
  if (isRunning) {
    logger.warn('FFT stream already running, stopping first')
    stopFFTStream()
  }

  const fullConfig = { ...DEFAULT_CONFIG, ...config }
  const { frequency, bandwidth, binSize, gain, interval } = fullConfig as Required<FFTStreamConfig>

  const freqMHz = frequency / 1e6
  const halfBandwidthMHz = bandwidth / 2 / 1e6
  const startFreq = `${(freqMHz - halfBandwidthMHz).toFixed(3)}M`
  const endFreq = `${(freqMHz + halfBandwidthMHz).toFixed(3)}M`

  logger.info(`Starting FFT stream: ${startFreq} to ${endFreq}, bin ${binSize}Hz, gain ${gain}dB`)

  try {
    // Use rtl_power for FFT
    // -1 flag exits after one sweep (we'll restart for continuous updates)
    // -c 0.5 crops 50% to reduce DC spike artifacts
    fftProcess = spawn(
      'rtl_power',
      [
        '-f',
        `${startFreq}:${endFreq}:${binSize}`,
        '-g',
        gain.toString(),
        '-i',
        interval.toString(),
        '-', // Output to stdout
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    currentCallback = callback
    currentConfig = fullConfig as FFTStreamConfig
    isRunning = true

    let buffer = ''

    fftProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.trim() && currentCallback) {
          const fftData = parseRtlPowerLine(line, frequency)
          if (fftData) {
            currentCallback(fftData)
          }
        }
      }
    })

    fftProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim()
      // Log important errors, filter out normal startup messages
      if (
        msg.includes('error') ||
        msg.includes('failed') ||
        msg.includes('usb_') ||
        msg.includes('No supported')
      ) {
        logger.error(`rtl_power error: ${msg}`)
      } else if (
        !msg.includes('Found') &&
        !msg.includes('Using device') &&
        !msg.includes('Tuner gain')
      ) {
        logger.debug(`rtl_power: ${msg}`)
      }
    })

    fftProcess.on('error', (error) => {
      logger.error(`FFT stream error: ${error.message}`)
      isRunning = false
    })

    fftProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        logger.warn(`FFT stream exited with code ${code}`)
      }
      isRunning = false
      fftProcess = null
    })

    return true
  } catch (error) {
    logger.error(`Failed to start FFT stream: ${error}`)
    isRunning = false
    return false
  }
}

/**
 * Stop the FFT stream
 */
export function stopFFTStream(): void {
  if (fftProcess && !fftProcess.killed) {
    logger.info('Stopping FFT stream')
    fftProcess.kill('SIGTERM')
    fftProcess = null
  }
  currentCallback = null
  currentConfig = null
  isRunning = false
}

/**
 * Check if FFT stream is running
 */
export function isFFTStreamRunning(): boolean {
  return isRunning && fftProcess !== null && !fftProcess.killed
}

/**
 * Get current FFT stream config
 */
export function getFFTStreamConfig(): FFTStreamConfig | null {
  return currentConfig
}

/**
 * Update FFT stream frequency (restarts stream with new frequency)
 */
export function updateFFTFrequency(frequency: number): boolean {
  if (!currentConfig || !currentCallback) {
    return false
  }

  const newConfig = { ...currentConfig, frequency }
  return startFFTStream(newConfig, currentCallback)
}

// ============================================
// Notch Filter Management
// ============================================

/**
 * Add a notch filter to remove interference at a specific frequency
 * @param frequency - Center frequency to notch in Hz
 * @param width - Width of notch in Hz (applied +/- from center), default 5000 (5 kHz)
 */
export function addNotchFilter(frequency: number, width = 5000): void {
  // Check if filter already exists for this frequency
  const existing = notchFilters.find(
    (f) => Math.abs(f.frequency - frequency) < 1000
  )
  if (existing) {
    existing.width = width
    existing.enabled = true
    logger.info(
      `Updated notch filter: ${(frequency / 1e6).toFixed(3)} MHz ±${(width / 1000).toFixed(1)} kHz`
    )
    return
  }

  notchFilters.push({ frequency, width, enabled: true })
  logger.info(
    `Added notch filter: ${(frequency / 1e6).toFixed(3)} MHz ±${(width / 1000).toFixed(1)} kHz`
  )
}

/**
 * Remove a notch filter
 * @param frequency - Center frequency of filter to remove in Hz
 */
export function removeNotchFilter(frequency: number): boolean {
  const index = notchFilters.findIndex(
    (f) => Math.abs(f.frequency - frequency) < 1000
  )
  if (index >= 0) {
    const removed = notchFilters.splice(index, 1)[0]
    logger.info(
      `Removed notch filter: ${(removed.frequency / 1e6).toFixed(3)} MHz`
    )
    return true
  }
  return false
}

/**
 * Enable or disable a notch filter
 */
export function setNotchFilterEnabled(
  frequency: number,
  enabled: boolean
): boolean {
  const filter = notchFilters.find(
    (f) => Math.abs(f.frequency - frequency) < 1000
  )
  if (filter) {
    filter.enabled = enabled
    logger.info(
      `Notch filter ${(frequency / 1e6).toFixed(3)} MHz: ${enabled ? 'enabled' : 'disabled'}`
    )
    return true
  }
  return false
}

/**
 * Get all configured notch filters
 */
export function getNotchFilters(): NotchFilter[] {
  return [...notchFilters]
}

/**
 * Clear all notch filters
 */
export function clearNotchFilters(): void {
  notchFilters.length = 0
  logger.info('Cleared all notch filters')
}
