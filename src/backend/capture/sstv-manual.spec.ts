import { TEST_STATION } from '@/test-fixtures'
import type { ReceiverConfig } from '@backend/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('@backend/db/database', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('@backend/state/state-manager', () => ({
  stateManager: {
    setStatus: vi.fn(),
    updateProgress: vi.fn(),
    startManualCapture: vi.fn(),
  },
}))

vi.mock('@backend/utils/node-compat', () => ({
  sleep: vi.fn(),
}))

vi.mock('@backend/capture/decoders', () => ({
  decodeRecording: vi.fn(),
}))

vi.mock('@backend/capture/fft-stream', () => ({
  getFFTStreamConfig: vi.fn(),
  stopFFTStream: vi.fn(),
}))

vi.mock('@backend/capture/recorder', () => ({
  recordPass: vi.fn(),
}))

// Import after mocks
import { decodeRecording } from '@backend/capture/decoders'
import { getFFTStreamConfig, stopFFTStream } from '@backend/capture/fft-stream'
import { recordPass } from '@backend/capture/recorder'
import { getDatabase } from '@backend/db/database'
import { stateManager } from '@backend/state/state-manager'
import { sleep } from '@backend/utils/node-compat'
import { captureSstvManual } from './sstv-manual'

describe('sstv-manual', () => {
  let mockConfig: ReceiverConfig

  beforeEach(() => {
    vi.clearAllMocks()

    mockConfig = {
      serviceMode: 'full',
      sdrRelay: {
        port: 5000,
        host: 'localhost',
      },
      station: TEST_STATION,
      sdr: {
        gain: 49,
        sampleRate: 48000,
        ppmCorrection: 0,
      },
      recording: {
        minElevation: 15,
        minSignalStrength: -35,
        skipSignalCheck: false,
        recordingsDir: '/tmp/recordings',
        imagesDir: '/tmp/images',
      },
      tle: {
        updateIntervalHours: 24,
      },
      web: {
        port: 3000,
        host: '0.0.0.0',
      },
      database: {
        path: ':memory:',
      },
      logLevel: 'info',
      issSstvEnabled: false,
    }

    // Default mocks
    vi.mocked(sleep).mockResolvedValue()
    vi.mocked(getFFTStreamConfig).mockReturnValue(null)
    vi.mocked(stopFFTStream).mockResolvedValue()
    vi.mocked(recordPass).mockResolvedValue('/tmp/recording.wav')
    vi.mocked(decodeRecording).mockResolvedValue({
      outputPaths: ['/tmp/image1.png'],
    })

    const mockDb = {
      saveCapture: vi.fn().mockReturnValue(1),
      saveImages: vi.fn(),
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as never)
  })

  describe('captureSstvManual', () => {
    it('should successfully capture SSTV manually', async () => {
      const result = await captureSstvManual(145.8e6, 120, mockConfig)

      expect(result).not.toBeNull()
      expect(result?.success).toBe(true)
      expect(result?.recordingPath).toBe('/tmp/recording.wav')
      expect(result?.imagePaths).toEqual(['/tmp/image1.png'])
      expect(result?.satellite.name).toBe('Manual 145.800 MHz')
      expect(result?.satellite.frequency).toBe(145.8e6)
    })

    it('should call startManualCapture with virtual pass', async () => {
      await captureSstvManual(145.8e6, 120, mockConfig)

      expect(vi.mocked(stateManager.startManualCapture)).toHaveBeenCalledWith(
        expect.objectContaining({
          satellite: expect.objectContaining({
            name: 'Manual 145.800 MHz',
            frequency: 145.8e6,
            signalType: 'sstv',
          }),
          duration: 120,
        }),
        120
      )
    })

    it('should set status to decoding during decoding', async () => {
      await captureSstvManual(145.8e6, 120, mockConfig)

      expect(vi.mocked(stateManager.setStatus)).toHaveBeenCalledWith('decoding')
    })

    it('should set status back to idle after completion', async () => {
      await captureSstvManual(145.8e6, 120, mockConfig)

      const calls = vi.mocked(stateManager.setStatus).mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall?.[0]).toBe('idle')
    })

    it('should stop FFT stream if it is running', async () => {
      vi.mocked(getFFTStreamConfig).mockReturnValue({
        frequency: 145.8e6,
        bandwidth: 200000,
        fftSize: 1024,
        gain: 49,
        updateRate: 10,
      })

      await captureSstvManual(145.8e6, 120, mockConfig)

      expect(vi.mocked(stopFFTStream)).toHaveBeenCalled()
      expect(vi.mocked(sleep)).toHaveBeenCalledWith(1000)
    })

    it('should not stop FFT stream if it is not running', async () => {
      vi.mocked(getFFTStreamConfig).mockReturnValue(null)

      await captureSstvManual(145.8e6, 120, mockConfig)

      expect(vi.mocked(stopFFTStream)).not.toHaveBeenCalled()
    })

    it('should record at the specified frequency and duration', async () => {
      await captureSstvManual(145.8e6, 120, mockConfig)

      expect(vi.mocked(recordPass)).toHaveBeenCalledWith(
        expect.objectContaining({
          frequency: 145.8e6,
          signalType: 'sstv',
        }),
        120,
        mockConfig,
        expect.any(Function)
      )
    })

    it('should update progress during recording', async () => {
      let progressCallback: ((elapsed: number, total: number) => void) | undefined

      vi.mocked(recordPass).mockImplementation(async (satellite, duration, config, onProgress) => {
        progressCallback = onProgress
        if (progressCallback) {
          progressCallback(30, 120)
          progressCallback(60, 120)
          progressCallback(120, 120)
        }
        return '/tmp/recording.wav'
      })

      await captureSstvManual(145.8e6, 120, mockConfig)

      expect(vi.mocked(stateManager.updateProgress)).toHaveBeenCalledWith(25, 30, 120)
      expect(vi.mocked(stateManager.updateProgress)).toHaveBeenCalledWith(50, 60, 120)
      expect(vi.mocked(stateManager.updateProgress)).toHaveBeenCalledWith(100, 120, 120)
    })

    it('should decode the recording using SSTV decoder', async () => {
      await captureSstvManual(145.8e6, 120, mockConfig)

      expect(vi.mocked(decodeRecording)).toHaveBeenCalledWith(
        '/tmp/recording.wav',
        '/tmp/images',
        'sstv'
      )
    })

    it('should save capture to database with fake pass', async () => {
      const mockDb = vi.mocked(getDatabase)()

      await captureSstvManual(145.8e6, 120, mockConfig)

      expect(mockDb.saveCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          imagePaths: ['/tmp/image1.png'],
        }),
        expect.objectContaining({
          satellite: expect.objectContaining({
            frequency: 145.8e6,
          }),
          maxElevation: 90,
          duration: 120,
        })
      )
    })

    it('should save images to database when capture succeeds', async () => {
      const mockDb = vi.mocked(getDatabase)()

      await captureSstvManual(145.8e6, 120, mockConfig)

      expect(mockDb.saveImages).toHaveBeenCalledWith(1, ['/tmp/image1.png'])
    })

    it('should mark capture as failed when no images are produced', async () => {
      vi.mocked(decodeRecording).mockResolvedValue({
        outputPaths: [],
      })

      const result = await captureSstvManual(145.8e6, 120, mockConfig)

      expect(result?.success).toBe(false)
      expect(result?.imagePaths).toEqual([])
    })

    it('should not save images when none are produced', async () => {
      const mockDb = vi.mocked(getDatabase)()
      vi.mocked(decodeRecording).mockResolvedValue({
        outputPaths: [],
      })

      await captureSstvManual(145.8e6, 120, mockConfig)

      expect(mockDb.saveImages).not.toHaveBeenCalled()
    })

    it('should handle database save errors gracefully', async () => {
      vi.mocked(getDatabase).mockImplementation(() => {
        throw new Error('Database error')
      })

      const result = await captureSstvManual(145.8e6, 120, mockConfig)

      // Should still return successful result despite database error
      expect(result?.success).toBe(true)
    })

    it('should return null when recording fails', async () => {
      vi.mocked(recordPass).mockRejectedValue(new Error('Recording failed'))

      const result = await captureSstvManual(145.8e6, 120, mockConfig)

      expect(result).toBeNull()
    })

    it('should set status to idle when recording fails', async () => {
      vi.mocked(recordPass).mockRejectedValue(new Error('Recording failed'))

      await captureSstvManual(145.8e6, 120, mockConfig)

      const calls = vi.mocked(stateManager.setStatus).mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall?.[0]).toBe('idle')
    })

    it('should handle decoder errors gracefully', async () => {
      vi.mocked(decodeRecording).mockRejectedValue(new Error('Decoder failed'))

      const result = await captureSstvManual(145.8e6, 120, mockConfig)

      expect(result).toBeNull()
    })

    it('should format frequency name correctly for different frequencies', async () => {
      await captureSstvManual(144.5e6, 90, mockConfig)

      const calls = vi.mocked(recordPass).mock.calls[0]
      const satellite = calls?.[0]
      expect(satellite?.name).toBe('Manual 144.500 MHz')
    })

    it('should create virtual satellite with correct SSTV signal config', async () => {
      await captureSstvManual(145.8e6, 120, mockConfig)

      const calls = vi.mocked(recordPass).mock.calls[0]
      const satellite = calls?.[0]

      expect(satellite?.noradId).toBe(0)
      expect(satellite?.signalType).toBe('sstv')
      expect(satellite?.signalConfig).toEqual({
        type: 'sstv',
        bandwidth: 3000,
        sampleRate: 48000,
        demodulation: 'fm',
      })
      expect(satellite?.enabled).toBe(true)
    })

    it('should handle multiple successive manual captures', async () => {
      const result1 = await captureSstvManual(145.8e6, 120, mockConfig)
      const result2 = await captureSstvManual(144.5e6, 90, mockConfig)

      expect(result1).not.toBeNull()
      expect(result2).not.toBeNull()
      expect(result1?.satellite.frequency).toBe(145.8e6)
      expect(result2?.satellite.frequency).toBe(144.5e6)
    })

    it('should include timestamps in capture result', async () => {
      const beforeCapture = Date.now()

      const result = await captureSstvManual(145.8e6, 120, mockConfig)

      const afterCapture = Date.now()

      expect(result?.startTime.getTime()).toBeGreaterThanOrEqual(beforeCapture)
      expect(result?.startTime.getTime()).toBeLessThanOrEqual(afterCapture)
      expect(result?.endTime.getTime()).toBeGreaterThanOrEqual(result?.startTime.getTime() ?? 0)
      expect(result?.endTime.getTime()).toBeLessThanOrEqual(afterCapture)
    })
  })
})
