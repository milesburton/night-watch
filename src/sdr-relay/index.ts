/**
 * SDR Relay Entry Point
 *
 * Starts the SDR relay server when SERVICE_MODE=sdr-relay
 */

import { loadConfig } from '../backend/config/config'
import { setLogLevel } from '../backend/utils/logger'
import { startSDRRelayServer } from './server'

export async function startSDRRelay(): Promise<void> {
  const config = loadConfig()
  setLogLevel(config.logLevel)

  const { port, host } = config.sdrRelay
  startSDRRelayServer(port, host)

  // Keep the process running
  await new Promise(() => {})
}

// Allow direct execution
if (import.meta.main) {
  startSDRRelay()
}
