import {
  checkDecoderInstalled,
  decodeRecording,
  getAllDecoders,
  getDecoder,
  hasDecoder,
} from '@backend/capture/decoders'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock logger
vi.mock('@backend/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('decoder registry', () => {
  describe('getDecoder', () => {
    it('should return LRPT decoder for lrpt signal type', () => {
      const decoder = getDecoder('lrpt')
      expect(decoder).toBeDefined()
      expect(decoder?.name).toBe('LRPT Decoder (SatDump)')
      expect(decoder?.signalType).toBe('lrpt')
    })

    it('should return SSTV decoder for sstv signal type', () => {
      const decoder = getDecoder('sstv')
      expect(decoder).toBeDefined()
      expect(decoder?.name).toBe('SSTV Decoder')
      expect(decoder?.signalType).toBe('sstv')
    })
  })

  describe('hasDecoder', () => {
    it('should return true for registered decoders', () => {
      expect(hasDecoder('lrpt')).toBe(true)
      expect(hasDecoder('sstv')).toBe(true)
    })
  })

  describe('getAllDecoders', () => {
    it('should return all registered decoders', () => {
      const decoders = getAllDecoders()
      expect(decoders).toHaveLength(2)
      expect(decoders.map((d) => d.signalType).sort()).toEqual(['lrpt', 'sstv'])
    })
  })

  describe('decoder interface', () => {
    it('APT decoder should have required methods', () => {
      const decoder = getDecoder('lrpt')
      expect(typeof decoder?.decode).toBe('function')
      expect(typeof decoder?.checkInstalled).toBe('function')
    })

    it('SSTV decoder should have required methods', () => {
      const decoder = getDecoder('sstv')
      expect(typeof decoder?.decode).toBe('function')
      expect(typeof decoder?.checkInstalled).toBe('function')
    })
  })

  describe('checkDecoderInstalled', () => {
    it('should return false for unregistered decoder', async () => {
      const result = await checkDecoderInstalled('unknown' as 'lrpt')
      expect(result).toBe(false)
    })
  })

  describe('checkDecoderInstalled', () => {
    it('should check if LRPT decoder is installed', async () => {
      const result = await checkDecoderInstalled('lrpt')
      expect(typeof result).toBe('boolean')
    })
  })

  describe('decodeRecording', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should return null for unregistered decoder', async () => {
      const { logger } = await import('@backend/utils/logger')
      const result = await decodeRecording('/test.wav', '/output', 'unknown' as 'lrpt')

      expect(result).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No decoder registered'))
    })

    it('should return null when decoder is not installed', async () => {
      const { logger } = await import('@backend/utils/logger')

      // Mock checkInstalled to return false
      const decoder = getDecoder('lrpt')
      if (decoder) {
        const originalCheck = decoder.checkInstalled
        decoder.checkInstalled = vi.fn().mockResolvedValue(false)

        const result = await decodeRecording('/test.wav', '/output', 'lrpt')

        expect(result).toBeNull()
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('is not installed'))

        // Restore
        decoder.checkInstalled = originalCheck
      }
    })

    it('should decode when decoder exists and is installed', async () => {
      const decoder = getDecoder('lrpt')
      if (decoder) {
        const originalCheck = decoder.checkInstalled
        const originalDecode = decoder.decode

        decoder.checkInstalled = vi.fn().mockResolvedValue(true)
        decoder.decode = vi.fn().mockResolvedValue({
          outputPaths: ['/output/test.png'],
        })

        const result = await decodeRecording('/test.wav', '/output', 'lrpt')

        expect(result).toBeDefined()
        expect(decoder.decode).toHaveBeenCalledWith('/test.wav', '/output')

        // Restore
        decoder.checkInstalled = originalCheck
        decoder.decode = originalDecode
      }
    })
  })
})
