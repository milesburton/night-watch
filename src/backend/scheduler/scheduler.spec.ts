import { TEST_SATELLITE, TEST_STATION } from '@/test-fixtures'
import type { CaptureResult, ReceiverConfig, SatellitePass } from '@backend/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all dependencies before importing scheduler
vi.mock('@backend/capture/fft-stream', () => ({
  isFFTStreamRunning: vi.fn(),
  stopFFTStream: vi.fn(),
}))

vi.mock('@backend/capture/recorder', () => ({
  recordPass: vi.fn(),
}))

vi.mock('@backend/capture/signal', () => ({
  verifySignal: vi.fn(),
}))

vi.mock('@backend/capture/decoders', () => ({
  decodeRecording: vi.fn(),
}))

vi.mock('@backend/db/database', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('@backend/capture/sstv-scanner', () => ({
  isSstvScannerRunning: vi.fn(),
  scanForSstv: vi.fn(),
  stopSstvScanner: vi.fn(),
}))

vi.mock('@backend/satellites/events', () => ({
  isGroundSstvScanEnabled: vi.fn(),
}))

vi.mock('@backend/state/state-manager', () => ({
  stateManager: {
    setStatus: vi.fn(),
    startPass: vi.fn(),
    completePass: vi.fn(),
    updateProgress: vi.fn(),
  },
}))

vi.mock('@backend/utils/node-compat', () => ({
  sleep: vi.fn(),
}))

// Now import the modules and functions under test
import { decodeRecording } from '@backend/capture/decoders'
import { isFFTStreamRunning, stopFFTStream } from '@backend/capture/fft-stream'
import { recordPass } from '@backend/capture/recorder'
import { verifySignal } from '@backend/capture/signal'
import { isSstvScannerRunning, scanForSstv, stopSstvScanner } from '@backend/capture/sstv-scanner'
import { getDatabase } from '@backend/db/database'
import { isGroundSstvScanEnabled } from '@backend/satellites/events'
import { stateManager } from '@backend/state/state-manager'
import { sleep } from '@backend/utils/node-compat'
import { capturePass, runScheduler, waitForPass } from './scheduler'

describe('scheduler', () => {
  let mockConfig: ReceiverConfig
  let mockPass: SatellitePass

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock default implementations
    vi.mocked(isFFTStreamRunning).mockReturnValue(false)
    vi.mocked(isSstvScannerRunning).mockReturnValue(false)
    vi.mocked(isGroundSstvScanEnabled).mockReturnValue(false)
    vi.mocked(sleep).mockResolvedValue()
    vi.mocked(verifySignal).mockResolvedValue(true)
    vi.mocked(stopFFTStream).mockResolvedValue()
    vi.mocked(stopSstvScanner).mockReturnValue()

    mockConfig = {
      serviceMode: 'full',
      sdrRelay: {
        port: 5000,
        host: 'localhost',
      },
      station: TEST_STATION,
      sdr: {
        gain: 49,
        sampleRate: 1024000,
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

    // Create a pass starting 10 minutes from now
    const now = Date.now()
    mockPass = {
      satellite: TEST_SATELLITE,
      aos: new Date(now + 10 * 60 * 1000), // 10 minutes from now
      los: new Date(now + 20 * 60 * 1000), // 20 minutes from now
      maxElevation: 45,
      maxElevationTime: new Date(now + 15 * 60 * 1000),
      duration: 600, // 10 minutes
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('waitForPass', () => {
    it('should return immediately if pass is already starting', async () => {
      const pastPass = {
        ...mockPass,
        aos: new Date(Date.now() - 1000), // 1 second ago
      }

      await waitForPass(pastPass)

      expect(vi.mocked(sleep)).not.toHaveBeenCalled()
      expect(vi.mocked(stateManager.setStatus)).toHaveBeenCalledWith('waiting')
    })

    it('should wait for pass without SSTV scanning when idle time is insufficient', async () => {
      // Create a pass starting in 2 minutes (less than MIN_IDLE_FOR_SSTV_SCAN)
      const soonPass = {
        ...mockPass,
        aos: new Date(Date.now() + 2 * 60 * 1000),
      }

      await waitForPass(soonPass, mockConfig)

      expect(vi.mocked(scanForSstv)).not.toHaveBeenCalled()
      expect(vi.mocked(sleep)).toHaveBeenCalled()
    })

    it('should wait for pass without SSTV scanning when config is not provided', async () => {
      await waitForPass(mockPass)

      expect(vi.mocked(scanForSstv)).not.toHaveBeenCalled()
      expect(vi.mocked(sleep)).toHaveBeenCalled()
    })

    it('should start SSTV scan when idle time is sufficient and ground scanning is enabled', async () => {
      vi.mocked(isGroundSstvScanEnabled).mockReturnValue(true)

      // Mock scanForSstv to resolve with success
      vi.mocked(scanForSstv).mockResolvedValue({
        satellite: TEST_SATELLITE,
        recordingPath: '/tmp/recording.wav',
        imagePaths: ['/tmp/image.png'],
        startTime: new Date(),
        endTime: new Date(),
        maxSignalStrength: -30,
        success: true,
      })

      await waitForPass(mockPass, mockConfig)

      expect(vi.mocked(scanForSstv)).toHaveBeenCalled()
      expect(vi.mocked(sleep)).toHaveBeenCalled()
    })

    it('should not start SSTV scan when scanner is already running', async () => {
      vi.mocked(isGroundSstvScanEnabled).mockReturnValue(true)
      vi.mocked(isSstvScannerRunning).mockReturnValue(true)

      await waitForPass(mockPass, mockConfig)

      expect(vi.mocked(scanForSstv)).not.toHaveBeenCalled()
    })

    it('should stop SSTV scanner before pass starts', async () => {
      vi.mocked(isGroundSstvScanEnabled).mockReturnValue(true)
      vi.mocked(scanForSstv).mockResolvedValue({
        satellite: TEST_SATELLITE,
        recordingPath: '/tmp/recording.wav',
        imagePaths: ['/tmp/image.png'],
        startTime: new Date(),
        endTime: new Date(),
        maxSignalStrength: -30,
        success: true,
      })

      await waitForPass(mockPass, mockConfig)

      // stopSstvScanner should be called at the end
      expect(vi.mocked(stopSstvScanner)).toHaveBeenCalled()
    })
  })

  describe('capturePass', () => {
    beforeEach(() => {
      // Mock database
      const mockDb = {
        saveCapture: vi.fn().mockReturnValue(1),
        saveImages: vi.fn(),
      }
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)

      // Mock recorder to return a recording path
      vi.mocked(recordPass).mockResolvedValue('/tmp/recording.wav')

      // Mock decoder to return image paths
      vi.mocked(decodeRecording).mockResolvedValue({
        outputPaths: ['/tmp/image1.png', '/tmp/image2.png'],
      })
    })

    it('should stop FFT stream before starting capture', async () => {
      vi.mocked(isFFTStreamRunning).mockReturnValue(true)

      await capturePass(mockPass, mockConfig)

      expect(vi.mocked(stopFFTStream)).toHaveBeenCalled()
      expect(vi.mocked(sleep)).toHaveBeenCalledWith(1000) // Additional delay
    })

    it('should verify signal before recording when signal check is enabled', async () => {
      await capturePass(mockPass, mockConfig)

      expect(vi.mocked(verifySignal)).toHaveBeenCalledWith(
        TEST_SATELLITE,
        mockConfig.sdr.gain,
        mockConfig.recording.minSignalStrength
      )
    })

    it('should skip signal verification when skipSignalCheck is true', async () => {
      mockConfig.recording.skipSignalCheck = true

      await capturePass(mockPass, mockConfig)

      expect(vi.mocked(verifySignal)).not.toHaveBeenCalled()
    })

    it('should skip capture and return failure result when signal is too weak', async () => {
      vi.mocked(verifySignal).mockResolvedValue(false)

      const result = await capturePass(mockPass, mockConfig)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Signal too weak')
      expect(vi.mocked(recordPass)).not.toHaveBeenCalled()
      expect(vi.mocked(stateManager.completePass)).toHaveBeenCalledWith(result)
    })

    it('should successfully capture and decode satellite pass', async () => {
      const result = await capturePass(mockPass, mockConfig)

      expect(vi.mocked(stateManager.startPass)).toHaveBeenCalledWith(mockPass)
      expect(vi.mocked(recordPass)).toHaveBeenCalled()
      expect(vi.mocked(stateManager.setStatus)).toHaveBeenCalledWith('decoding')
      expect(vi.mocked(decodeRecording)).toHaveBeenCalled()

      expect(result.success).toBe(true)
      expect(result.recordingPath).toBe('/tmp/recording.wav')
      expect(result.imagePaths).toEqual(['/tmp/image1.png', '/tmp/image2.png'])
      expect(result.satellite).toBe(TEST_SATELLITE)
    })

    it('should save capture result to database', async () => {
      const mockDb = vi.mocked(getDatabase)()

      await capturePass(mockPass, mockConfig)

      expect(mockDb.saveCapture).toHaveBeenCalled()
      expect(mockDb.saveImages).toHaveBeenCalledWith(1, ['/tmp/image1.png', '/tmp/image2.png'])
    })

    it('should update progress during recording', async () => {
      let progressCallback: ((elapsed: number, total: number) => void) | undefined

      vi.mocked(recordPass).mockImplementation(async (satellite, duration, config, onProgress) => {
        progressCallback = onProgress
        if (progressCallback) {
          progressCallback(30, 100)
          progressCallback(60, 100)
          progressCallback(100, 100)
        }
        return '/tmp/recording.wav'
      })

      await capturePass(mockPass, mockConfig)

      expect(vi.mocked(stateManager.updateProgress)).toHaveBeenCalledWith(30, 30, 100)
      expect(vi.mocked(stateManager.updateProgress)).toHaveBeenCalledWith(60, 60, 100)
      expect(vi.mocked(stateManager.updateProgress)).toHaveBeenCalledWith(100, 100, 100)
    })

    it('should handle recording errors gracefully', async () => {
      vi.mocked(recordPass).mockRejectedValue(new Error('Recording failed'))

      const result = await capturePass(mockPass, mockConfig)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Recording failed')
      expect(vi.mocked(stateManager.completePass)).toHaveBeenCalledWith(result)
    })

    it('should handle decoder returning no images', async () => {
      vi.mocked(decodeRecording).mockResolvedValue({
        outputPaths: [],
      })

      const result = await capturePass(mockPass, mockConfig)

      expect(result.success).toBe(true)
      expect(result.imagePaths).toEqual([])
    })

    it('should handle database save errors gracefully', async () => {
      vi.mocked(getDatabase).mockImplementation(() => {
        throw new Error('Database error')
      })

      // Should not throw, just log warning
      const result = await capturePass(mockPass, mockConfig)

      expect(result.success).toBe(true)
    })
  })

  describe('runScheduler', () => {
    beforeEach(() => {
      // Setup mocks for successful capture
      const mockDb = {
        saveCapture: vi.fn().mockReturnValue(1),
        saveImages: vi.fn(),
      }
      vi.mocked(getDatabase).mockReturnValue(mockDb as never)
      vi.mocked(recordPass).mockResolvedValue('/tmp/recording.wav')
      vi.mocked(decodeRecording).mockResolvedValue({
        outputPaths: ['/tmp/image.png'],
      })
    })

    it('should process all passes in sequence', async () => {
      // Create passes starting now
      const now = Date.now()
      const pass1: SatellitePass = {
        ...mockPass,
        aos: new Date(now + 1000),
      }
      const pass2: SatellitePass = {
        ...mockPass,
        aos: new Date(now + 2000),
      }

      const results = await runScheduler([pass1, pass2], mockConfig)

      expect(results).toHaveLength(2)
      expect(results[0]?.success).toBe(true)
      expect(results[1]?.success).toBe(true)
    })

    it('should skip past passes', async () => {
      const pastPass: SatellitePass = {
        ...mockPass,
        aos: new Date(Date.now() - 60000),
        los: new Date(Date.now() - 30000),
      }

      const results = await runScheduler([pastPass], mockConfig)

      expect(results).toHaveLength(0)
      expect(vi.mocked(recordPass)).not.toHaveBeenCalled()
    })

    it('should continue processing after failed capture', async () => {
      const now = Date.now()
      const pass1: SatellitePass = {
        ...mockPass,
        aos: new Date(now + 1000),
      }
      const pass2: SatellitePass = {
        ...mockPass,
        aos: new Date(now + 2000),
      }

      // Make first capture fail, second succeed
      vi.mocked(recordPass)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('/tmp/recording.wav')

      const results = await runScheduler([pass1, pass2], mockConfig)

      expect(results).toHaveLength(2)
      expect(results[0]?.success).toBe(false)
      expect(results[1]?.success).toBe(true)
    })

    it('should handle empty pass list', async () => {
      const results = await runScheduler([], mockConfig)

      expect(results).toHaveLength(0)
    })
  })
})
