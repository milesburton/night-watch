import {
  addNotchFilter,
  clearNotchFilters,
  getFFTStreamConfig,
  getFFTStreamError,
  getNotchFilters,
  isFFTStreamRunning,
  removeNotchFilter,
  setNotchFilterEnabled,
  stopFFTStream,
} from '@backend/capture/fft-stream'
import { afterEach, describe, expect, it } from 'vitest'

describe('fft-stream', () => {
  afterEach(() => {
    stopFFTStream()
    clearNotchFilters()
  })

  describe('initial state', () => {
    it('should not be running initially', () => {
      expect(isFFTStreamRunning()).toBe(false)
    })

    it('should have no config initially', () => {
      expect(getFFTStreamConfig()).toBeNull()
    })

    it('should have no error initially', () => {
      expect(getFFTStreamError()).toBeNull()
    })
  })

  describe('stopFFTStream', () => {
    it('should be safe to call when not running', () => {
      expect(() => stopFFTStream()).not.toThrow()
    })

    it('should reset state after stopping', () => {
      stopFFTStream()
      expect(isFFTStreamRunning()).toBe(false)
      expect(getFFTStreamConfig()).toBeNull()
    })
  })

  describe('notch filters', () => {
    it('should start with no notch filters', () => {
      expect(getNotchFilters()).toEqual([])
    })

    it('should add a notch filter', () => {
      addNotchFilter(137.5e6, 5000)
      const filters = getNotchFilters()
      expect(filters).toHaveLength(1)
      expect(filters[0]).toEqual({
        frequency: 137.5e6,
        width: 5000,
        enabled: true,
      })
    })

    it('should add multiple notch filters', () => {
      addNotchFilter(137.5e6, 5000)
      addNotchFilter(145.8e6, 3000)
      expect(getNotchFilters()).toHaveLength(2)
    })

    it('should use default width of 5000 Hz', () => {
      addNotchFilter(137.5e6)
      const filters = getNotchFilters()
      expect(filters[0]?.width).toBe(5000)
    })

    it('should update existing filter if frequency is within 1 kHz', () => {
      addNotchFilter(137.5e6, 5000)
      addNotchFilter(137.5005e6, 10000) // 500 Hz away
      const filters = getNotchFilters()
      expect(filters).toHaveLength(1)
      expect(filters[0]?.width).toBe(10000)
      expect(filters[0]?.enabled).toBe(true)
    })

    it('should add separate filter if frequency is more than 1 kHz away', () => {
      addNotchFilter(137.5e6, 5000)
      addNotchFilter(137.502e6, 5000) // 2 kHz away
      expect(getNotchFilters()).toHaveLength(2)
    })

    it('should remove a notch filter by frequency', () => {
      addNotchFilter(137.5e6, 5000)
      addNotchFilter(145.8e6, 3000)
      const result = removeNotchFilter(137.5e6)
      expect(result).toBe(true)
      expect(getNotchFilters()).toHaveLength(1)
      expect(getNotchFilters()[0]?.frequency).toBe(145.8e6)
    })

    it('should return false when removing non-existent filter', () => {
      const result = removeNotchFilter(100e6)
      expect(result).toBe(false)
    })

    it('should remove filter within 1 kHz tolerance', () => {
      addNotchFilter(137.5e6, 5000)
      const result = removeNotchFilter(137.5005e6) // 500 Hz away
      expect(result).toBe(true)
      expect(getNotchFilters()).toHaveLength(0)
    })

    it('should enable/disable a notch filter', () => {
      addNotchFilter(137.5e6, 5000)
      setNotchFilterEnabled(137.5e6, false)
      expect(getNotchFilters()[0]?.enabled).toBe(false)

      setNotchFilterEnabled(137.5e6, true)
      expect(getNotchFilters()[0]?.enabled).toBe(true)
    })

    it('should return false when toggling non-existent filter', () => {
      expect(setNotchFilterEnabled(100e6, false)).toBe(false)
    })

    it('should clear all notch filters', () => {
      addNotchFilter(137.5e6)
      addNotchFilter(145.8e6)
      addNotchFilter(144.42e6)
      clearNotchFilters()
      expect(getNotchFilters()).toEqual([])
    })

    it('should return a copy of notch filters (not a reference)', () => {
      addNotchFilter(137.5e6)
      const filters = getNotchFilters()
      filters.push({ frequency: 999e6, width: 1000, enabled: true })
      expect(getNotchFilters()).toHaveLength(1)
    })
  })

  describe('updateFFTFrequency', () => {
    it('should return false when no config exists', async () => {
      const { updateFFTFrequency } = await import('@backend/capture/fft-stream')
      const result = await updateFFTFrequency(137.5e6)
      expect(result).toBe(false)
    })
  })
})
