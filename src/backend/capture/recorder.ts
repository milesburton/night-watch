import { type ChildProcess, spawn } from 'node:child_process'
import { join } from 'node:path'
import type { ReceiverConfig, SatelliteInfo } from '@backend/types'
import { ensureDir, generateFilename } from '../utils/fs'
import { logger } from '../utils/logger'
import { sleep } from '../utils/node-compat'

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

  const isBaseband = satellite.signalConfig?.demodulation === 'baseband'
  const isSstv = satellite.signalType === 'sstv'

  // Use signal-specific sample rate if defined, else fall back to global SDR rate
  const sampleRate = isBaseband
    ? (satellite.signalConfig?.sampleRate ?? 1_024_000)
    : isSstv
      ? SSTV_SAMPLE_RATE
      : config.sdr.sampleRate

  logger.capture(
    `Starting recording: ${satellite.name} at ${satellite.frequency / 1e6} MHz (${sampleRate} Hz, ${isBaseband ? 'baseband IQ' : 'FM demod'})`
  )

  let rtlProcess: ChildProcess
  let soxProcess: ChildProcess

  if (isBaseband) {
    // LRPT: raw IQ baseband via rtl_sdr — SatDump expects s16 IQ at 1024000 Hz
    const rtlArgs = [
      '-f',
      freqHz,
      '-s',
      sampleRate.toString(),
      '-g',
      config.sdr.gain.toString(),
      '-p',
      config.sdr.ppmCorrection.toString(),
      '-',
    ]
    logger.debug(`rtl_sdr args: ${rtlArgs.join(' ')}`)
    rtlProcess = spawn('rtl_sdr', rtlArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

    // rtl_sdr outputs u8 IQ; sox converts to s16 WAV for SatDump
    soxProcess = spawn(
      'sox',
      [
        '-t',
        'raw',
        '-r',
        sampleRate.toString(),
        '-e',
        'unsigned-integer',
        '-b',
        '8',
        '-c',
        '2',
        '-',
        '-t',
        'wav',
        '-e',
        'signed-integer',
        '-b',
        '16',
        outputPath,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    )
  } else {
    // SSTV / FM: demodulate with rtl_fm
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
      '9',
      '-',
    ]
    logger.debug(`rtl_fm args: ${rtlArgs.join(' ')}`)
    rtlProcess = spawn('rtl_fm', rtlArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

    soxProcess = spawn(
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
  }

  if (soxProcess.stdin && rtlProcess.stdout) {
    rtlProcess.stdout.pipe(soxProcess.stdin)
    rtlProcess.stdout.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') logger.error(`rtl stdout error: ${err.message}`)
    })
    soxProcess.stdin.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') logger.error(`sox stdin error: ${err.message}`)
    })
  }

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
