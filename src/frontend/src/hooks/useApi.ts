import type { CaptureRecord, CaptureSummary, SstvStatus, StationConfig, VersionInfo } from '@/types'
import { useCallback, useState } from 'react'

export function useApi() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchJson = useCallback(async <T>(url: string): Promise<T | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const postJson = useCallback(async <T>(url: string, data: unknown): Promise<T | null> => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const getCaptures = useCallback(
    async (limit = 20): Promise<CaptureRecord[]> => {
      const result = await fetchJson<CaptureRecord[]>(`/api/captures?limit=${limit}`)
      return result || []
    },
    [fetchJson]
  )

  const getSummary = useCallback(async (): Promise<CaptureSummary | null> => {
    return fetchJson<CaptureSummary>('/api/summary')
  }, [fetchJson])

  const getSstvStatus = useCallback(async (): Promise<SstvStatus | null> => {
    return fetchJson<SstvStatus>('/api/sstv/status')
  }, [fetchJson])

  const toggleSstv = useCallback(
    async (enabled: boolean): Promise<SstvStatus | null> => {
      return postJson<SstvStatus>('/api/sstv/toggle', { enabled })
    },
    [postJson]
  )

  const toggleGroundScan = useCallback(
    async (enabled: boolean): Promise<SstvStatus | null> => {
      return postJson<SstvStatus>('/api/sstv/ground-scan/toggle', { enabled })
    },
    [postJson]
  )

  const getVersion = useCallback(async (): Promise<VersionInfo | null> => {
    return fetchJson<VersionInfo>('/api/version')
  }, [fetchJson])

  const getConfig = useCallback(async (): Promise<StationConfig | null> => {
    return fetchJson<StationConfig>('/api/config')
  }, [fetchJson])

  return {
    loading,
    error,
    getCaptures,
    getSummary,
    getSstvStatus,
    toggleSstv,
    toggleGroundScan,
    getVersion,
    getConfig,
  }
}
