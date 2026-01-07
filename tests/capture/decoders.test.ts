import { describe, expect, it } from 'bun:test'
import { getAllDecoders, getDecoder, hasDecoder } from '../../src/capture/decoders'

describe('decoder registry', () => {
  describe('getDecoder', () => {
    it('should return APT decoder for apt signal type', () => {
      const decoder = getDecoder('apt')
      expect(decoder).toBeDefined()
      expect(decoder?.name).toBe('APT Decoder (aptdec)')
      expect(decoder?.signalType).toBe('apt')
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
      expect(hasDecoder('apt')).toBe(true)
      expect(hasDecoder('sstv')).toBe(true)
    })
  })

  describe('getAllDecoders', () => {
    it('should return all registered decoders', () => {
      const decoders = getAllDecoders()
      expect(decoders).toHaveLength(2)
      expect(decoders.map((d) => d.signalType).sort()).toEqual(['apt', 'sstv'])
    })
  })

  describe('decoder interface', () => {
    it('APT decoder should have required methods', () => {
      const decoder = getDecoder('apt')
      expect(typeof decoder?.decode).toBe('function')
      expect(typeof decoder?.checkInstalled).toBe('function')
    })

    it('SSTV decoder should have required methods', () => {
      const decoder = getDecoder('sstv')
      expect(typeof decoder?.decode).toBe('function')
      expect(typeof decoder?.checkInstalled).toBe('function')
    })
  })
})
