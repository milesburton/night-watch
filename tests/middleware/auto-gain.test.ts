import { createAutoGain } from '@middleware/web/auto-gain'
import { describe, expect, it } from 'vitest'

describe('auto-gain', () => {
  describe('createAutoGain', () => {
    it('should create with initial gain', () => {
      const ag = createAutoGain(20)
      expect(ag.state.currentGain).toBe(20)
      expect(ag.state.enabled).toBe(true)
      expect(ag.state.samples).toEqual([])
    })

    it('should use default config values', () => {
      const ag = createAutoGain(20)
      expect(ag.config.targetMin).toBe(-80)
      expect(ag.config.targetMax).toBe(-55)
      expect(ag.config.samplesNeeded).toBe(10)
      expect(ag.config.step).toBe(5)
      expect(ag.config.minGain).toBe(0)
      expect(ag.config.maxGain).toBe(50)
    })

    it('should accept custom config', () => {
      const ag = createAutoGain(30, { targetMin: -90, targetMax: -40, step: 10 })
      expect(ag.config.targetMin).toBe(-90)
      expect(ag.config.targetMax).toBe(-40)
      expect(ag.config.step).toBe(10)
      expect(ag.config.samplesNeeded).toBe(10) // unchanged default
    })
  })

  describe('feed', () => {
    it('should return waiting while collecting samples', () => {
      const ag = createAutoGain(20, { samplesNeeded: 5 })
      const bins = new Array(100).fill(-70) // In range

      for (let i = 0; i < 4; i++) {
        expect(ag.feed(bins)).toEqual({ action: 'waiting' })
      }
      expect(ag.state.samples).toHaveLength(4)
    })

    it('should return in_range when noise floor is within target', () => {
      const ag = createAutoGain(20, { samplesNeeded: 3, targetMin: -80, targetMax: -55 })
      const bins = new Array(100).fill(-65) // Median will be -65, in range

      ag.feed(bins)
      ag.feed(bins)
      const result = ag.feed(bins)

      expect(result).toEqual({ action: 'in_range', gain: 20 })
      expect(ag.state.enabled).toBe(false)
    })

    it('should reduce gain when noise floor is too high', () => {
      const ag = createAutoGain(30, { samplesNeeded: 3, targetMax: -55, step: 5 })
      const bins = new Array(100).fill(-40) // Median -40, above -55

      ag.feed(bins)
      ag.feed(bins)
      const result = ag.feed(bins)

      expect(result).toEqual({ action: 'adjusted', oldGain: 30, newGain: 25 })
      expect(ag.state.currentGain).toBe(25)
    })

    it('should increase gain when noise floor is too low', () => {
      const ag = createAutoGain(20, { samplesNeeded: 3, targetMin: -80, step: 5 })
      const bins = new Array(100).fill(-95) // Median -95, below -80

      ag.feed(bins)
      ag.feed(bins)
      const result = ag.feed(bins)

      expect(result).toEqual({ action: 'adjusted', oldGain: 20, newGain: 25 })
      expect(ag.state.currentGain).toBe(25)
    })

    it('should not exceed max gain', () => {
      const ag = createAutoGain(50, { samplesNeeded: 3, targetMin: -80, step: 5, maxGain: 50 })
      const bins = new Array(100).fill(-95) // Too low, but already at max

      ag.feed(bins)
      ag.feed(bins)
      const result = ag.feed(bins)

      expect(result).toEqual({ action: 'limit_reached', gain: 50 })
      expect(ag.state.enabled).toBe(false)
    })

    it('should not go below min gain', () => {
      const ag = createAutoGain(0, { samplesNeeded: 3, targetMax: -55, step: 5, minGain: 0 })
      const bins = new Array(100).fill(-40) // Too high, but already at min

      ag.feed(bins)
      ag.feed(bins)
      const result = ag.feed(bins)

      expect(result).toEqual({ action: 'limit_reached', gain: 0 })
      expect(ag.state.enabled).toBe(false)
    })

    it('should return waiting when disabled', () => {
      const ag = createAutoGain(20)
      ag.disable()
      const bins = new Array(100).fill(-70)

      const result = ag.feed(bins)
      expect(result).toEqual({ action: 'waiting' })
      expect(ag.state.samples).toEqual([]) // Should not accumulate samples
    })

    it('should use median of bins array for noise floor estimate', () => {
      const ag = createAutoGain(20, { samplesNeeded: 1, targetMin: -80, targetMax: -55 })

      // Create bins where median is in range (-65) but mean would be different
      const bins = new Array(100).fill(-65)
      bins[0] = -120 // outlier low
      bins[99] = -10 // outlier high

      const result = ag.feed(bins)
      expect(result).toEqual({ action: 'in_range', gain: 20 })
    })

    it('should average median samples over multiple feeds', () => {
      const ag = createAutoGain(20, { samplesNeeded: 4, targetMin: -80, targetMax: -55, step: 5 })

      // Mix of low and in-range samples, but average will be too low
      ag.feed(new Array(100).fill(-90))
      ag.feed(new Array(100).fill(-95))
      ag.feed(new Array(100).fill(-85))
      const result = ag.feed(new Array(100).fill(-90))

      // Average median: (-90 + -95 + -85 + -90) / 4 = -90, which is below -80
      expect(result).toEqual({ action: 'adjusted', oldGain: 20, newGain: 25 })
    })

    it('should reset samples after adjustment', () => {
      const ag = createAutoGain(20, { samplesNeeded: 2, targetMin: -80, step: 5 })
      const lowBins = new Array(100).fill(-95)

      ag.feed(lowBins)
      ag.feed(lowBins) // Triggers adjustment

      expect(ag.state.samples).toEqual([]) // Cleared after adjustment
      expect(ag.state.currentGain).toBe(25)
    })

    it('should allow multiple rounds of calibration', () => {
      const ag = createAutoGain(10, { samplesNeeded: 2, targetMin: -80, targetMax: -55, step: 5 })

      // First round: too low, increase gain
      ag.feed(new Array(100).fill(-95))
      let result = ag.feed(new Array(100).fill(-95))
      expect(result).toEqual({ action: 'adjusted', oldGain: 10, newGain: 15 })
      expect(ag.state.enabled).toBe(true) // Still enabled for next round

      // Second round: still too low
      ag.feed(new Array(100).fill(-90))
      result = ag.feed(new Array(100).fill(-90))
      expect(result).toEqual({ action: 'adjusted', oldGain: 15, newGain: 20 })

      // Third round: in range now
      ag.feed(new Array(100).fill(-65))
      result = ag.feed(new Array(100).fill(-65))
      expect(result).toEqual({ action: 'in_range', gain: 20 })
      expect(ag.state.enabled).toBe(false)
    })
  })

  describe('enable', () => {
    it('should enable auto-gain and clear samples', () => {
      const ag = createAutoGain(20)
      ag.disable()
      ag.enable()
      expect(ag.state.enabled).toBe(true)
      expect(ag.state.samples).toEqual([])
    })
  })

  describe('disable', () => {
    it('should disable auto-gain and clear samples', () => {
      const ag = createAutoGain(20, { samplesNeeded: 5 })
      ag.feed(new Array(100).fill(-70))
      ag.feed(new Array(100).fill(-70))
      ag.disable()
      expect(ag.state.enabled).toBe(false)
      expect(ag.state.samples).toEqual([])
    })
  })

  describe('setGain', () => {
    it('should set gain and disable auto-gain', () => {
      const ag = createAutoGain(20)
      ag.setGain(35)
      expect(ag.state.currentGain).toBe(35)
      expect(ag.state.enabled).toBe(false)
      expect(ag.state.samples).toEqual([])
    })
  })

  describe('reset', () => {
    it('should re-enable and clear samples', () => {
      const ag = createAutoGain(20, { samplesNeeded: 3 })
      // Feed some samples and disable
      ag.feed(new Array(100).fill(-70))
      ag.disable()

      ag.reset()
      expect(ag.state.enabled).toBe(true)
      expect(ag.state.samples).toEqual([])
    })

    it('should preserve current gain', () => {
      const ag = createAutoGain(20, { samplesNeeded: 2, step: 5, targetMin: -80 })
      // Adjust gain
      ag.feed(new Array(100).fill(-95))
      ag.feed(new Array(100).fill(-95))
      expect(ag.state.currentGain).toBe(25)

      ag.reset()
      expect(ag.state.currentGain).toBe(25) // Gain preserved
    })
  })
})
