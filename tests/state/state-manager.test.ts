import type { CaptureResult, GlobeState, SatellitePass, StateEvent } from '@backend/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_SATELLITE } from '../fixtures'

// Import after vitest setup mocks the logger
import { StateManager } from '@backend/state/state-manager'

describe('StateManager', () => {
  let stateManager: StateManager

  beforeEach(() => {
    stateManager = new StateManager()
  })

  afterEach(() => {
    stateManager.removeAllListeners()
  })

  describe('initial state', () => {
    it('should start with idle status', () => {
      const state = stateManager.getState()
      expect(state.status).toBe('idle')
    })

    it('should have no current pass', () => {
      const state = stateManager.getState()
      expect(state.currentPass).toBeNull()
    })

    it('should have no upcoming passes', () => {
      const state = stateManager.getState()
      expect(state.upcomingPasses).toEqual([])
    })

    it('should have zero capture progress', () => {
      const state = stateManager.getState()
      expect(state.captureProgress).toBe(0)
      expect(state.captureElapsed).toBe(0)
      expect(state.captureTotal).toBe(0)
    })
  })

  describe('setStatus', () => {
    it('should update status', () => {
      stateManager.setStatus('capturing')
      expect(stateManager.getState().status).toBe('capturing')
    })

    it('should emit status_change event', () => {
      const listener = vi.fn()
      stateManager.on('state', listener)

      stateManager.setStatus('decoding')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status_change',
          status: 'decoding',
        })
      )
    })

    it('should update lastUpdate timestamp', () => {
      const before = new Date()
      stateManager.setStatus('idle')
      const after = new Date()

      const { lastUpdate } = stateManager.getState()
      expect(lastUpdate.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(lastUpdate.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  describe('startPass', () => {
    const mockPass: SatellitePass = {
      satellite: TEST_SATELLITE,
      aos: new Date('2025-01-01T10:00:00Z'),
      los: new Date('2025-01-01T10:15:00Z'),
      maxElevation: 45,
      maxElevationTime: new Date('2025-01-01T10:07:30Z'),
      duration: 900,
    }

    it('should set current pass', () => {
      stateManager.startPass(mockPass)
      expect(stateManager.getState().currentPass).toEqual(mockPass)
    })

    it('should set status to capturing', () => {
      stateManager.startPass(mockPass)
      expect(stateManager.getState().status).toBe('capturing')
    })

    it('should reset capture progress', () => {
      stateManager.updateProgress(50, 30, 60)
      stateManager.startPass(mockPass)

      const state = stateManager.getState()
      expect(state.captureProgress).toBe(0)
      expect(state.captureElapsed).toBe(0)
    })

    it('should set capture total from pass duration', () => {
      stateManager.startPass(mockPass)
      expect(stateManager.getState().captureTotal).toBe(900)
    })

    it('should emit pass_start event', () => {
      const listener = vi.fn()
      stateManager.on('state', listener)

      stateManager.startPass(mockPass)

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'pass_start',
          pass: mockPass,
        })
      )
    })
  })

  describe('updateProgress', () => {
    it('should update progress values', () => {
      stateManager.updateProgress(50, 30, 60)

      const state = stateManager.getState()
      expect(state.captureProgress).toBe(50)
      expect(state.captureElapsed).toBe(30)
      expect(state.captureTotal).toBe(60)
    })

    it('should emit capture_progress event', () => {
      const listener = vi.fn()
      stateManager.on('state', listener)

      stateManager.updateProgress(75, 45, 60)

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'capture_progress',
          progress: 75,
          elapsed: 45,
          total: 60,
        })
      )
    })
  })

  describe('completePass', () => {
    const mockPass: SatellitePass = {
      satellite: TEST_SATELLITE,
      aos: new Date('2025-01-01T10:00:00Z'),
      los: new Date('2025-01-01T10:15:00Z'),
      maxElevation: 45,
      maxElevationTime: new Date('2025-01-01T10:07:30Z'),
      duration: 900,
    }

    const mockResult: CaptureResult = {
      satellite: TEST_SATELLITE,
      startTime: new Date('2025-01-01T10:00:00Z'),
      endTime: new Date('2025-01-01T10:15:00Z'),
      success: true,
      recordingPath: '/recordings/test.wav',
      imagePaths: ['/images/test-chA.png', '/images/test-chB.png'],
      maxSignalStrength: -45,
    }

    beforeEach(() => {
      stateManager.updatePasses([mockPass])
      stateManager.startPass(mockPass)
    })

    it('should clear current pass', () => {
      stateManager.completePass(mockResult)
      expect(stateManager.getState().currentPass).toBeNull()
    })

    it('should set status to idle', () => {
      stateManager.completePass(mockResult)
      expect(stateManager.getState().status).toBe('idle')
    })

    it('should reset capture progress', () => {
      stateManager.updateProgress(100, 900, 900)
      stateManager.completePass(mockResult)

      const state = stateManager.getState()
      expect(state.captureProgress).toBe(0)
      expect(state.captureElapsed).toBe(0)
      expect(state.captureTotal).toBe(0)
    })

    it('should remove completed pass from upcoming passes', () => {
      stateManager.completePass(mockResult)
      expect(stateManager.getState().upcomingPasses).toHaveLength(0)
    })

    it('should emit pass_complete event', () => {
      const listener = vi.fn()
      stateManager.on('state', listener)

      stateManager.completePass(mockResult)

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'pass_complete',
          result: mockResult,
        })
      )
    })
  })

  describe('updatePasses', () => {
    const mockPasses: SatellitePass[] = [
      {
        satellite: TEST_SATELLITE,
        aos: new Date('2025-01-01T10:00:00Z'),
        los: new Date('2025-01-01T10:15:00Z'),
        maxElevation: 45,
        maxElevationTime: new Date('2025-01-01T10:07:30Z'),
        duration: 900,
      },
      {
        satellite: TEST_SATELLITE,
        aos: new Date('2025-01-01T12:00:00Z'),
        los: new Date('2025-01-01T12:10:00Z'),
        maxElevation: 30,
        maxElevationTime: new Date('2025-01-01T12:05:00Z'),
        duration: 600,
      },
    ]

    it('should update upcoming passes', () => {
      stateManager.updatePasses(mockPasses)
      expect(stateManager.getState().upcomingPasses).toEqual(mockPasses)
    })

    it('should set next pass to first pass', () => {
      stateManager.updatePasses(mockPasses)
      expect(stateManager.getState().nextPass).toEqual(mockPasses[0])
    })

    it('should handle empty passes', () => {
      stateManager.updatePasses([])
      expect(stateManager.getState().upcomingPasses).toEqual([])
      expect(stateManager.getState().nextPass).toBeNull()
    })

    it('should emit passes_updated event', () => {
      const listener = vi.fn()
      stateManager.on('state', listener)

      stateManager.updatePasses(mockPasses)

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'passes_updated',
          passes: mockPasses,
        })
      )
    })
  })

  describe('emitGlobeState', () => {
    it('should emit satellite_positions event', () => {
      const mockGlobe: GlobeState = {
        station: { latitude: 51.5, longitude: -0.1 },
        satellites: [],
        groundTracks: [],
      }

      const listener = vi.fn()
      stateManager.on('state', listener)

      stateManager.emitGlobeState(mockGlobe)

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'satellite_positions',
          globe: mockGlobe,
        })
      )
    })
  })

  describe('getState', () => {
    it('should return a copy of state', () => {
      const state1 = stateManager.getState()
      const state2 = stateManager.getState()

      expect(state1).not.toBe(state2)
      expect(state1).toEqual(state2)
    })

    it('should not allow external mutation', () => {
      const state = stateManager.getState()
      state.status = 'capturing'

      expect(stateManager.getState().status).toBe('idle')
    })
  })
})
