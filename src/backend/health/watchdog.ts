import { stopFFTStream } from '../capture/fft-stream'
import { logger } from '../utils/logger'
import { runCommand } from '../utils/shell'

interface HealthStatus {
  sdrAccessible: boolean
  fftStreamHealthy: boolean
  lastCheck: Date
  consecutiveFailures: number
}

const health: HealthStatus = {
  sdrAccessible: true,
  fftStreamHealthy: true,
  lastCheck: new Date(),
  consecutiveFailures: 0,
}

const MAX_CONSECUTIVE_FAILURES = 3
const CHECK_INTERVAL_MS = 30000 // 30 seconds

/**
 * Check if RTL-SDR device is accessible
 * Returns true if device responds, false if busy/locked
 */
async function checkSdrHealth(): Promise<boolean> {
  try {
    // Quick test - just enumerate devices (doesn't claim interface)
    // Use timeout command to limit execution to 5 seconds
    const result = await runCommand('timeout', ['5', 'rtl_test', '-t'])

    // If we see "usb_claim_interface error" or the command fails, SDR is locked
    if (result.exitCode !== 0 || result.stderr?.includes('usb_claim_interface')) {
      return false
    }

    // Check for "Found 1 device(s)" in output
    return result.stdout?.includes('Found') ?? false
  } catch {
    return false
  }
}

/**
 * Attempt to recover from SDR lock
 * Kills any stray rtl_* processes and resets USB device
 */
async function recoverSdr(): Promise<boolean> {
  logger.warn('Attempting SDR recovery...')

  try {
    // Kill any stray rtl_* processes (ignore errors if process doesn't exist)
    await runCommand('pkill', ['-9', 'rtl_fm']).catch(() => {})
    await runCommand('pkill', ['-9', 'rtl_sdr']).catch(() => {})
    await runCommand('pkill', ['-9', 'rtl_power']).catch(() => {})

    // Stop FFT stream to release SDR
    await stopFFTStream()

    // Give USB subsystem time to reset
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Verify recovery
    const recovered = await checkSdrHealth()
    if (recovered) {
      logger.info('SDR recovery successful')
      return true
    }

    logger.error('SDR recovery failed - manual intervention may be required')
    return false
  } catch (error) {
    logger.error(`SDR recovery error: ${error}`)
    return false
  }
}

/**
 * Health check routine
 * Runs periodically to detect and recover from SDR issues
 */
async function healthCheck(): Promise<void> {
  const sdrOk = await checkSdrHealth()

  health.sdrAccessible = sdrOk
  health.fftStreamHealthy = sdrOk // For now, FFT health = SDR health
  health.lastCheck = new Date()

  if (!sdrOk) {
    health.consecutiveFailures++
    logger.warn(`SDR health check failed (${health.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`)

    // Attempt recovery after multiple failures
    if (health.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      const recovered = await recoverSdr()
      if (recovered) {
        health.consecutiveFailures = 0
      }
    }
  } else {
    // Reset failure counter on success
    if (health.consecutiveFailures > 0) {
      logger.info('SDR health restored')
      health.consecutiveFailures = 0
    }
  }
}

/**
 * Start the health monitoring watchdog
 * Runs periodic checks and auto-recovery
 */
export function startWatchdog(): void {
  logger.info('Starting health watchdog...')

  // Initial check
  healthCheck()

  // Periodic checks
  setInterval(healthCheck, CHECK_INTERVAL_MS)

  logger.info(`Watchdog monitoring every ${CHECK_INTERVAL_MS / 1000}s`)
}

/**
 * Get current health status
 */
export function getHealthStatus(): HealthStatus {
  return { ...health }
}
