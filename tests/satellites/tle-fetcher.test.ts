import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { TEST_SATELLITE } from '../fixtures'

// Store original fetch
const originalFetch = globalThis.fetch

describe('TLE fetcher', () => {
  let mockFetch: ReturnType<typeof mock>

  beforeEach(() => {
    // Create a mock fetch function
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(''),
      } as Response)
    )
    globalThis.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch
  })

  // Import after mock setup to ensure mocks are in place
  const getTleFunctions = async () => {
    // Dynamic import to get fresh module with mocked fetch
    const { fetchTle, fetchAllTles } = await import('@backend/satellites/tle')
    return { fetchTle, fetchAllTles }
  }

  describe('fetchTle', () => {
    it('should fetch TLE for satellite', async () => {
      const tleResponse = `NOAA 19
1 33591U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990
2 33591  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708`

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(tleResponse),
        } as Response)
      )

      const { fetchTle } = await getTleFunctions()
      const tle = await fetchTle(TEST_SATELLITE)

      expect(tle).not.toBeNull()
      expect(tle?.name).toBe('NOAA 19')
      expect(tle?.line1).toMatch(/^1 33591U/)
      expect(tle?.line2).toMatch(/^2 33591/)
    })

    it('should handle two-line format (no name line)', async () => {
      const tleResponse = `1 33591U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990
2 33591  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708`

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(tleResponse),
        } as Response)
      )

      const { fetchTle } = await getTleFunctions()
      const tle = await fetchTle(TEST_SATELLITE)

      expect(tle).not.toBeNull()
      expect(tle?.name).toBe(TEST_SATELLITE.name)
    })

    it('should return null on fetch failure', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          statusText: 'Not Found',
        } as Response)
      )

      const { fetchTle } = await getTleFunctions()
      const tle = await fetchTle(TEST_SATELLITE)

      expect(tle).toBeNull()
    })

    it('should return null on network error', async () => {
      mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')))

      const { fetchTle } = await getTleFunctions()
      const tle = await fetchTle(TEST_SATELLITE)

      expect(tle).toBeNull()
    })

    it('should use correct CelesTrak API URL', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve(''),
        } as Response)
      )

      const { fetchTle } = await getTleFunctions()
      await fetchTle(TEST_SATELLITE)

      expect(mockFetch).toHaveBeenCalled()
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string
      expect(calledUrl).toContain(`CATNR=${TEST_SATELLITE.noradId}`)
      expect(calledUrl).toContain('FORMAT=TLE')
    })
  })

  describe('fetchAllTles', () => {
    it('should fetch TLEs for all satellites', async () => {
      const satellites = [
        { ...TEST_SATELLITE, name: 'SAT 1', noradId: 11111 },
        { ...TEST_SATELLITE, name: 'SAT 2', noradId: 22222 },
      ]

      let callCount = 0
      mockFetch.mockImplementation(() => {
        callCount++
        const tleData =
          callCount === 1
            ? `SAT 1
1 11111U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990
2 11111  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708`
            : `SAT 2
1 22222U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990
2 22222  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708`

        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(tleData),
        } as Response)
      })

      const { fetchAllTles } = await getTleFunctions()
      const tles = await fetchAllTles(satellites)

      expect(tles).toHaveLength(2)
      expect(tles[0]?.name).toBe('SAT 1')
      expect(tles[1]?.name).toBe('SAT 2')
    })

    it('should filter out failed fetches', async () => {
      const satellites = [
        { ...TEST_SATELLITE, name: 'SAT 1', noradId: 11111 },
        { ...TEST_SATELLITE, name: 'SAT 2', noradId: 22222 },
      ]

      let callCount = 0
      mockFetch.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            text: () =>
              Promise.resolve(`SAT 1
1 11111U 09005A   25085.56541919  .00000082  00000+0  69653-4 0  9990
2 11111  99.1870 136.4258 0014198 103.3588 256.9118 14.12499278770708`),
          } as Response)
        }
        return Promise.resolve({
          ok: false,
          statusText: 'Not Found',
        } as Response)
      })

      const { fetchAllTles } = await getTleFunctions()
      const tles = await fetchAllTles(satellites)

      expect(tles).toHaveLength(1)
      expect(tles[0]?.name).toBe('SAT 1')
    })

    it('should return empty array when all fetches fail', async () => {
      const satellites = [TEST_SATELLITE]

      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          statusText: 'Not Found',
        } as Response)
      )

      const { fetchAllTles } = await getTleFunctions()
      const tles = await fetchAllTles(satellites)

      expect(tles).toEqual([])
    })
  })
})
