/**
 * SDR Provider Factory
 *
 * Returns the appropriate SDR provider based on SERVICE_MODE configuration.
 */

import type { ReceiverConfig } from '@backend/types'
import { getRemoteSDRProvider } from '../sdr-client'
import { logger } from '../utils/logger'
import { getLocalSDRProvider } from './local-sdr-provider'
import type { ISDRProvider } from './sdr-interfaces'

let currentProvider: ISDRProvider | null = null

/**
 * Get the SDR provider based on configuration
 */
export function getSDRProvider(config: ReceiverConfig): ISDRProvider {
  if (currentProvider) {
    return currentProvider
  }

  const mode = config.serviceMode

  switch (mode) {
    case 'full':
    case 'sdr-relay':
      // Use local SDR directly
      logger.info('Using local SDR provider')
      currentProvider = getLocalSDRProvider()
      break

    case 'server':
      // Connect to remote SDR relay
      if (!config.sdrRelay.url) {
        throw new Error('SDR_RELAY_URL must be set when SERVICE_MODE=server')
      }
      logger.info(`Using remote SDR provider at ${config.sdrRelay.url}`)
      currentProvider = getRemoteSDRProvider(config.sdrRelay.url, config.recording.recordingsDir)
      break

    default:
      throw new Error(`Unknown service mode: ${mode}`)
  }

  return currentProvider
}

/**
 * Reset the SDR provider (useful for testing or reconfiguration)
 */
export function resetSDRProvider(): void {
  currentProvider = null
}
