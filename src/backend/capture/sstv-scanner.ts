import type { CaptureResult, ReceiverConfig, SatelliteInfo } from '@backend/types'
import { getDatabase } from '../db/database'
import { SIGNAL_CONFIGS } from '../satellites/constants'
import { stateManager } from '../state/state-manager'
import { logger } from '../utils/logger'
import { decodeRecording } from './decoders'
import { getLatestFFTData, stopFFTStream } from './fft-stream'
import { recordPass } from './recorder'

// Common 2m SSTV frequencies (in Hz)
// Note: ISS (145.800 MHz) is NOT included here - it's handled as a scheduled pass like NOAA satellites
export const SSTV_SCAN_FREQUENCIES = [
  { frequency: 144.5e6, name: '2m SSTV Calling' },
  { frequency: 145.5e6, name: '2m SSTV Alt' },
]

// Virtual satellite info for ground-based SSTV
const GROUND_SSTV_INFO: SatelliteInfo = {
  name: '2m SSTV',
  noradId: 0, // Not a satellite
  frequency: 144.5e6, // Default, will be overridden
  signalType: 'sstv',
  signalConfig: SIGNAL_CONFIGS.sstv,
  enabled: true,
}

let isScanning = false
let shouldStop = false

export function stopSstvScanner(): void {
  shouldStop = true
}

export function isSstvScannerRunning(): boolean {
  return isScanning
}

/**
 * Scan 2m SSTV frequencies for activity during idle time
 * Loops continuously through frequencies until shouldStop is set or a signal is captured
 * Returns when a signal is detected and captured, or when shouldStop is set
 */
export async function scanForSstv(
  config: ReceiverConfig,
  maxDurationSeconds = 120
): Promise<CaptureResult | null> {
  if (isScanning) {
    logger.debug('SSTV scanner already running')
    return null
  }

  isScanning = true
  shouldStop = false

  logger.info('Starting 2m SSTV frequency scan...')
  stateManager.setStatus('scanning')

  try {
    // Loop continuously through frequencies until stopped
    while (!shouldStop) {
      for (const freq of SSTV_SCAN_FREQUENCIES) {
        if (shouldStop) {
          logger.info('SSTV scanner stopped')
          break
        }

        // Broadcast current scanning frequency — the server will tune the FFT stream
        stateManager.setScanningFrequency(freq.frequency, freq.name)
        logger.info(`Scanning ${freq.name} (${(freq.frequency / 1e6).toFixed(3)} MHz)`)

        // Dwell and check FFT power for signal detection
        const signalThreshold = config.recording.minSignalStrength - 5
        let hasSignal = false

        // Sample FFT data over the dwell period (3s total, checking every 500ms)
        for (let i = 0; i < 6 && !shouldStop; i++) {
          await Bun.sleep(500)
          const fftData = getLatestFFTData()
          if (fftData && fftData.maxPower > signalThreshold) {
            hasSignal = true
            logger.debug(
              `Signal check: peak ${fftData.maxPower.toFixed(1)} dB > threshold ${signalThreshold} dB`
            )
            break
          }
        }

        if (hasSignal && !shouldStop) {
          logger.info(`Signal detected on ${freq.name}!`)

          // Stop FFT stream to release SDR for recording
          stopFFTStream()
          await Bun.sleep(500)

          // Create a virtual satellite info for this capture
          const captureInfo: SatelliteInfo = {
            ...GROUND_SSTV_INFO,
            name: freq.name,
            frequency: freq.frequency,
          }

          // Record for the specified duration
          const result = await captureSstv(captureInfo, config, maxDurationSeconds)

          if (result?.success) {
            isScanning = false
            return result
          }

          // After capture attempt, continue scanning
          stateManager.setStatus('scanning')
        }
      }
    }
  } finally {
    isScanning = false
    // Only reset to idle if we're still in scanning status
    // (captureSstv might have changed it to capturing/decoding)
    if (stateManager.getState().status === 'scanning') {
      stateManager.setStatus('idle')
    }
  }

  return null
}

async function captureSstv(
  info: SatelliteInfo,
  config: ReceiverConfig,
  durationSeconds: number
): Promise<CaptureResult | null> {
  const startTime = new Date()

  logger.satellite(info.name, `Recording SSTV for ${durationSeconds}s`)
  stateManager.setStatus('capturing')

  try {
    const recordingPath = await recordPass(info, durationSeconds, config, (elapsed, total) => {
      const progress = Math.round((elapsed / total) * 100)
      stateManager.updateProgress(progress, elapsed, total)
    })

    stateManager.setStatus('decoding')
    const decoderResult = await decodeRecording(recordingPath, config.recording.imagesDir, 'sstv')
    const imagePaths = decoderResult?.outputPaths ?? []

    const result: CaptureResult = {
      satellite: info,
      recordingPath,
      imagePaths,
      startTime,
      endTime: new Date(),
      maxSignalStrength: 0,
      success: imagePaths.length > 0,
    }

    // Save to database
    try {
      const db = getDatabase()
      // Create a fake pass for database compatibility
      const fakePass = {
        satellite: info,
        aos: startTime,
        los: new Date(),
        maxElevation: 90, // Ground station, no elevation concept
        maxElevationTime: startTime,
        duration: durationSeconds,
      }
      const captureId = db.saveCapture(result, fakePass)
      if (imagePaths.length > 0) {
        db.saveImages(captureId, imagePaths)
      }
    } catch (error) {
      logger.warn(`Failed to save SSTV capture to database: ${error}`)
    }

    stateManager.setStatus('idle')
    return result
  } catch (error) {
    logger.error(`SSTV capture failed: ${error}`)
    stateManager.setStatus('idle')
    return null
  }
}
