import { type ChildProcess, spawn } from 'node:child_process'
import { join } from 'node:path'
import type { ReceiverConfig, SatelliteInfo } from '@backend/types'
import { ensureDir, generateFilename } from '../utils/fs'
import { logger } from '../utils/logger'
import { sleep } from '../utils/node-compat'

// SSTV audio sample rate - must match what the Python decoder expects
const SSTV_SAMPLE_RATE = 48_000

export interface RecordingSession {
  satellite: SatelliteInfo
  outputPath: string
  startTime: Date
  rtlProcess: ChildProcess
  soxProcess: ChildProcess
  stop: () => Promise<void>
}

function killAndWait(proc: ChildProcess, name: string, timeoutMs = 3000): Promise<void> {
  return new Promise<void>((resolve) => {
    if (proc.killed || proc.exitCode !== null) {
      resolve()
      return
    }

    const onClose = () => {
      clearTimeout(killTimer)
      resolve()
    }

    proc.once('close', onClose)

    proc.kill('SIGTERM')

    const killTimer = setTimeout(() => {
      if (!proc.killed && proc.exitCode === null) {
        logger.warn(`${name} did not terminate, sending SIGKILL`)
        proc.kill('SIGKILL')
      }
    }, timeoutMs)
  })
}

export async function startRecording(
  satellite: SatelliteInfo,
  config: ReceiverConfig
): Promise<RecordingSession> {
  await ensureDir(config.recording.recordingsDir)

  const filename = generateFilename(satellite.name, 'wav')
  const outputPath = join(config.recording.recordingsDir, filename)
  const freqHz = satellite.frequency.toString()

  // Use signal-specific sample rate for SSTV, global SDR rate for others
  const isSstv = satellite.signalType === 'sstv'
  const sampleRate = isSstv ? SSTV_SAMPLE_RATE : config.sdr.sampleRate

  logger.capture(
    `Starting recording: ${satellite.name} at ${satellite.frequency / 1e6} MHz (${sampleRate} Hz)`
  )

  // SSTV: DC blocking, wider filter for FM SSTV audio
  // LRPT: de-emphasis, FIR filter order 9
  const rtlArgs = [
    '-f',
    freqHz,
    '-s',
    sampleRate.toString(),
    '-g',
    config.sdr.gain.toString(),
    '-p',
    config.sdr.ppmCorrection.toString(),
    '-E',
    isSstv ? 'dc' : 'deemp',
    '-F',
    isSstv ? '9' : '9',
    '-',
  ]

  logger.debug(`rtl_fm args: ${rtlArgs.join(' ')}`)

  const rtlProcess = spawn('rtl_fm', rtlArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

  const soxProcess = spawn(
    'sox',
    [
      '-t',
      'raw',
      '-r',
      sampleRate.toString(),
      '-e',
      's',
      '-b',
      '16',
      '-c',
      '1',
      '-',
      '-t',
      'wav',
      outputPath,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  )

  soxProcess.stdin && rtlProcess.stdout?.pipe(soxProcess.stdin)

  rtlProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg.includes('error') || msg.includes('failed') || msg.includes('usb_')) {
      logger.error(`rtl_fm: ${msg}`)
    } else {
      logger.debug(`rtl_fm: ${msg}`)
    }
  })

  soxProcess.stderr?.on('data', (data: Buffer) => {
    logger.debug(`sox: ${data.toString().trim()}`)
  })

  const session: RecordingSession = {
    satellite,
    outputPath,
    startTime: new Date(),
    rtlProcess,
    soxProcess,

    async stop(): Promise<void> {
      logger.capture('Stopping recording...')

      // Kill rtl_fm first and wait for it to terminate (releases SDR device)
      await killAndWait(rtlProcess, 'rtl_fm')

      // Then wait for sox to finish writing the WAV file
      await killAndWait(soxProcess, 'sox', 5000)

      logger.capture(`Recording saved: ${outputPath}`)
    },
  }

  return session
}

export async function recordPass(
  satellite: SatelliteInfo,
  durationSeconds: number,
  config: ReceiverConfig,
  onProgress?: (elapsed: number, total: number, signal?: number) => void
): Promise<string> {
  const session = await startRecording(satellite, config)

  const startTime = Date.now()
  const endTime = startTime + durationSeconds * 1000

  while (Date.now() < endTime) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    onProgress?.(elapsed, durationSeconds)
    await sleep(1000)
  }

  await session.stop()

  return session.outputPath
}
