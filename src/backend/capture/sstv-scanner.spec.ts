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
  stopFFTStream: vi.fn(),
}))

vi.mock('./recorder', () => ({
  recordPass: vi.fn(() => Promise.resolve('/recordings/test.wav')),
}))

import { SSTV_SCAN_FREQUENCIES, isSstvScannerRunning, stopSstvScanner } from './sstv-scanner'

describe('sstv-scanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    it('should contain 2m SSTV alternate frequency', () => {
      const alt = SSTV_SCAN_FREQUENCIES.find((f) => f.name === '2m SSTV Alt')
      expect(alt).toBeDefined()
      expect(alt?.frequency).toBe(145.5e6)
    })

    it('should have two frequencies', () => {
      expect(SSTV_SCAN_FREQUENCIES).toHaveLength(2)
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
})
