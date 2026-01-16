/**
 * SDR Relay API Types
 *
 * Shared types for communication between SDR relay and core server.
 */

import type { FFTData, FFTStreamConfig } from '../backend/capture/fft-stream'

// Re-export for convenience
export type { FFTData, FFTStreamConfig }

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
 * Capture session information
 */
export interface CaptureSession {
  sessionId: string
  frequency: number
  startTime: string
  durationSeconds: number
  status: 'recording' | 'complete' | 'error'
  progress?: number
  outputPath?: string
  error?: string
}

/**
 * Start capture request
 */
export interface StartCaptureRequest {
  frequency: number
  durationSeconds: number
  sampleRate: number
  gain: number
  ppmCorrection?: number
  satelliteName?: string
}

/**
 * Start capture response
 */
export interface StartCaptureResponse {
  sessionId: string
  success: boolean
  error?: string
}

/**
 * Stop capture request
 */
export interface StopCaptureRequest {
  sessionId: string
}

/**
 * Stop capture response
 */
export interface StopCaptureResponse {
  success: boolean
  outputPath?: string
  error?: string
}

/**
 * Signal check request
 */
export interface SignalCheckRequest {
  frequency: number
  bandwidth?: number
  gain: number
}

/**
 * Signal check response
 */
export interface SignalCheckResponse {
  frequency: number
  power: number
  detected: boolean
  timestamp: string
}

/**
 * Tune request
 */
export interface TuneRequest {
  frequency: number
}

/**
 * Tune response
 */
export interface TuneResponse {
  success: boolean
  frequency?: number
  error?: string
}

/**
 * WebSocket message types for FFT streaming
 */
export type FFTWSMessage =
  | { type: 'subscribe'; config: FFTStreamConfig }
  | { type: 'unsubscribe' }
  | { type: 'set_frequency'; frequency: number }
  | { type: 'fft_data'; data: FFTData }
  | { type: 'subscribed'; config: FFTStreamConfig }
  | { type: 'unsubscribed' }
  | { type: 'error'; message: string }

/**
 * Capture progress WebSocket message
 */
export interface CaptureProgressMessage {
  type: 'capture_progress'
  sessionId: string
  elapsed: number
  total: number
  progress: number
}
