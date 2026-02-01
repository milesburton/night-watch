import { type ChildProcess, spawn } from 'node:child_process'
import FFT from 'fft.js'
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
  bandwidth: number // Bandwidth in Hz (default 200kHz)
  fftSize: number // FFT size (power of 2, default 1024)
  gain: number // SDR gain
  updateRate: number // Target updates per second (default 10)
}

export interface NotchFilter {
  frequency: number // Center frequency to notch in Hz
  width: number // Width of notch in Hz (applied +/- from center)
  enabled: boolean
}

type FFTCallback = (data: FFTData) => void

let sdrProcess: ChildProcess | null = null
let currentCallback: FFTCallback | null = null
let currentConfig: FFTStreamConfig | null = null
let isRunning = false
let isStarting = false
let lastStopTime = 0
let lastError: string | null = null
let latestData: FFTData | null = null

// Minimum delay between stop and start (ms) to allow USB device to be released
// USB devices can take a while to be released after process termination
// Increased to 4s to match RTL-SDR USB release timing (tested at 3.5s+ needed)
const MIN_RESTART_DELAY_MS = 4_000

// Notch filters to remove persistent interference
const notchFilters: NotchFilter[] = []

// FFT processor instance
let fftProcessor: FFT | null = null

// Spectral averaging buffer to reduce noise
let averagingBuffer: Float64Array | null = null
let averagingCount = 0
const AVERAGING_FRAMES = 8 // Average 8 frames together (~4x noise reduction)

const DEFAULT_CONFIG: Partial<FFTStreamConfig> = {
  bandwidth: 200_000,
  fftSize: 2_048,
  updateRate: 30, // 30 updates per second for smooth real-time display
}

// Sample rate - must be high enough for bandwidth but not too high for Pi CPU
const SAMPLE_RATE = 250_000

/**
 * Convert raw I/Q bytes to complex samples
 * RTL-SDR outputs unsigned 8-bit I/Q pairs
 */
function convertIQToComplex(buffer: Buffer, fftSize: number): Float32Array {
  const complexData = new Float32Array(fftSize * 2)
  const samplesToProcess = Math.min(buffer.length / 2, fftSize)

  for (let i = 0; i < samplesToProcess; i++) {
    // Convert unsigned 8-bit to signed float (-1 to 1)
    const iIdx = i * 2
    const qIdx = i * 2 + 1
    const iVal = ((buffer[iIdx] ?? 127) - 127.5) / 127.5
    const qVal = ((buffer[qIdx] ?? 127) - 127.5) / 127.5
    complexData[iIdx] = iVal // Real
    complexData[qIdx] = qVal // Imaginary
  }

  return complexData
}

function computePowerSpectrum(fftOutput: Float32Array, fftSize: number): number[] {
  const spectrum: number[] = new Array(fftSize)
  const normFactor = fftSize * fftSize

  for (let i = 0; i < fftSize; i++) {
    const realIdx = i * 2
    const imagIdx = i * 2 + 1
    const real = fftOutput[realIdx] ?? 0
    const imag = fftOutput[imagIdx] ?? 0
    const magSquared = (real * real + imag * imag) / normFactor
    spectrum[i] = magSquared > 1e-15 ? 10 * Math.log10(magSquared) : -120
  }

  const reordered: number[] = new Array(fftSize)
  const halfSize = fftSize / 2
  for (let i = 0; i < halfSize; i++) {
    reordered[i] = spectrum[i + halfSize] ?? -120
    reordered[i + halfSize] = spectrum[i] ?? -120
  }

  return reordered
}

/**
 * Apply notch filters to FFT data
 */
