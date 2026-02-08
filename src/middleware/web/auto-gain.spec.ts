import { classifyBand, createAutoGain, createBandGainStore } from '@middleware/web/auto-gain'
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

describe('classifyBand', () => {
  it('should classify 137 MHz weather satellite frequencies as noaa band', () => {
    expect(classifyBand(137.1e6)).toBe('noaa')
    expect(classifyBand(137.6125e6)).toBe('noaa')
    expect(classifyBand(137.9125e6)).toBe('noaa')
  })

  it('should classify 2m frequencies as 2m band', () => {
    expect(classifyBand(144.5e6)).toBe('2m')
    expect(classifyBand(145.5e6)).toBe('2m')
    expect(classifyBand(145.8e6)).toBe('2m')
  })

  it('should return unknown for out-of-range frequencies', () => {
    expect(classifyBand(100e6)).toBe('unknown')
    expect(classifyBand(433e6)).toBe('unknown')
    expect(classifyBand(0)).toBe('unknown')
  })

  it('should handle band boundaries inclusively', () => {
    expect(classifyBand(136e6)).toBe('noaa')
    expect(classifyBand(138e6)).toBe('noaa')
    expect(classifyBand(144e6)).toBe('2m')
    expect(classifyBand(146e6)).toBe('2m')
  })

  it('should return unknown for frequencies between bands', () => {
    expect(classifyBand(140e6)).toBe('unknown')
    expect(classifyBand(143e6)).toBe('unknown')
  })
})

describe('createBandGainStore', () => {
  it('should return undefined for unknown bands', () => {
    const store = createBandGainStore()
    expect(store.get('noaa')).toBeUndefined()
    expect(store.get('2m')).toBeUndefined()
  })

  it('should store and retrieve band gains', () => {
    const store = createBandGainStore()
    store.set('noaa', 25, true)
    expect(store.get('noaa')).toEqual({ band: 'noaa', gain: 25, calibrated: true })
  })

  it('should default calibrated to true', () => {
    const store = createBandGainStore()
    store.set('2m', 30)
    expect(store.get('2m')?.calibrated).toBe(true)
  })

  it('should store uncalibrated state', () => {
    const store = createBandGainStore()
    store.set('noaa', 20, false)
    expect(store.get('noaa')?.calibrated).toBe(false)
  })

  it('should overwrite existing band gain', () => {
    const store = createBandGainStore()
    store.set('noaa', 20)
    store.set('noaa', 30)
    expect(store.get('noaa')?.gain).toBe(30)
  })

  describe('getForFrequency', () => {
    it('should indicate calibration needed for uncalibrated band', () => {
      const store = createBandGainStore()
      const result = store.getForFrequency(137.5e6, 20)
      expect(result).toEqual({ band: 'noaa', gain: 20, needsCalibration: true })
    })

    it('should return stored gain when band is calibrated', () => {
      const store = createBandGainStore()
      store.set('noaa', 30, true)
      const result = store.getForFrequency(137.1e6, 20)
      expect(result).toEqual({ band: 'noaa', gain: 30, needsCalibration: false })
    })

    it('should classify frequency and look up correct band', () => {
      const store = createBandGainStore()
      store.set('noaa', 25)
      store.set('2m', 35)
      expect(store.getForFrequency(137.5e6, 20).gain).toBe(25)
      expect(store.getForFrequency(145.8e6, 20).gain).toBe(35)
    })

    it('should use default gain for unknown band', () => {
      const store = createBandGainStore()
      const result = store.getForFrequency(433e6, 15)
      expect(result).toEqual({ band: 'unknown', gain: 15, needsCalibration: true })
    })

    it('should return uncalibrated gain without needsCalibration flag', () => {
      const store = createBandGainStore()
      store.set('noaa', 22, false) // Intermediate, not fully calibrated
      const result = store.getForFrequency(137.5e6, 20)
      expect(result).toEqual({ band: 'noaa', gain: 22, needsCalibration: false })
    })
  })

  it('should track bands independently', () => {
    const store = createBandGainStore()
    store.set('noaa', 25)
    store.set('2m', 35)
    expect(store.get('noaa')?.gain).toBe(25)
    expect(store.get('2m')?.gain).toBe(35)
  })

  it('should clear a specific band', () => {
    const store = createBandGainStore()
    store.set('noaa', 25)
    store.set('2m', 35)
    store.clear('noaa')
    expect(store.get('noaa')).toBeUndefined()
    expect(store.get('2m')).toBeDefined()
  })

  it('should clear all bands', () => {
    const store = createBandGainStore()
    store.set('noaa', 25)
    store.set('2m', 35)
    store.clearAll()
    expect(store.getAll()).toEqual([])
  })

  it('should list all stored gains', () => {
    const store = createBandGainStore()
    store.set('noaa', 25)
    store.set('2m', 35)
    const all = store.getAll()
    expect(all).toHaveLength(2)
    expect(all.find((s) => s.band === 'noaa')?.gain).toBe(25)
    expect(all.find((s) => s.band === '2m')?.gain).toBe(35)
  })
})
