import type { CaptureResult, ReceiverConfig, SatellitePass } from '@backend/types'
import chalk from 'chalk'
import ora from 'ora'
import { decodeRecording } from '../capture/decoders'
import { isFFTStreamRunning, stopFFTStream } from '../capture/fft-stream'
import { recordPass } from '../capture/recorder'
import { verifySignal } from '../capture/signal'
import { isSstvScannerRunning, scanForSstv, stopSstvScanner } from '../capture/sstv-scanner'
import { getDatabase } from '../db/database'
import { PASS_CONSTRAINTS } from '../satellites/constants'
import { isGroundSstvScanEnabled } from '../satellites/events'
import { stateManager } from '../state/state-manager'
import { logger } from '../utils/logger'

// Minimum idle time (in seconds) before starting SSTV scanning
const MIN_IDLE_FOR_SSTV_SCAN = 180 // 3 minutes

export async function waitForPass(pass: SatellitePass, config?: ReceiverConfig): Promise<void> {
  const now = Date.now()
  const passStart = pass.aos.getTime()
  const bufferMs = PASS_CONSTRAINTS.captureBufferSeconds * 1000
  const targetTime = passStart - bufferMs

  stateManager.setStatus('waiting')

  if (now >= targetTime) {
    logger.info('Pass is starting now!')
    return
  }

  const waitMs = targetTime - now
  const waitSeconds = Math.ceil(waitMs / 1000)

  logger.pass(
    `Waiting ${formatDuration(waitSeconds)} for ${pass.satellite.name} (max elevation: ${pass.maxElevation.toFixed(1)}°)`
  )

  // If we have enough idle time, config is provided, and ground scanning is enabled, scan for 2m SSTV
  if (
    config &&
    waitSeconds > MIN_IDLE_FOR_SSTV_SCAN &&
    !isSstvScannerRunning() &&
    isGroundSstvScanEnabled()
  ) {
    logger.info('Starting 2m SSTV scan during idle time...')

    // Calculate max scan duration (leave 60s buffer before pass)
    const maxScanDuration = Math.min(waitSeconds - 60, 120)

    // Run SSTV scan in background - don't await, let it run while we wait
    scanForSstv(config, maxScanDuration)
      .then((result) => {
        if (result?.success) {
          logger.info(`2m SSTV scan captured image: ${result.imagePaths.join(', ')}`)
        }
      })
      .catch((error) => {
        logger.debug(`SSTV scan error: ${error}`)
      })

    // Wait for pass, stopping scanner if needed
    const spinner = ora({
      text: formatCountdown(waitSeconds),
      color: 'cyan',
    }).start()

    const updateInterval = setInterval(() => {
      const remaining = Math.ceil((targetTime - Date.now()) / 1000)
      if (remaining > 0) {
        spinner.text = `${formatCountdown(remaining)} (SSTV scanning)`
      }
      // Stop scanner 30s before pass to ensure SDR is free
      if (remaining <= 30 && isSstvScannerRunning()) {
        stopSstvScanner()
        spinner.text = formatCountdown(remaining)
      }
    }, 1000)

    await Bun.sleep(waitMs)

    clearInterval(updateInterval)
    stopSstvScanner() // Ensure scanner is stopped
    spinner.succeed(chalk.green('Pass starting!'))
    return
  }

  // Standard wait without SSTV scanning
  const spinner = ora({
    text: formatCountdown(waitSeconds),
    color: 'cyan',
  }).start()

  const updateInterval = setInterval(() => {
    const remaining = Math.ceil((targetTime - Date.now()) / 1000)
    if (remaining > 0) {
      spinner.text = formatCountdown(remaining)
    }
  }, 1000)

  await Bun.sleep(waitMs)

  clearInterval(updateInterval)
  spinner.succeed(chalk.green('Pass starting!'))
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

function formatCountdown(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  return `Time until pass: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export async function capturePass(
  pass: SatellitePass,
  config: ReceiverConfig
): Promise<CaptureResult> {
  const { satellite } = pass
  const duration = Math.ceil(pass.duration) + PASS_CONSTRAINTS.captureBufferSeconds * 2

  // Stop FFT stream BEFORE emitting pass_start - it uses the same SDR device as rtl_fm
  // Must happen before startPass() to prevent web clients from re-subscribing to FFT
  if (isFFTStreamRunning()) {
    logger.debug('Stopping FFT stream before recording to release SDR device')
    await stopFFTStream()
    // Additional delay to ensure USB device is fully released
    await Bun.sleep(1000)
  }

  stateManager.startPass(pass)

  logger.satellite(
    satellite.name,
    `Starting capture (${duration}s, max elev: ${pass.maxElevation.toFixed(1)}°)`
  )

  // Only verify signal if not skipped - signal can be weak at pass start when sat is low
  if (!config.recording.skipSignalCheck) {
    const signalOk = await verifySignal(
      satellite,
      config.sdr.gain,
      config.recording.minSignalStrength
    )

    if (!signalOk) {
      logger.warn(`Signal too weak for ${satellite.name}, skipping capture`)
      const result: CaptureResult = {
        satellite,
        recordingPath: '',
        imagePaths: [],
        startTime: new Date(),
        endTime: new Date(),
        maxSignalStrength: 0,
        success: false,
        error: 'Signal too weak',
      }
      saveResultToDatabase(result, pass)
      stateManager.completePass(result)
      return result
    }
  } else {
    logger.debug('Signal check skipped (SKIP_SIGNAL_CHECK=true)')
  }

  const startTime = new Date()

  const spinner = ora({
    text: `Recording ${satellite.name}...`,
    color: 'magenta',
  }).start()

  try {
    const recordingPath = await recordPass(satellite, duration, config, (elapsed, total) => {
      const progress = Math.round((elapsed / total) * 100)
      const remaining = total - elapsed
      spinner.text = `Recording ${satellite.name}: ${progress}% (${formatDuration(remaining)} remaining)`
      stateManager.updateProgress(progress, elapsed, total)
    })

    spinner.succeed(`Recording complete: ${recordingPath}`)

    stateManager.setStatus('decoding')
    const decoderResult = await decodeRecording(
      recordingPath,
      config.recording.imagesDir,
      satellite.signalType
    )
    const imagePaths = decoderResult?.outputPaths ?? []

    const result: CaptureResult = {
      satellite,
      recordingPath,
      imagePaths,
      startTime,
      endTime: new Date(),
      maxSignalStrength: 0,
      success: true,
    }

    saveResultToDatabase(result, pass)
    stateManager.completePass(result)
    return result
  } catch (error) {
    spinner.fail(`Capture failed for ${satellite.name}`)
    const result: CaptureResult = {
      satellite,
      recordingPath: '',
      imagePaths: [],
      startTime,
      endTime: new Date(),
      maxSignalStrength: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    saveResultToDatabase(result, pass)
    stateManager.completePass(result)
    return result
  }
}

function saveResultToDatabase(result: CaptureResult, pass: SatellitePass): void {
  try {
    const db = getDatabase()
    const captureId = db.saveCapture(result, pass)
    if (result.imagePaths.length > 0) {
      db.saveImages(captureId, result.imagePaths)
    }
  } catch (error) {
    logger.warn(`Failed to save capture to database: ${error}`)
  }
}

export async function runScheduler(
  passes: SatellitePass[],
  config: ReceiverConfig
): Promise<CaptureResult[]> {
  const results: CaptureResult[] = []

  logger.info(`Scheduler started with ${passes.length} passes queued`)

  for (const pass of passes) {
    const now = new Date()

    if (pass.los < now) {
      logger.debug(`Skipping past pass: ${pass.satellite.name}`)
      continue
    }

    await waitForPass(pass, config)
    const result = await capturePass(pass, config)
    results.push(result)

    if (result.success) {
      logger.pass(`Successfully captured ${pass.satellite.name}`)
    }
  }

  return results
}