function applyNotchFilters(data: FFTData, startFreq: number, binWidth: number): FFTData {
  if (notchFilters.length === 0) return data

  const filteredBins = [...data.bins]
  const enabledFilters = notchFilters.filter((f) => f.enabled)

  for (const filter of enabledFilters) {
    const notchStart = filter.frequency - filter.width
    const notchEnd = filter.frequency + filter.width

    for (let i = 0; i < filteredBins.length; i++) {
      const binFreq = startFreq + i * binWidth
      if (binFreq >= notchStart && binFreq <= notchEnd) {
        // Find neighbors outside the notch
        const leftIdx = Math.max(0, Math.floor((notchStart - startFreq) / binWidth) - 2)
        const rightIdx = Math.min(
          filteredBins.length - 1,
          Math.ceil((notchEnd - startFreq) / binWidth) + 2
        )

        const leftVal = data.bins[leftIdx] ?? data.bins[0] ?? -100
        const rightVal = data.bins[rightIdx] ?? data.bins[data.bins.length - 1] ?? -100
        filteredBins[i] = (leftVal + rightVal) / 2
      }
    }
  }

  // Recalculate min/max
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
 * Start FFT streaming using rtl_sdr + JavaScript FFT
 */
export async function startFFTStream(
  config: FFTStreamConfig,
  callback: FFTCallback
): Promise<boolean> {
  if (isStarting) {
    logger.debug('FFT stream start already in progress, ignoring')
    return false
  }

  if (isRunning && currentConfig?.frequency === config.frequency) {
    logger.debug('FFT stream already running at same frequency, updating callback')
    currentCallback = callback
    return true
  }

  // Set isStarting BEFORE any async operations to prevent race conditions
  isStarting = true

  if (isRunning) {
    logger.info('FFT stream running at different frequency, restarting')
    await stopFFTStream()
  }

  const timeSinceStop = Date.now() - lastStopTime
  if (timeSinceStop < MIN_RESTART_DELAY_MS && lastStopTime > 0) {
    const waitTime = MIN_RESTART_DELAY_MS - timeSinceStop
    logger.debug(`Waiting ${waitTime}ms for USB device to be released`)
    await Bun.sleep(waitTime)
  }

  const fullConfig = { ...DEFAULT_CONFIG, ...config } as Required<FFTStreamConfig>
  const { frequency, fftSize, gain, updateRate } = fullConfig

  // Initialize FFT processor
  fftProcessor = new FFT(fftSize)

  // Calculate bytes needed per FFT frame (2 bytes per I/Q sample)
  const bytesPerFrame = fftSize * 2
  // Calculate how many samples to read per update
  const samplesPerSecond = SAMPLE_RATE
  const samplesPerUpdate = Math.floor(samplesPerSecond / updateRate)
  const blockSize = Math.max(bytesPerFrame, samplesPerUpdate * 2)

  const freqMHz = frequency / 1e6
  logger.info(
    `Starting FFT stream: ${freqMHz.toFixed(3)} MHz, FFT size ${fftSize}, ${updateRate} Hz update rate`
  )

  try {
    // Use rtl_sdr to capture raw I/Q samples
    sdrProcess = spawn(
      'rtl_sdr',
      [
        '-f',
        frequency.toString(),
        '-s',
        SAMPLE_RATE.toString(),
        '-g',
        gain.toString(),
        '-b',
        blockSize.toString(),
        '-', // Output to stdout
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    currentCallback = callback
    currentConfig = fullConfig
    isRunning = true
    isStarting = false
    lastError = null

    let buffer = Buffer.alloc(0)
    let lastUpdateTime = Date.now()
    const minUpdateInterval = 1_000 / updateRate

    sdrProcess.stdout?.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data])

      // Process when we have enough data for an FFT frame
      while (buffer.length >= bytesPerFrame) {
        const now = Date.now()

        // Rate limit updates
        if (now - lastUpdateTime >= minUpdateInterval) {
          const frameBuffer = buffer.subarray(0, bytesPerFrame)

          // Convert to complex samples
          const complexData = convertIQToComplex(frameBuffer, fftSize)

          // Apply window function to both I and Q channels
          for (let i = 0; i < fftSize; i++) {
            const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (fftSize - 1))
            complexData[i * 2] = (complexData[i * 2] ?? 0) * w
            complexData[i * 2 + 1] = (complexData[i * 2 + 1] ?? 0) * w
          }

          // Perform FFT
          if (!fftProcessor) return
          const fftOutput = fftProcessor.createComplexArray() as number[]
          fftProcessor.transform(fftOutput, complexData as unknown as number[])

          // Compute power spectrum (linear magnitudes for averaging)
          const spectrum = computePowerSpectrum(new Float32Array(fftOutput), fftSize)

          // Accumulate into averaging buffer
          if (!averagingBuffer || averagingBuffer.length !== fftSize) {
            averagingBuffer = new Float64Array(fftSize)
            averagingCount = 0
          }

          // Exponential moving average in dB domain for smoother display
          if (averagingCount === 0) {
            for (let i = 0; i < fftSize; i++) {
              averagingBuffer[i] = spectrum[i] ?? -120
            }
          } else {
            const alpha = 1 / AVERAGING_FRAMES // Smoothing factor
            for (let i = 0; i < fftSize; i++) {
              const prev = averagingBuffer[i] ?? -120
              averagingBuffer[i] = prev * (1 - alpha) + (spectrum[i] ?? -120) * alpha
            }
          }
          averagingCount++

          // Only emit after we have enough frames for a stable average
          if (averagingCount < 2) {
            lastUpdateTime = now
            buffer = buffer.subarray(bytesPerFrame)
            continue
          }

          const averaged: number[] = new Array(fftSize)
          for (let i = 0; i < fftSize; i++) {
            averaged[i] = averagingBuffer[i] ?? -120
          }

          // Calculate frequency range
          const binWidth = SAMPLE_RATE / fftSize
          const startFreq = frequency - SAMPLE_RATE / 2

          let fftData: FFTData = {
            timestamp: now,
            centerFreq: frequency,
            bins: averaged,
            minPower: Math.min(...averaged),
            maxPower: Math.max(...averaged),
          }

          // Apply notch filters
          if (notchFilters.length > 0) {
            fftData = applyNotchFilters(fftData, startFreq, binWidth)
          }

          latestData = fftData

          if (currentCallback) {
            currentCallback(fftData)
          }

          lastUpdateTime = now
        }

        // Remove processed bytes
        buffer = buffer.subarray(bytesPerFrame)
      }

      // Prevent buffer from growing too large
      if (buffer.length > bytesPerFrame * 10) {
        buffer = buffer.subarray(buffer.length - bytesPerFrame)
      }
    })

    sdrProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim()
      if (msg.includes('No supported')) {
        lastError = 'No SDR hardware detected'
        logger.error(`rtl_sdr: ${msg}`)
      } else if (msg.includes('error') || msg.includes('failed') || msg.includes('usb_')) {
        lastError = msg
        logger.error(`rtl_sdr error: ${msg}`)
      } else if (
        !msg.includes('Found') &&
        !msg.includes('Using device') &&
        !msg.includes('Tuner gain') &&
        !msg.includes('Sampling at') &&
        !msg.includes('Allocating')
      ) {
        logger.debug(`rtl_sdr: ${msg}`)
      }
    })

    sdrProcess.on('error', (error) => {
      lastError = error.message
      logger.error(`FFT stream error: ${error.message}`)
      isRunning = false
      isStarting = false
    })

    sdrProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        logger.warn(`FFT stream exited with code ${code}`)
        if (!lastError) {
          lastError = `SDR process exited with code ${code}`
        }
      }
      isRunning = false
      isStarting = false
      sdrProcess = null
      lastStopTime = Date.now()
    })

    return true
  } catch (error) {
    logger.error(`Failed to start FFT stream: ${error}`)
    isRunning = false
    isStarting = false
    return false
  }
}

