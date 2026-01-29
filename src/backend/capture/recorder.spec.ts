import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { TEST_SATELLITE } from '@/test-fixtures'
import type { ReceiverConfig } from '@backend/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => {
  const createMockProcess = (isRtl: boolean) => {
    const emitter = new EventEmitter()
    return Object.assign(emitter, {
      stdout: Object.assign(new EventEmitter(), { pipe: vi.fn() }),
      stderr: new EventEmitter(),
      stdin: isRtl ? null : { pipe: vi.fn() },
      killed: false,
      kill: vi.fn(),
      pid: isRtl ? 1234 : 5678,
    }) as unknown as ChildProcess
  }

  return {
    spawn: vi.fn((cmd: string) => createMockProcess(cmd === 'rtl_fm')),
  }
})

vi.mock('../utils/fs', () => ({
  ensureDir: vi.fn(() => Promise.resolve()),
  generateFilename: vi.fn(() => 'NOAA-19_2025-01-01T12-00-00.wav'),
}))

vi.mock('../utils/shell', () => ({
  spawnProcess: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { ensureDir, generateFilename } from '../utils/fs'
import { startRecording } from './recorder'

describe('recorder', () => {
  const mockConfig: ReceiverConfig = {
    serviceMode: 'full',
    sdrRelay: { port: 3001, host: '0.0.0.0' },
    station: { latitude: 51.5, longitude: -0.1, altitude: 10 },
    sdr: {
      gain: 40,
      ppmCorrection: 0,
      sampleRate: 48_000,
    },
    recording: {
      recordingsDir: '/recordings',
      imagesDir: '/images',
      minSignalStrength: -10,
      minElevation: 10,
      skipSignalCheck: false,
    },
    tle: { updateIntervalHours: 24 },
    web: { port: 3000, host: '0.0.0.0' },
    database: { path: '/tmp/test.db' },
    logLevel: 'info',
    issSstvEnabled: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('startRecording', () => {
    it('should ensure recordings directory exists', async () => {
      await startRecording(TEST_SATELLITE, mockConfig)

      expect(ensureDir).toHaveBeenCalledWith('/recordings')
    })

    it('should generate filename based on satellite name', async () => {
      await startRecording(TEST_SATELLITE, mockConfig)

      expect(generateFilename).toHaveBeenCalledWith('NOAA 19', 'wav')
    })

    it('should spawn rtl_fm with correct arguments', async () => {
      await startRecording(TEST_SATELLITE, mockConfig)

      expect(spawn).toHaveBeenCalledWith(
        'rtl_fm',
        expect.arrayContaining([
          '-f',
          '137100000',
          '-s',
          '48000',
          '-g',
          '40',
          '-p',
          '0',
          '-E',
          'deemp',
          '-F',
          '9',
          '-',
        ]),
        expect.any(Object)
      )
    })

    it('should spawn sox with correct arguments', async () => {
      await startRecording(TEST_SATELLITE, mockConfig)

      expect(spawn).toHaveBeenCalledWith(
        'sox',
        expect.arrayContaining([
          '-t',
          'raw',
          '-r',
          '48000',
          '-e',
          's',
          '-b',
          '16',
          '-c',
          '1',
          '-',
          '-t',
          'wav',
          expect.stringContaining('.wav'),
          'rate',
          '11025',
        ]),
        expect.any(Object)
      )
    })

    it('should return session with correct properties', async () => {
      const session = await startRecording(TEST_SATELLITE, mockConfig)

      expect(session.satellite).toEqual(TEST_SATELLITE)
      expect(session.outputPath).toBe('/recordings/NOAA-19_2025-01-01T12-00-00.wav')
      expect(session.startTime).toBeInstanceOf(Date)
      expect(typeof session.stop).toBe('function')
    })
  })

  describe('session.stop', () => {
    it('should kill rtl_fm process', async () => {
      const session = await startRecording(TEST_SATELLITE, mockConfig)

      setTimeout(() => {
        session.soxProcess.emit('close')
      }, 10)

      await session.stop()

      expect(session.rtlProcess.kill).toHaveBeenCalledWith('SIGTERM')
    })
  })
})
