import { TEST_STATION } from '@/test-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@backend/prediction/ground-track', () => ({
  computeGroundTrack: vi.fn(() => ({
    noradId: 33591,
    name: 'NOAA 19',
    signalType: 'apt',
    points: [{ lat: 45, lng: -120 }],
  })),
}))

vi.mock('@backend/prediction/orbit', () => ({
  getSatelliteGeolocation: vi.fn(() => ({
    latitude: 45.5,
    longitude: -120.5,
    altitude: 850,
    name: 'NOAA 19',
    noradId: 33591,
    signalType: 'apt',
  })),
}))

vi.mock('@backend/satellites/constants', () => ({
  SATELLITES: [
    {
      name: 'NOAA 19',
      noradId: 33591,
      frequency: 137.1e6,
      signalType: 'apt',
      enabled: true,
    },
  ],
}))

vi.mock('@backend/satellites/tle', () => ({
  getTles: vi.fn(() =>
    Promise.resolve([
      {
        name: 'NOAA 19',
        line1: '1 33591U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990',
        line2: '2 33591  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708',
      },
    ])
  ),
}))

vi.mock('@backend/state/state-manager', () => ({
  stateManager: {
    emitGlobeState: vi.fn(),
  },
}))

import { computeGroundTrack } from '@backend/prediction/ground-track'
import { getTles } from '@backend/satellites/tle'
import { stateManager } from '@backend/state/state-manager'
import type { Mock } from 'vitest'
import { getGlobeState, startGlobeService, stopGlobeService } from './globe-service'

// Type assertions for mocked functions
const mockComputeGroundTrack = computeGroundTrack as unknown as Mock
const mockEmitGlobeState = stateManager.emitGlobeState as unknown as Mock

describe('globe-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    stopGlobeService()
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  describe('getGlobeState', () => {
    it('should return null before service is started', () => {
      const state = getGlobeState()
      expect(state).toBeNull()
    })

    it('should return globe state after service is started', async () => {
      await startGlobeService(TEST_STATION)

      const state = getGlobeState()

      expect(state).not.toBeNull()
      expect(state?.station).toEqual({
        latitude: TEST_STATION.latitude,
        longitude: TEST_STATION.longitude,
      })
    })

    it('should include satellite positions', async () => {
      await startGlobeService(TEST_STATION)

      const state = getGlobeState()

      expect(state?.satellites).toHaveLength(1)
      expect(state?.satellites[0]?.name).toBe('NOAA 19')
    })

    it('should include ground tracks', async () => {
      await startGlobeService(TEST_STATION)

      const state = getGlobeState()

      expect(state?.groundTracks).toHaveLength(1)
      expect(state?.groundTracks[0]?.name).toBe('NOAA 19')
    })
  })

  describe('startGlobeService', () => {
    it('should fetch TLEs on start', async () => {
      await startGlobeService(TEST_STATION)

      expect(getTles).toHaveBeenCalled()
    })

    it('should compute ground tracks on start', async () => {
      await startGlobeService(TEST_STATION)

      expect(computeGroundTrack).toHaveBeenCalled()
    })

    it('should broadcast initial state', async () => {
      await startGlobeService(TEST_STATION)

      expect(stateManager.emitGlobeState).toHaveBeenCalledWith(
        expect.objectContaining({
          station: {
            latitude: TEST_STATION.latitude,
            longitude: TEST_STATION.longitude,
          },
        })
      )
    })

    it('should set up position update interval', async () => {
      await startGlobeService(TEST_STATION)

      mockEmitGlobeState.mockClear()

      vi.advanceTimersByTime(3000)

      expect(stateManager.emitGlobeState).toHaveBeenCalled()
    })

    it('should set up ground track update interval', async () => {
      await startGlobeService(TEST_STATION)

      mockComputeGroundTrack.mockClear()

      vi.advanceTimersByTime(60_000)

      expect(computeGroundTrack).toHaveBeenCalled()
    })
  })

  describe('stopGlobeService', () => {
    it('should stop position updates', async () => {
      await startGlobeService(TEST_STATION)

      stopGlobeService()

      mockEmitGlobeState.mockClear()
      vi.advanceTimersByTime(10_000)

      expect(stateManager.emitGlobeState).not.toHaveBeenCalled()
    })

    it('should stop ground track updates', async () => {
      await startGlobeService(TEST_STATION)

      stopGlobeService()

      mockComputeGroundTrack.mockClear()
      vi.advanceTimersByTime(120_000)

      expect(computeGroundTrack).not.toHaveBeenCalled()
    })

    it('should be safe to call multiple times', () => {
      expect(() => {
        stopGlobeService()
        stopGlobeService()
      }).not.toThrow()
    })
  })
})
