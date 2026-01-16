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

type FFTCallback = (data: FFTData) => void

let fftProcess: ChildProcess | null = null
let currentCallback: FFTCallback | null = null
let currentConfig: FFTStreamConfig | null = null
let isRunning = false

const DEFAULT_CONFIG: Partial<FFTStreamConfig> = {
  bandwidth: 200000, // 200 kHz for better view
  binSize: 500, // 500 Hz bins = ~400 bins for good resolution
  interval: 1, // 1 second (rtl_power minimum)
}

/**
 * Parse rtl_power CSV output line into FFT data
 * Format: date, time, Hz low, Hz high, Hz step, samples, dB, dB, dB, ...
 */
function parseRtlPowerLine(line: string, centerFreq: number): FFTData | null {
  const parts = line.trim().split(',')
  if (parts.length < 7) return null

  // Skip header/metadata lines
  const hzLow = Number.parseFloat(parts[2] ?? '0')
  if (Number.isNaN(hzLow)) return null

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

  return {
    timestamp: Date.now(),
    centerFreq,
    bins,
    minPower: minPower === Number.POSITIVE_INFINITY ? -100 : minPower,
    maxPower: maxPower === Number.NEGATIVE_INFINITY ? -50 : maxPower,
  }
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
      // Filter out normal rtl_power startup messages
      if (!msg.includes('Found') && !msg.includes('Using device') && !msg.includes('Tuner gain')) {
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
