import { createTestPosition } from '@/test-fixtures'
import {
  calculateDopplerShift,
  calculateRadialVelocity,
  formatDopplerShift,
  formatFrequency,
} from '@backend/prediction/doppler'
import type { SatellitePosition } from '@backend/types'
import { describe, expect, it } from 'vitest'

describe('doppler calculations', () => {
  describe('calculateRadialVelocity', () => {
    it('should return 0 when no prev or next position', () => {
      const pos = createTestPosition()
      expect(calculateRadialVelocity(undefined, pos, undefined)).toBe(0)
    })

    it('should calculate positive velocity when range increasing (moving away)', () => {
      const current = createTestPosition({ rangeSat: 1000 })
      const next = createTestPosition({
        rangeSat: 1010,
        timestamp: new Date('2024-01-01T12:00:01Z'),
      })
      const velocity = calculateRadialVelocity(undefined, current, next)
      expect(velocity).toBeGreaterThan(0)
      expect(velocity).toBeCloseTo(10000, 0)
    })

    it('should calculate negative velocity when range decreasing (approaching)', () => {
      const current = createTestPosition({ rangeSat: 1010 })
      const next = createTestPosition({
        rangeSat: 1000,
        timestamp: new Date('2024-01-01T12:00:01Z'),
      })
      const velocity = calculateRadialVelocity(undefined, current, next)
      expect(velocity).toBeLessThan(0)
      expect(velocity).toBeCloseTo(-10000, 0)
    })

    it('should use backward difference when no next position', () => {
      const prev = createTestPosition({ rangeSat: 1000 })
      const current = createTestPosition({
        rangeSat: 1010,
        timestamp: new Date('2024-01-01T12:00:01Z'),
      })
      const velocity = calculateRadialVelocity(prev, current, undefined)
      expect(velocity).toBeGreaterThan(0)
      expect(velocity).toBeCloseTo(10000, 0)
    })
  })

  describe('calculateDopplerShift', () => {
    it('should return empty data for empty positions', () => {
      const result = calculateDopplerShift(137e6, [])
      expect(result.points).toHaveLength(0)
      expect(result.maxShift).toBe(0)
      expect(result.minShift).toBe(0)
    })

    it('should calculate doppler shift for satellite pass', () => {
      const positions: SatellitePosition[] = [
        createTestPosition({
          azimuth: 90,
          elevation: 10,
          rangeSat: 2000,
          timestamp: new Date('2024-01-01T12:00:00Z'),
        }),
        createTestPosition({
          azimuth: 135,
          elevation: 45,
          rangeSat: 1500,
          timestamp: new Date('2024-01-01T12:02:00Z'),
        }),
        createTestPosition({
          azimuth: 180,
          elevation: 60,
          rangeSat: 1200,
          timestamp: new Date('2024-01-01T12:04:00Z'),
        }),
        createTestPosition({
          azimuth: 225,
          elevation: 45,
          rangeSat: 1500,
          timestamp: new Date('2024-01-01T12:06:00Z'),
        }),
        createTestPosition({
          azimuth: 270,
          elevation: 10,
          rangeSat: 2000,
          timestamp: new Date('2024-01-01T12:08:00Z'),
        }),
      ]

      const result = calculateDopplerShift(137e6, positions)

      expect(result.points).toHaveLength(5)
      expect(result.maxShift).toBeGreaterThan(0)
      expect(result.minShift).toBeLessThan(0)
    })

    it('should have positive shift when satellite approaching (positive Doppler)', () => {
      const positions: SatellitePosition[] = [
        createTestPosition({
          azimuth: 90,
          elevation: 10,
          rangeSat: 2000,
          timestamp: new Date('2024-01-01T12:00:00Z'),
        }),
        createTestPosition({
          azimuth: 135,
          elevation: 45,
          rangeSat: 1500,
          timestamp: new Date('2024-01-01T12:02:00Z'),
        }),
      ]

      const result = calculateDopplerShift(137e6, positions)
      expect(result.points[0]?.shift).toBeGreaterThan(0)
    })
  })

  describe('formatFrequency', () => {
    it('should format GHz frequencies', () => {
      expect(formatFrequency(1.5e9)).toBe('1.500000 GHz')
    })

    it('should format MHz frequencies', () => {
      expect(formatFrequency(137.6125e6)).toBe('137.6125 MHz')
      expect(formatFrequency(145.8e6)).toBe('145.8000 MHz')
    })

    it('should format kHz frequencies', () => {
      expect(formatFrequency(50000)).toBe('50.00 kHz')
    })

    it('should format Hz frequencies', () => {
      expect(formatFrequency(500)).toBe('500 Hz')
    })
  })

  describe('formatDopplerShift', () => {
    it('should format positive shifts with + sign', () => {
      expect(formatDopplerShift(3500)).toBe('+3.50 kHz')
      expect(formatDopplerShift(500)).toBe('+500 Hz')
    })

    it('should format negative shifts', () => {
      expect(formatDopplerShift(-3500)).toBe('-3.50 kHz')
      expect(formatDopplerShift(-500)).toBe('-500 Hz')
    })

    it('should format zero as positive', () => {
      expect(formatDopplerShift(0)).toBe('+0 Hz')
    })
  })
})
