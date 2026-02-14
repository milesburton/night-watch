import type { CaptureResult, ReceiverConfig, SatelliteInfo, SatellitePass } from '@backend/types'
import { getDatabase } from '../db/database'
import { SIGNAL_CONFIGS } from '../satellites/constants'
import { stateManager } from '../state/state-manager'
import { logger } from '../utils/logger'
import { sleep } from '../utils/node-compat'
import { decodeRecording } from './decoders'
import { getFFTStreamConfig, stopFFTStream } from './fft-stream'
import { recordPass } from './recorder'

/**
 * Manually trigger an SSTV capture at the specified frequency
 * This is independent of the automatic scanner and runs immediately
 * @param frequency - Frequency to capture in Hz
 * @param durationSeconds - Recording duration in seconds
 * @param config - Receiver configuration
 * @returns Capture result if successful, null otherwise
 */
export async function captureSstvManual(
  frequency: number,
  durationSeconds: number,
  config: ReceiverConfig
): Promise<CaptureResult | null> {
  const startTime = new Date()

  // Create a descriptive name based on frequency
  const freqMHz = (frequency / 1e6).toFixed(3)
  const frequencyName = `Manual ${freqMHz} MHz`

  logger.info(`Manual SSTV capture triggered: ${frequencyName} for ${durationSeconds}s`)

  // Create a virtual satellite info for this manual capture
  const captureInfo: SatelliteInfo = {
    name: frequencyName,
    noradId: 0, // Not a satellite
    frequency,
    signalType: 'sstv',
    signalConfig: SIGNAL_CONFIGS.sstv,
    enabled: true,
  }

  // Create a virtual pass for state manager
  const virtualPass: SatellitePass = {
    satellite: captureInfo,
    aos: startTime,
    los: new Date(startTime.getTime() + durationSeconds * 1000),
    maxElevation: 90, // Manual capture, no elevation concept
    maxElevationTime: startTime,
    duration: durationSeconds,
  }

  // Update state manager with virtual pass for UI consistency
  stateManager.startManualCapture(virtualPass, durationSeconds)

  try {
    // Stop FFT stream to release SDR for recording
    const currentFFTConfig = getFFTStreamConfig()
    if (currentFFTConfig) {
      logger.debug('Stopping FFT stream for manual SSTV capture')
      await stopFFTStream()
      await sleep(1000) // Wait for USB device to be released
    }

    // Record at the specified frequency
    logger.satellite(captureInfo.name, `Recording SSTV for ${durationSeconds}s`)

    const recordingPath = await recordPass(
      captureInfo,
      durationSeconds,
      config,
      (elapsed, total) => {
        const progress = Math.round((elapsed / total) * 100)
        stateManager.updateProgress(progress, elapsed, total)
      }
    )

    // Decode the recording
    stateManager.setStatus('decoding')
    const decoderResult = await decodeRecording(recordingPath, config.recording.imagesDir, 'sstv')
    const imagePaths = decoderResult?.outputPaths ?? []

    const result: CaptureResult = {
      satellite: captureInfo,
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
      const captureId = db.saveCapture(result, virtualPass)
      if (imagePaths.length > 0) {
        db.saveImages(captureId, imagePaths)
        logger.info(`Manual SSTV capture saved ${imagePaths.length} image(s)`)
      } else {
        logger.warn('Manual SSTV capture produced no images')
      }
    } catch (error) {
      logger.warn(`Failed to save manual SSTV capture to database: ${error}`)
    }

    stateManager.setStatus('idle')
    return result
  } catch (error) {
    logger.error(`Manual SSTV capture failed: ${error}`)
    stateManager.setStatus('idle')
    return null
  }
}