/**
 * Stop the FFT stream and wait for process to fully terminate
 */
export async function stopFFTStream(): Promise<void> {
  if (sdrProcess && !sdrProcess.killed) {
    logger.info('Stopping FFT stream')
    const proc = sdrProcess
    sdrProcess = null

    // Create promise that resolves when process terminates
    const terminated = new Promise<void>((resolve) => {
      proc.on('close', () => resolve())
      proc.on('exit', () => resolve())
    })

    // Try SIGTERM first, then SIGKILL after a delay if needed
    proc.kill('SIGTERM')
    setTimeout(() => {
      if (!proc.killed) {
        logger.warn('FFT stream did not terminate, sending SIGKILL')
        proc.kill('SIGKILL')
      }
    }, 500)

    // Wait for process to actually terminate (max 2s timeout)
    await Promise.race([terminated, Bun.sleep(2000)])

    lastStopTime = Date.now()
  }
  currentCallback = null
  currentConfig = null
  isRunning = false
  fftProcessor = null
  averagingBuffer = null
  averagingCount = 0
  latestData = null
  lastError = null
}

/**
 * Check if FFT stream is running
 */
export function isFFTStreamRunning(): boolean {
  return isRunning && sdrProcess !== null && !sdrProcess.killed
}

/**
 * Get current FFT stream config
 */
export function getFFTStreamConfig(): FFTStreamConfig | null {
  return currentConfig
}

/**
 * Update FFT stream frequency
 */
export async function updateFFTFrequency(frequency: number): Promise<boolean> {
  if (!currentConfig || !currentCallback) {
    return false
  }

  const newConfig = { ...currentConfig, frequency }
  return startFFTStream(newConfig, currentCallback)
}

// ============================================
// Notch Filter Management
// ============================================

export function addNotchFilter(frequency: number, width = 5_000): void {
  const existing = notchFilters.find((f) => Math.abs(f.frequency - frequency) < 1_000)
  if (existing) {
    existing.width = width
    existing.enabled = true
    logger.info(
      `Updated notch filter: ${(frequency / 1e6).toFixed(3)} MHz ±${(width / 1_000).toFixed(1)} kHz`
    )
    return
  }

  notchFilters.push({ frequency, width, enabled: true })
  logger.info(
    `Added notch filter: ${(frequency / 1e6).toFixed(3)} MHz ±${(width / 1_000).toFixed(1)} kHz`
  )
}

export function removeNotchFilter(frequency: number): boolean {
  const index = notchFilters.findIndex((f) => Math.abs(f.frequency - frequency) < 1_000)
  if (index >= 0) {
    const removed = notchFilters.splice(index, 1)[0]
    if (removed) {
      logger.info(`Removed notch filter: ${(removed.frequency / 1e6).toFixed(3)} MHz`)
    }
    return true
  }
  return false
}

export function setNotchFilterEnabled(frequency: number, enabled: boolean): boolean {
  const filter = notchFilters.find((f) => Math.abs(f.frequency - frequency) < 1_000)
  if (filter) {
    filter.enabled = enabled
    logger.info(
      `Notch filter ${(frequency / 1e6).toFixed(3)} MHz: ${enabled ? 'enabled' : 'disabled'}`
    )
    return true
  }
  return false
}

export function getNotchFilters(): NotchFilter[] {
  return [...notchFilters]
}

export function clearNotchFilters(): void {
  notchFilters.length = 0
  logger.info('Cleared all notch filters')
}

/**
 * Get the most recent FFT data frame (null if stream not running or no data yet)
 */
export function getLatestFFTData(): FFTData | null {
  return latestData
}

/**
 * Get last SDR error (null if no error)
 */
export function getFFTStreamError(): string | null {
  return lastError
}
