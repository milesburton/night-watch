/**
 * SDR Interfaces
 *
 * These interfaces define the contract for SDR operations.
 * They can be implemented locally (direct rtl_* calls) or remotely (via SDR relay).
 */

import type { ReceiverConfig, SatelliteInfo } from '@backend/types'

// Re-export FFTData and FFTStreamConfig from fft-stream for convenience
export type { FFTData, FFTStreamConfig } from './fft-stream'

/**
 * Callback for receiving FFT data
 */
export type FFTCallback = (data: import('./fft-stream').FFTData) => void

/**
 * Interface for FFT streaming operations
 */
export interface IFFTStream {
  /**
   * Start FFT streaming from the SDR
   * @param config FFT configuration (frequency, bandwidth, gain, etc.)
   * @param callback Function to receive FFT data
   * @returns true if started successfully
   */
  start(config: import('./fft-stream').FFTStreamConfig, callback: FFTCallback): boolean

  /**
   * Stop the FFT stream
   */
  stop(): void

  /**
   * Check if FFT stream is currently running
   */
  isRunning(): boolean

  /**
   * Get current FFT stream configuration
   */
  getConfig(): import('./fft-stream').FFTStreamConfig | null

  /**
   * Update FFT frequency (restarts stream with new frequency)
   * @param frequency New center frequency in Hz
   * @returns true if updated successfully
   */
  updateFrequency(frequency: number): boolean
}

/**
 * Result of a recording session
 */
export interface RecordingResult {
  /** Path to the recorded WAV file (may be local or remote depending on implementation) */
  outputPath: string
  /** Satellite that was recorded */
  satellite: SatelliteInfo
  /** When recording started */
  startTime: Date
  /** When recording ended */
  endTime: Date
}

/**
 * Progress callback during recording
 */
export type RecordingProgressCallback = (elapsed: number, total: number, signal?: number) => void

/**
 * Interface for recording operations
 */
export interface IRecorder {
  /**
   * Record a satellite pass
   * @param satellite Satellite info (name, frequency, etc.)
   * @param durationSeconds How long to record
   * @param config Receiver configuration
   * @param onProgress Optional callback for progress updates
   * @returns Path to the recorded WAV file
   */
  recordPass(
    satellite: SatelliteInfo,
    durationSeconds: number,
    config: ReceiverConfig,
    onProgress?: RecordingProgressCallback
  ): Promise<string>
}

/**
 * Signal strength measurement result
 */
export interface SignalMeasurement {
  frequency: number
  power: number
  timestamp: Date
}

/**
 * Interface for signal checking operations
 */
export interface ISignalChecker {
  /**
   * Check signal strength at a satellite's frequency
   * @param satellite Satellite to check
   * @param gain SDR gain setting
   * @returns Signal measurement or null if check failed
   */
  checkSignalStrength(satellite: SatelliteInfo, gain: number): Promise<SignalMeasurement | null>

  /**
   * Verify signal with multiple attempts
   * @param satellite Satellite to verify
   * @param gain SDR gain setting
   * @param minStrength Minimum signal strength threshold
   * @param attempts Number of attempts (default 3)
   * @returns true if signal is strong enough
   */
  verifySignal(
    satellite: SatelliteInfo,
    gain: number,
    minStrength: number,
    attempts?: number
  ): Promise<boolean>

  /**
   * Quick signal check at a specific frequency
   * @param frequency Frequency to check in Hz
   * @param gain SDR gain setting
   * @param minStrength Minimum signal strength threshold
   * @returns true if signal detected above threshold
   */
  verifySignalAtFrequency(frequency: number, gain: number, minStrength: number): Promise<boolean>
}

/**
 * SDR device status
 */
export interface SDRStatus {
  connected: boolean
  device?: string
  mode: 'idle' | 'fft' | 'recording'
  error?: string
}

/**
 * Combined interface for all SDR operations
 * This is the main interface used by the scheduler and web server
 */
export interface ISDRProvider {
  /** FFT streaming operations */
  fft: IFFTStream

  /** Recording operations */
  recorder: IRecorder

  /** Signal checking operations */
  signal: ISignalChecker

  /**
   * Get SDR device status
   */
  getStatus(): Promise<SDRStatus>

  /**
   * Check if SDR is available and connected
   */
  isAvailable(): Promise<boolean>
}
