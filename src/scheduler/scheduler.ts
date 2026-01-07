import chalk from 'chalk'
import ora from 'ora'
import { decodeRecording } from '../capture/decoder'
import { recordPass } from '../capture/recorder'
import { verifySignal } from '../capture/signal'
import { getDatabase } from '../db/database'
import { PASS_CONSTRAINTS } from '../satellites/constants'
import { stateManager } from '../state/state-manager'
import type { CaptureResult, ReceiverConfig, SatellitePass } from '../types'
import { logger } from '../utils/logger'

export async function waitForPass(pass: SatellitePass): Promise<void> {
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

  stateManager.startPass(pass)

  logger.satellite(
    satellite.name,
    `Starting capture (${duration}s, max elev: ${pass.maxElevation.toFixed(1)}°)`
  )

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
    const images = await decodeRecording(recordingPath, config.recording.imagesDir)
    const imagePaths = images
      ? [images.channelA, images.channelB, images.composite].filter(
          (p): p is string => p !== undefined
        )
      : []

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

    await waitForPass(pass)
    const result = await capturePass(pass, config)
    results.push(result)

    if (result.success) {
      logger.pass(`Successfully captured ${pass.satellite.name}`)
    }
  }

  return results
}
