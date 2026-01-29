import type { Decoder } from '@backend/capture/decoders/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Create a fresh registry for isolated testing
describe('decoder registry (isolated)', () => {
  let registry: Map<string, Decoder>
  let registerDecoder: (decoder: Decoder) => void
  let getDecoder: (signalType: string) => Decoder | undefined
  let getAllDecoders: () => Decoder[]
  let hasDecoder: (signalType: string) => boolean

  beforeEach(() => {
    // Create fresh registry for each test
    registry = new Map()
    registerDecoder = (decoder: Decoder) => {
      registry.set(decoder.signalType, decoder)
    }
    getDecoder = (signalType: string) => registry.get(signalType)
    getAllDecoders = () => Array.from(registry.values())
    hasDecoder = (signalType: string) => registry.has(signalType)
  })

  const createMockDecoder = (signalType: string, name: string): Decoder => ({
    name,
    signalType: signalType as 'apt' | 'sstv',
    decode: vi.fn().mockResolvedValue({ outputPaths: [] }),
    checkInstalled: vi.fn().mockResolvedValue(true),
  })

  describe('registerDecoder', () => {
    it('should register a decoder', () => {
      const decoder = createMockDecoder('apt', 'Test APT Decoder')
      registerDecoder(decoder)

      expect(hasDecoder('apt')).toBe(true)
    })

    it('should replace existing decoder for same signal type', () => {
      const decoder1 = createMockDecoder('apt', 'First Decoder')
      const decoder2 = createMockDecoder('apt', 'Second Decoder')

      registerDecoder(decoder1)
      registerDecoder(decoder2)

      expect(getDecoder('apt')?.name).toBe('Second Decoder')
    })
  })

  describe('getDecoder', () => {
    it('should return registered decoder', () => {
      const decoder = createMockDecoder('sstv', 'SSTV Decoder')
      registerDecoder(decoder)

      const retrieved = getDecoder('sstv')
      expect(retrieved).toBe(decoder)
    })

    it('should return undefined for unregistered signal type', () => {
      const decoder = getDecoder('unknown')
      expect(decoder).toBeUndefined()
    })
  })

  describe('getAllDecoders', () => {
    it('should return all registered decoders', () => {
      const aptDecoder = createMockDecoder('apt', 'APT')
      const sstvDecoder = createMockDecoder('sstv', 'SSTV')

      registerDecoder(aptDecoder)
      registerDecoder(sstvDecoder)

      const all = getAllDecoders()
      expect(all).toHaveLength(2)
    })

    it('should return empty array when no decoders registered', () => {
      const all = getAllDecoders()
      expect(all).toEqual([])
    })
  })

  describe('hasDecoder', () => {
    it('should return true for registered decoder', () => {
      registerDecoder(createMockDecoder('apt', 'APT'))
      expect(hasDecoder('apt')).toBe(true)
    })

    it('should return false for unregistered decoder', () => {
      expect(hasDecoder('apt')).toBe(false)
    })
  })

  describe('decoder interface', () => {
    it('should have decode method', async () => {
      const decoder = createMockDecoder('apt', 'Test')
      registerDecoder(decoder)

      const result = await getDecoder('apt')?.decode('/path/to/file.wav', '/output')

      expect(result).toEqual({ outputPaths: [] })
      expect(decoder.decode).toHaveBeenCalledWith('/path/to/file.wav', '/output')
    })

    it('should have checkInstalled method', async () => {
      const decoder = createMockDecoder('apt', 'Test')
      registerDecoder(decoder)

      const isInstalled = await getDecoder('apt')?.checkInstalled()

      expect(isInstalled).toBe(true)
    })
  })
})
