/**
 * Local SDR Provider
 *
 * Implements ISDRProvider using local rtl_* commands.
 * This is the default implementation when running in 'full' or 'sdr-relay' mode.
 */

import type { ReceiverConfig, SatelliteInfo } from '@backend/types'
import { logger } from '../utils/logger'
import { runCommand } from '../utils/shell'
import {
  type FFTStreamConfig,
  getFFTStreamConfig,
  isFFTStreamRunning,
  startFFTStream,
  stopFFTStream,
  updateFFTFrequency,
} from './fft-stream'
import { recordPass } from './recorder'
import type {
  FFTCallback,
  IFFTStream,
  IRecorder,
  ISDRProvider,
  ISignalChecker,
  RecordingProgressCallback,
  SDRStatus,
  SignalMeasurement,
} from './sdr-interfaces'
import {
  type SignalStrength,
  checkSignalStrength,
  verifySignal,
  verifySignalAtFrequency,
} from './signal'

/**
 * Local FFT stream implementation
 */
class LocalFFTStream implements IFFTStream {
  start(config: FFTStreamConfig, callback: FFTCallback): boolean {
    return startFFTStream(config, callback)
  }

  stop(): void {
    stopFFTStream()
  }

  isRunning(): boolean {
    return isFFTStreamRunning()
  }

  getConfig(): FFTStreamConfig | null {
    return getFFTStreamConfig()
  }

  updateFrequency(frequency: number): boolean {
    return updateFFTFrequency(frequency)
  }
}

/**
 * Local recorder implementation
 */
class LocalRecorder implements IRecorder {
  async recordPass(
    satellite: SatelliteInfo,
    durationSeconds: number,
    config: ReceiverConfig,
    onProgress?: RecordingProgressCallback
  ): Promise<string> {
    return recordPass(satellite, durationSeconds, config, onProgress)
  }
}

/**
 * Local signal checker implementation
 */
class LocalSignalChecker implements ISignalChecker {
  async checkSignalStrength(
    satellite: SatelliteInfo,
    gain: number
  ): Promise<SignalMeasurement | null> {
    const result = await checkSignalStrength(satellite, gain)
    return result
  }

  async verifySignal(
    satellite: SatelliteInfo,
    gain: number,
    minStrength: number,
    attempts = 3
  ): Promise<boolean> {
    return verifySignal(satellite, gain, minStrength, attempts)
  }

  async verifySignalAtFrequency(
    frequency: number,
    gain: number,
    minStrength: number
  ): Promise<boolean> {
    return verifySignalAtFrequency(frequency, gain, minStrength)
  }
}

/**
 * Local SDR provider - uses direct rtl_* commands
 */
export class LocalSDRProvider implements ISDRProvider {
  readonly fft: IFFTStream
  readonly recorder: IRecorder
  readonly signal: ISignalChecker

  private currentMode: 'idle' | 'fft' | 'recording' = 'idle'

  constructor() {
    this.fft = new LocalFFTStream()
    this.recorder = new LocalRecorder()
    this.signal = new LocalSignalChecker()
  }

  async getStatus(): Promise<SDRStatus> {
    // Check if rtl_test can find a device
    try {
      const result = await runCommand('rtl_test', ['-t'])
      const connected = result.exitCode === 0 || result.stderr.includes('Found')

      // Extract device info from stderr
      const deviceMatch = result.stderr.match(/Using device \d+: (.+)/)
      const device = deviceMatch ? deviceMatch[1] : undefined

      // Determine current mode
      let mode: 'idle' | 'fft' | 'recording' = 'idle'
      if (this.fft.isRunning()) {
        mode = 'fft'
      }
      // Note: recording mode would be set by the recorder during active recording

      return {
        connected,
        device,
        mode,
      }
    } catch (error) {
      logger.debug(`SDR status check failed: ${error}`)
      return {
        connected: false,
        mode: 'idle',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    const status = await this.getStatus()
    return status.connected
  }
}

// Singleton instance for local SDR provider
let localProvider: LocalSDRProvider | null = null

/**
 * Get the local SDR provider singleton
 */
export function getLocalSDRProvider(): LocalSDRProvider {
  if (!localProvider) {
    localProvider = new LocalSDRProvider()
  }
  return localProvider
}
