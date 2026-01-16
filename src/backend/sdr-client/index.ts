/**
 * Remote SDR Client
 *
 * Implements ISDRProvider by connecting to a remote SDR relay server.
 * Used when SERVICE_MODE=server.
 */

import { join } from 'node:path'
import type { ReceiverConfig, SatelliteInfo } from '@backend/types'
import type {
  CaptureSession,
  FFTWSMessage,
  SDRStatus as RelaySDRStatus,
  SignalCheckRequest,
  SignalCheckResponse,
  StartCaptureRequest,
  StartCaptureResponse,
  StopCaptureResponse,
} from '../../sdr-relay/types'
import type {
  FFTCallback,
  FFTStreamConfig,
  IFFTStream,
  IRecorder,
  ISDRProvider,
  ISignalChecker,
  RecordingProgressCallback,
  SDRStatus,
  SignalMeasurement,
} from '../capture/sdr-interfaces'
import { ensureDir } from '../utils/fs'
import { logger } from '../utils/logger'

/**
 * Remote FFT stream implementation
 */
class RemoteFFTStream implements IFFTStream {
  private ws: WebSocket | null = null
  private callback: FFTCallback | null = null
  private currentConfig: FFTStreamConfig | null = null
  private running = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectTimeout: Timer | null = null

  constructor(private relayUrl: string) {}

  start(config: FFTStreamConfig, callback: FFTCallback): boolean {
    this.callback = callback
    this.currentConfig = config
    return this.connect(config)
  }

  private connect(config: FFTStreamConfig): boolean {
    try {
      // Convert HTTP URL to WebSocket URL
      const wsUrl = `${this.relayUrl.replace(/^http/, 'ws')}/sdr/fft`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        logger.info('Connected to SDR relay FFT stream')
        this.reconnectAttempts = 0
        this.running = true

        // Subscribe with config
        const message: FFTWSMessage = { type: 'subscribe', config }
        this.ws?.send(JSON.stringify(message))
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as FFTWSMessage
          if (message.type === 'fft_data' && this.callback) {
            this.callback(message.data)
          } else if (message.type === 'error') {
            logger.error(`FFT stream error: ${message.message}`)
          }
        } catch (error) {
          logger.debug(`Failed to parse FFT message: ${error}`)
        }
      }

      this.ws.onclose = () => {
        logger.debug('FFT WebSocket closed')
        this.running = false

        // Attempt reconnection if we have a callback (meaning we want to stay connected)
        if (this.callback && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000)
          logger.info(
            `Reconnecting to FFT stream in ${delay}ms (attempt ${this.reconnectAttempts})`
          )
          this.reconnectTimeout = setTimeout(() => {
            if (this.currentConfig) {
              this.connect(this.currentConfig)
            }
          }, delay)
        }
      }

      this.ws.onerror = (error) => {
        logger.error(`FFT WebSocket error: ${error}`)
      }

      return true
    } catch (error) {
      logger.error(`Failed to connect to FFT stream: ${error}`)
      return false
    }
  }

  stop(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      // Send unsubscribe message
      try {
        const message: FFTWSMessage = { type: 'unsubscribe' }
        this.ws.send(JSON.stringify(message))
      } catch {
        // Ignore send errors during close
      }

      this.ws.close()
      this.ws = null
    }

    this.callback = null
    this.currentConfig = null
    this.running = false
  }

  isRunning(): boolean {
    return this.running && this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  getConfig(): FFTStreamConfig | null {
    return this.currentConfig
  }

  updateFrequency(frequency: number): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      const message: FFTWSMessage = { type: 'set_frequency', frequency }
      this.ws.send(JSON.stringify(message))

      if (this.currentConfig) {
        this.currentConfig = { ...this.currentConfig, frequency }
      }
      return true
    } catch {
      return false
    }
  }
}

/**
 * Remote recorder implementation
 */
class RemoteRecorder implements IRecorder {
  constructor(
    private relayUrl: string,
    private localRecordingsDir: string
  ) {}

