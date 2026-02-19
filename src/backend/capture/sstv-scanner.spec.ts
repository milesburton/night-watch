import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/database', () => ({
  getDatabase: vi.fn(() => ({
    saveCapture: vi.fn(() => 1),
    saveImages: vi.fn(),
  })),
}))

vi.mock('../state/state-manager', () => ({
  stateManager: {
    setStatus: vi.fn(),
    startPass: vi.fn(),
    setScanningFrequency: vi.fn(),
    updateProgress: vi.fn(),
    getState: vi.fn(() => ({ status: 'scanning' })),
  },
}))

vi.mock('./decoders', () => ({
  decodeRecording: vi.fn(() => Promise.resolve({ outputPaths: ['/images/test-sstv.png'] })),
}))

vi.mock('./fft-stream', () => ({
  getLatestFFTData: vi.fn(() => null),
  getPeakPowerInBand: vi.fn(() => null),
  stopFFTStream: vi.fn(),
  isFFTStreamRunning: vi.fn(() => true), // pretend FFT is already running in tests
  startFFTStream: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('./recorder', () => ({
  recordPass: vi.fn(() => Promise.resolve('/recordings/test.wav')),
}))

vi.mock('../utils/node-compat', () => ({
  sleep: vi.fn(() => Promise.resolve()),
}))

import { TEST_STATION } from '@/test-fixtures'
import type { ReceiverConfig } from '@backend/types'
import { stateManager } from '../state/state-manager'
import { decodeRecording } from './decoders'
import { getPeakPowerInBand, stopFFTStream } from './fft-stream'
import { recordPass } from './recorder'
import {
  SSTV_SCAN_FREQUENCIES,
  isSstvScannerRunning,
  scanForSstv,
  stopSstvScanner,
} from './sstv-scanner'

describe('sstv-scanner', () => {
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
  })

  afterEach(() => {
    stopSstvScanner()
    vi.resetAllMocks()
  })

  describe('SSTV_SCAN_FREQUENCIES', () => {
    it('should contain 2m SSTV calling frequency', () => {
      const calling = SSTV_SCAN_FREQUENCIES.find((f) => f.name === '2m SSTV Calling')
      expect(calling).toBeDefined()
      expect(calling?.frequency).toBe(144.5e6)
    })

    // Temporarily disabled - 145.5 MHz removed to prevent USB lock issues
    it.skip('should contain 2m SSTV alternate frequency', () => {
      const alt = SSTV_SCAN_FREQUENCIES.find((f) => f.name === '2m SSTV Alt')
      expect(alt).toBeDefined()
      expect(alt?.frequency).toBe(145.5e6)
    })

    it('should have one frequency (temporarily - 145.5 MHz disabled)', () => {
      expect(SSTV_SCAN_FREQUENCIES).toHaveLength(1)
    })
  })

  describe('isSstvScannerRunning', () => {
    it('should return false when not scanning', () => {
      expect(isSstvScannerRunning()).toBe(false)
    })
  })

  describe('stopSstvScanner', () => {
    it('should set shouldStop flag and not throw', () => {
      expect(() => stopSstvScanner()).not.toThrow()
    })

    it('should be safe to call multiple times', () => {
      expect(() => {
        stopSstvScanner()
        stopSstvScanner()
        stopSstvScanner()
      }).not.toThrow()
    })
  })

  describe('scanForSstv', () => {
    beforeEach(() => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(null)
      vi.mocked(stopFFTStream).mockResolvedValue()
      vi.mocked(recordPass).mockResolvedValue('/recordings/test.wav')
      vi.mocked(decodeRecording).mockResolvedValue({ outputPaths: ['/images/test.png'] })
    })

    it('should return null if scanner is already running', async () => {
      // Start first scan (don't await)
      const firstScan = scanForSstv(mockConfig, 1)

      // Try to start second scan while first is running
      const result = await scanForSstv(mockConfig, 1)

      expect(result).toBeNull()

      // Wait for first scan to complete
      await firstScan
    })

    it('should set scanning status at start', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-50)

      const scanPromise = scanForSstv(mockConfig, 1)

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(vi.mocked(stateManager.setStatus)).toHaveBeenCalledWith('scanning')

      stopSstvScanner()
      await scanPromise
    })

    it('should set idle status when done scanning', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-50)

      await scanForSstv(mockConfig, 1)

      expect(vi.mocked(stateManager.setStatus)).toHaveBeenCalledWith('idle')
    })

    it('should return null when stopped early', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-50)

      const scanPromise = scanForSstv(mockConfig, 10)

      // Stop immediately
      stopSstvScanner()

      const result = await scanPromise

      expect(result).toBeNull()
    })

    it('should return null when timeout is reached without signal', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-80)

      const result = await scanForSstv(mockConfig, 1)

      expect(result).toBeNull()
    })

    it('should scan frequencies and set scanning frequency', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-80)

      const scanPromise = scanForSstv(mockConfig, 1)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(vi.mocked(stateManager.setScanningFrequency)).toHaveBeenCalled()

      stopSstvScanner()
      await scanPromise
    })

    it('should detect signal above threshold and capture', async () => {
      // minSignalStrength is -35, so threshold is exactly -35 dB
      // Signal at -30 dB is 5 dB above threshold — should trigger capture
      vi.mocked(getPeakPowerInBand).mockReturnValue(-30)

      const result = await scanForSstv(mockConfig, 10)

      expect(result).not.toBeNull()
      expect(result?.success).toBe(true)
      expect(vi.mocked(stopFFTStream)).toHaveBeenCalled()
      expect(vi.mocked(recordPass)).toHaveBeenCalled()
      expect(vi.mocked(decodeRecording)).toHaveBeenCalled()
    })

    it('should not capture if signal is below threshold', async () => {
      // minSignalStrength is -35, so threshold is exactly -35 dB
      // Signal at -40 dB is below threshold — should NOT trigger capture
      vi.mocked(getPeakPowerInBand).mockReturnValue(-40)

      const result = await scanForSstv(mockConfig, 1)

      expect(result).toBeNull()
      expect(vi.mocked(recordPass)).not.toHaveBeenCalled()
    })

    it('should not capture a signal that is only just above the noise floor (near-noise-floor regression)', async () => {
      // Regression: previously signalThreshold = minSignalStrength - 5, which caused
      // captures to trigger on signals only 1-2 dB above noise, producing garbage images.
      // Now threshold = minSignalStrength exactly.
      // Noise floor ~-61 dB, minSignalStrength = -35, threshold = -35 dB.
      // A signal at -36 dB (1 dB below threshold) must NOT trigger capture.
      vi.mocked(getPeakPowerInBand).mockReturnValue(-36)

      const result = await scanForSstv(mockConfig, 1)

      expect(result).toBeNull()
      expect(vi.mocked(recordPass)).not.toHaveBeenCalled()
    })

    it('should use minSignalStrength directly as threshold without any offset', async () => {
      // The threshold must equal minSignalStrength exactly (no -5 fudge factor).
      // Signal exactly at threshold should NOT capture (requires strictly above).
      vi.mocked(getPeakPowerInBand).mockReturnValue(-35) // exactly at threshold

      const result = await scanForSstv(mockConfig, 1)

      expect(result).toBeNull()
      expect(vi.mocked(recordPass)).not.toHaveBeenCalled()
    })

    it('should stop FFT stream before recording', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-30)

      await scanForSstv(mockConfig, 10)

      expect(vi.mocked(stopFFTStream)).toHaveBeenCalled()
    })

    it('should record with correct satellite info', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-30)

      await scanForSstv(mockConfig, 10)

      expect(vi.mocked(recordPass)).toHaveBeenCalledWith(
        expect.objectContaining({
          frequency: 144.5e6,
          signalType: 'sstv',
        }),
        150,
        mockConfig,
        expect.any(Function)
      )
    })

    it('should decode recording with SSTV decoder', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-30)

      await scanForSstv(mockConfig, 10)

      expect(vi.mocked(decodeRecording)).toHaveBeenCalledWith(
        '/recordings/test.wav',
        '/tmp/images',
        'sstv'
      )
    })

    it('should return success result when images are decoded', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-30)
      vi.mocked(decodeRecording).mockResolvedValue({
        outputPaths: ['/images/img1.png', '/images/img2.png'],
      })

      const result = await scanForSstv(mockConfig, 10)

      expect(result?.success).toBe(true)
      expect(result?.imagePaths).toEqual(['/images/img1.png', '/images/img2.png'])
    })

    it('should return failed result when no images are decoded', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-30)
      vi.mocked(decodeRecording).mockResolvedValue({ outputPaths: [] })

      const result = await scanForSstv(mockConfig, 1)

      // Should continue scanning after no images, eventually timeout
      expect(result).toBeNull()
    }, 15000)

    it('should continue scanning after failed capture', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-30)
      vi.mocked(decodeRecording).mockResolvedValue({ outputPaths: [] })

      const scanPromise = scanForSstv(mockConfig, 1)

      // Let it start
      await new Promise((resolve) => setTimeout(resolve, 50))
      stopSstvScanner()

      await scanPromise

      // Should have set scanning status initially
      expect(vi.mocked(stateManager.setStatus)).toHaveBeenCalledWith('scanning')
    })

    it('should handle recording errors gracefully', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-30)
      vi.mocked(recordPass).mockRejectedValue(new Error('Recording failed'))

      const result = await scanForSstv(mockConfig, 1)

      // Should continue scanning after error, then timeout
      expect(result).toBeNull()
    }, 15000)

    it('should update progress during recording', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-30)

      vi.mocked(recordPass).mockImplementation(
        async (_satellite, _duration, _config, onProgress) => {
          if (onProgress) {
            onProgress(5, 10)
          }
          return '/recordings/test.wav'
        }
      )

      await scanForSstv(mockConfig, 10)

      expect(vi.mocked(stateManager.updateProgress)).toHaveBeenCalledWith(50, 5, 10)
    })

    it('should not scan if already scanning', async () => {
      vi.mocked(getPeakPowerInBand).mockReturnValue(-80)

      const scan1 = scanForSstv(mockConfig, 1)
      const scan2 = scanForSstv(mockConfig, 1)

      const result2 = await scan2
      expect(result2).toBeNull()

      await scan1
    })
  })
})
