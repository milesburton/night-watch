import { type ChildProcess, spawn } from 'node:child_process'
import { join } from 'node:path'
import type { ReceiverConfig, SatelliteInfo } from '@backend/types'
import { ensureDir, generateFilename } from '../utils/fs'
import { logger } from '../utils/logger'
import { sleep } from '../utils/node-compat'
import { type RunningProcess, spawnProcess } from '../utils/shell'

export interface RecordingSession {
  satellite: SatelliteInfo
  outputPath: string
  startTime: Date
  rtlProcess: ChildProcess
  soxProcess: ChildProcess
  stop: () => Promise<void>
}

export async function startRecording(
  satellite: SatelliteInfo,
  config: ReceiverConfig
): Promise<RecordingSession> {
  await ensureDir(config.recording.recordingsDir)

  const filename = generateFilename(satellite.name, 'wav')
  const outputPath = join(config.recording.recordingsDir, filename)
  const freqHz = satellite.frequency.toString()

  logger.capture(`Starting recording: ${satellite.name} at ${satellite.frequency / 1e6} MHz`)

  const rtlProcess = spawn(
    'rtl_fm',
    [
      '-f',
      freqHz,
      '-s',
      config.sdr.sampleRate.toString(),
      '-g',
      config.sdr.gain.toString(),
      '-p',
      config.sdr.ppmCorrection.toString(),
      '-E',
      'deemp',
      '-F',
      '9',
      '-',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  )

  const soxProcess = spawn(
    'sox',
    [
      '-t',
      'raw',
      '-r',
      config.sdr.sampleRate.toString(),
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
    logger.debug(`rtl_fm: ${data.toString().trim()}`)
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

      rtlProcess.kill('SIGTERM')

      await new Promise<void>((resolve) => {
        soxProcess.on('close', () => resolve())
        setTimeout(() => {
          if (!soxProcess.killed) {
            soxProcess.kill('SIGTERM')
          }
          resolve()
        }, 5000)
      })

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
