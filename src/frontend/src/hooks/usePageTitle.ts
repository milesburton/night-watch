import type { SystemStatus } from '@/types'
import { useEffect } from 'react'

/**
 * Dynamic page title that changes based on system status
 */
export function usePageTitle(status: SystemStatus, satelliteName?: string) {
  useEffect(() => {
    let title: string

    switch (status) {
      case 'recording':
        title = satelliteName
          ? `🛰️ Recording ${satelliteName} - Night Watch`
          : '🛰️ Recording - Night Watch'
        break
      case 'decoding':
        title = satelliteName
          ? `🔄 Decoding ${satelliteName} - Night Watch`
          : '🔄 Decoding - Night Watch'
        break
      case 'scanning':
        title = '📡 Scanning SSTV - Night Watch'
        break
      case 'waiting':
        title = satelliteName
          ? `⏳ Waiting for ${satelliteName} - Night Watch`
          : '⏳ Waiting - Night Watch'
        break
      default:
        title = 'Night Watch - Satellite Signal Capture Station'
        break
    }

    document.title = title
  }, [status, satelliteName])
}