  async recordPass(
    satellite: SatelliteInfo,
    durationSeconds: number,
    config: ReceiverConfig,
    onProgress?: RecordingProgressCallback
  ): Promise<string> {
    // Start capture on relay
    const startRequest: StartCaptureRequest = {
      frequency: satellite.frequency,
      durationSeconds,
      sampleRate: config.sdr.sampleRate,
      gain: config.sdr.gain,
      ppmCorrection: config.sdr.ppmCorrection,
      satelliteName: satellite.name,
    }

    const startResponse = await fetch(`${this.relayUrl}/sdr/capture/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(startRequest),
    })

    if (!startResponse.ok) {
      const error = (await startResponse.json()) as { error?: string }
      throw new Error(error.error || 'Failed to start capture')
    }

    const { sessionId } = (await startResponse.json()) as StartCaptureResponse

    if (!sessionId) {
      throw new Error('No session ID returned from capture start')
    }

    logger.info(`Remote capture started: ${sessionId}`)

    // Poll for progress
    const startTime = Date.now()
    const endTime = startTime + durationSeconds * 1000

    while (Date.now() < endTime) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      onProgress?.(elapsed, durationSeconds)

      // Check session status
      const statusResponse = await fetch(`${this.relayUrl}/sdr/capture/${sessionId}`)
      if (statusResponse.ok) {
        const session = (await statusResponse.json()) as CaptureSession
        if (session.status === 'complete') {
          break
        }
        if (session.status === 'error') {
          throw new Error(session.error || 'Capture failed')
        }
      }

      await Bun.sleep(1000)
    }

    // Wait a bit for the recording to finish
    await Bun.sleep(2000)

    // Download the WAV file
    logger.info('Downloading recording from relay...')

    const audioResponse = await fetch(`${this.relayUrl}/sdr/capture/${sessionId}/audio`)
    if (!audioResponse.ok) {
      throw new Error('Failed to download recording')
    }

    // Save to local recordings directory
    await ensureDir(this.localRecordingsDir)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${satellite.name.replace(/\s+/g, '_')}_${timestamp}.wav`
    const localPath = join(this.localRecordingsDir, filename)

    const audioBuffer = await audioResponse.arrayBuffer()
    await Bun.write(localPath, audioBuffer)

    logger.info(`Recording saved: ${localPath}`)
    return localPath
  }
}

/**
 * Remote signal checker implementation
 */
class RemoteSignalChecker implements ISignalChecker {
  constructor(private relayUrl: string) {}

  async checkSignalStrength(
    satellite: SatelliteInfo,
    gain: number
  ): Promise<SignalMeasurement | null> {
    try {
      const request: SignalCheckRequest = {
        frequency: satellite.frequency,
        gain,
      }

      const response = await fetch(`${this.relayUrl}/sdr/signal/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as SignalCheckResponse
      return {
        frequency: data.frequency,
        power: data.power,
        timestamp: new Date(data.timestamp),
      }
    } catch (error) {
      logger.error(`Remote signal check failed: ${error}`)
      return null
    }
  }

  async verifySignal(
    satellite: SatelliteInfo,
    gain: number,
    minStrength: number,
    attempts = 3
  ): Promise<boolean> {
    let successCount = 0

    for (let i = 0; i < attempts; i++) {
      const measurement = await this.checkSignalStrength(satellite, gain)
      if (measurement && measurement.power > minStrength) {
        successCount++
      }

      if (i < attempts - 1) {
        await Bun.sleep(2000)
      }
    }

    const passed = successCount >= Math.ceil(attempts / 2)
    logger.info(
      `Signal verification for ${satellite.name}: ${passed ? 'passed' : 'failed'} (${successCount}/${attempts})`
    )
    return passed
  }

  async verifySignalAtFrequency(
    frequency: number,
    gain: number,
    minStrength: number
  ): Promise<boolean> {
    try {
      const request: SignalCheckRequest = {
        frequency,
        gain,
      }

      const response = await fetch(`${this.relayUrl}/sdr/signal/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        return false
      }

      const data = (await response.json()) as SignalCheckResponse
      return data.detected && data.power > minStrength
    } catch {
      return false
    }
  }
}

/**
 * Remote SDR provider - connects to SDR relay server
 */
export class RemoteSDRProvider implements ISDRProvider {
  readonly fft: IFFTStream
  readonly recorder: IRecorder
  readonly signal: ISignalChecker
  private relayUrl: string

  constructor(
    relayUrl: string,
    recordingsDir: string
  ) {
    this.relayUrl = relayUrl
    this.fft = new RemoteFFTStream(relayUrl)
    this.recorder = new RemoteRecorder(relayUrl, recordingsDir)
    this.signal = new RemoteSignalChecker(relayUrl)
  }

  getRelayUrl(): string {
    return this.relayUrl
  }

  async getStatus(): Promise<SDRStatus> {
    try {
      const response = await fetch(`${this.relayUrl}/sdr/status`)
      if (!response.ok) {
        return {
          connected: false,
          mode: 'idle',
          error: 'Failed to connect to SDR relay',
        }
      }

      const status = (await response.json()) as RelaySDRStatus
      return status
    } catch (error) {
      return {
        connected: false,
        mode: 'idle',
        error: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.relayUrl}/health`, { signal: AbortSignal.timeout(5000) })
      return response.ok
    } catch {
      return false
    }
  }
}

// Singleton instance
let remoteProvider: RemoteSDRProvider | null = null

/**
 * Get or create remote SDR provider
 */
export function getRemoteSDRProvider(relayUrl: string, recordingsDir: string): RemoteSDRProvider {
  if (!remoteProvider || remoteProvider.getRelayUrl() !== relayUrl) {
    remoteProvider = new RemoteSDRProvider(relayUrl, recordingsDir)
  }
  return remoteProvider
}
