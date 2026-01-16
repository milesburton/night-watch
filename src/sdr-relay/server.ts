/**
 * SDR Relay Server
 *
 * Lightweight HTTP + WebSocket server that exposes SDR operations.
 * Runs on Raspberry Pi with SDR hardware attached.
 */

import type { Server, ServerWebSocket } from 'bun'
import {
  type FFTData,
  type FFTStreamConfig,
  getFFTStreamConfig,
  isFFTStreamRunning,
  startFFTStream,
  stopFFTStream,
  updateFFTFrequency,
} from '../backend/capture/fft-stream'
import { type RecordingSession, startRecording } from '../backend/capture/recorder'
import { checkSignalStrength, verifySignalAtFrequency } from '../backend/capture/signal'
import { logger } from '../backend/utils/logger'
import { runCommand } from '../backend/utils/shell'
import type {
  CaptureSession,
  FFTWSMessage,
  SDRStatus,
  SignalCheckRequest,
  SignalCheckResponse,
  StartCaptureRequest,
  StartCaptureResponse,
  StopCaptureRequest,
  StopCaptureResponse,
  TuneRequest,
  TuneResponse,
} from './types'

// Active FFT subscribers
const fftSubscribers = new Set<ServerWebSocket<unknown>>()

// Active capture sessions
const activeSessions = new Map<
  string,
  {
    session: RecordingSession
    startTime: Date
    durationSeconds: number
    status: 'recording' | 'complete' | 'error'
    progress: number
  }
>()

// Current SDR mode
let currentMode: 'idle' | 'fft' | 'recording' = 'idle'

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `capture-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Broadcast FFT data to all subscribers
 */
function broadcastFFTData(data: FFTData): void {
  const message = JSON.stringify({ type: 'fft_data', data })
  for (const ws of fftSubscribers) {
    try {
      ws.send(message)
    } catch {
      fftSubscribers.delete(ws)
    }
  }
}

/**
 * Handle FFT WebSocket messages
 */
function handleFFTMessage(ws: ServerWebSocket<unknown>, message: FFTWSMessage): void {
  switch (message.type) {
    case 'subscribe': {
      if (currentMode === 'recording') {
        ws.send(JSON.stringify({ type: 'error', message: 'SDR is currently recording' }))
        return
      }

      // Add to subscribers
      fftSubscribers.add(ws)

      // Start FFT if not running
      if (!isFFTStreamRunning()) {
        const started = startFFTStream(message.config, broadcastFFTData)
        if (!started) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to start FFT stream' }))
          fftSubscribers.delete(ws)
          return
        }
        currentMode = 'fft'
      }

      ws.send(JSON.stringify({ type: 'subscribed', config: message.config }))
      logger.info(`FFT subscriber added (total: ${fftSubscribers.size})`)
      break
    }

    case 'unsubscribe': {
      fftSubscribers.delete(ws)
      ws.send(JSON.stringify({ type: 'unsubscribed' }))

      // Stop FFT if no more subscribers
      if (fftSubscribers.size === 0 && isFFTStreamRunning()) {
        stopFFTStream()
        currentMode = 'idle'
        logger.info('FFT stream stopped (no subscribers)')
      }
      break
    }

    case 'set_frequency': {
      if (isFFTStreamRunning()) {
        updateFFTFrequency(message.frequency)
        logger.debug(`FFT frequency updated to ${message.frequency / 1e6} MHz`)
      }
      break
    }

    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }))
  }
}

/**
 * Get SDR status
 */
async function getSDRStatus(): Promise<SDRStatus> {
  try {
    const result = await runCommand('rtl_test', ['-t'], 10000)
    const connected = result.exitCode === 0 || result.stderr.includes('Found')
    const deviceMatch = result.stderr.match(/Using device \d+: (.+)/)
    const device = deviceMatch ? deviceMatch[1] : undefined

    return {
      connected,
      device,
      mode: currentMode,
    }
  } catch (error) {
    return {
      connected: false,
      mode: currentMode,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Start SDR relay server
 */
export function startSDRRelayServer(port: number, host: string): Server {
  logger.info(`Starting SDR relay server on ${host}:${port}`)

  const server = Bun.serve({
    port,
    hostname: host,

    async fetch(req, server) {
      const url = new URL(req.url)
      const path = url.pathname

      // Handle WebSocket upgrade for FFT streaming
      if (path === '/sdr/fft' && req.headers.get('upgrade') === 'websocket') {
        const success = server.upgrade(req)
        return success ? undefined : new Response('WebSocket upgrade failed', { status: 400 })
      }

      // CORS headers
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }

      if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
      }

      // REST API endpoints
      try {
        // GET /sdr/status
        if (path === '/sdr/status' && req.method === 'GET') {
          const status = await getSDRStatus()
          return Response.json(status, { headers: corsHeaders })
        }

        // POST /sdr/tune
        if (path === '/sdr/tune' && req.method === 'POST') {
          const body = (await req.json()) as TuneRequest

          if (isFFTStreamRunning()) {
            updateFFTFrequency(body.frequency)
          }

          const response: TuneResponse = {
            success: true,
            frequency: body.frequency,
          }
          return Response.json(response, { headers: corsHeaders })
        }

        // POST /sdr/capture/start
        if (path === '/sdr/capture/start' && req.method === 'POST') {
          const body = (await req.json()) as StartCaptureRequest

          // Check if already recording
          if (currentMode === 'recording') {
            const response: StartCaptureResponse = {
              sessionId: '',
              success: false,
              error: 'SDR is already recording',
            }
            return Response.json(response, { status: 409, headers: corsHeaders })
          }

          // Stop FFT if running
          if (isFFTStreamRunning()) {
            stopFFTStream()
          }

          const sessionId = generateSessionId()

          try {
            // Create satellite info for recorder
            const satelliteInfo = {
              name: body.satelliteName || 'Unknown',
              noradId: 0,
              frequency: body.frequency,
              signalType: 'apt' as const,
              signalConfig: {
                type: 'apt' as const,
                bandwidth: 34000,
                sampleRate: body.sampleRate,
                demodulation: 'fm' as const,
              },
              enabled: true,
            }

            const config = {
              serviceMode: 'sdr-relay' as const,
              sdrRelay: { port, host, url: undefined },
              station: { latitude: 0, longitude: 0, altitude: 0 },
              sdr: {
                gain: body.gain,
                sampleRate: body.sampleRate,
                ppmCorrection: body.ppmCorrection || 0,
              },
              recording: {
                minElevation: 0,
                minSignalStrength: -50,
                skipSignalCheck: true,
                recordingsDir: '/tmp/sdr-relay',
                imagesDir: '/tmp/sdr-relay/images',
              },
              tle: { updateIntervalHours: 24 },
              web: { port: 3000, host: '0.0.0.0' },
              database: { path: '/tmp/sdr-relay.db' },
              logLevel: 'info' as const,
              issSstvEnabled: false,
            }

            const session = await startRecording(satelliteInfo, config)
            currentMode = 'recording'

            activeSessions.set(sessionId, {
              session,
              startTime: new Date(),
              durationSeconds: body.durationSeconds,
              status: 'recording',
              progress: 0,
            })

            // Set up progress tracking
            const progressInterval = setInterval(() => {
              const sessionData = activeSessions.get(sessionId)
              if (sessionData && sessionData.status === 'recording') {
                const elapsed = (Date.now() - sessionData.startTime.getTime()) / 1000
                sessionData.progress = Math.min(100, (elapsed / sessionData.durationSeconds) * 100)

                // Auto-stop when duration reached
                if (elapsed >= sessionData.durationSeconds) {
                  clearInterval(progressInterval)
                  session.stop().then(() => {
                    sessionData.status = 'complete'
                    currentMode = 'idle'
                    logger.capture(`Recording complete: ${session.outputPath}`)
                  })
                }
              } else {
                clearInterval(progressInterval)
              }
            }, 1000)

            const response: StartCaptureResponse = {
              sessionId,
              success: true,
            }
            return Response.json(response, { headers: corsHeaders })
          } catch (error) {
            currentMode = 'idle'
            const response: StartCaptureResponse = {
              sessionId: '',
              success: false,
              error: error instanceof Error ? error.message : 'Failed to start capture',
            }
            return Response.json(response, { status: 500, headers: corsHeaders })
          }
        }

        // POST /sdr/capture/stop
        if (path === '/sdr/capture/stop' && req.method === 'POST') {
          const body = (await req.json()) as StopCaptureRequest
          const sessionData = activeSessions.get(body.sessionId)

          if (!sessionData) {
            const response: StopCaptureResponse = {
              success: false,
              error: 'Session not found',
            }
            return Response.json(response, { status: 404, headers: corsHeaders })
          }

          await sessionData.session.stop()
          sessionData.status = 'complete'
          currentMode = 'idle'

          const response: StopCaptureResponse = {
            success: true,
            outputPath: sessionData.session.outputPath,
          }
          return Response.json(response, { headers: corsHeaders })
        }

        // GET /sdr/capture/:sessionId
        if (path.startsWith('/sdr/capture/') && req.method === 'GET') {
          const sessionId = path.split('/')[3]
          const sessionData = activeSessions.get(sessionId || '')

          if (!sessionData) {
            return Response.json(
              { error: 'Session not found' },
              { status: 404, headers: corsHeaders }
            )
          }

          const session: CaptureSession = {
            sessionId: sessionId || '',
            frequency: sessionData.session.satellite.frequency,
            startTime: sessionData.startTime.toISOString(),
            durationSeconds: sessionData.durationSeconds,
            status: sessionData.status,
            progress: sessionData.progress,
            outputPath:
              sessionData.status === 'complete' ? sessionData.session.outputPath : undefined,
          }
          return Response.json(session, { headers: corsHeaders })
        }

        // GET /sdr/capture/:sessionId/audio
        if (path.match(/^\/sdr\/capture\/[\w-]+\/audio$/) && req.method === 'GET') {
          const sessionId = path.split('/')[3]
          const sessionData = activeSessions.get(sessionId || '')

          if (!sessionData || sessionData.status !== 'complete') {
            return Response.json(
              { error: 'Recording not complete or not found' },
              { status: 404, headers: corsHeaders }
            )
          }

          const file = Bun.file(sessionData.session.outputPath)
          return new Response(file, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'audio/wav',
              'Content-Disposition': `attachment; filename="${sessionId}.wav"`,
            },
          })
        }

        // POST /sdr/signal/check
        if (path === '/sdr/signal/check' && req.method === 'POST') {
          const body = (await req.json()) as SignalCheckRequest

          if (currentMode === 'recording') {
            return Response.json(
              { error: 'SDR is currently recording' },
              { status: 409, headers: corsHeaders }
            )
          }

          // Pause FFT if running
          const wasFFTRunning = isFFTStreamRunning()
          if (wasFFTRunning) {
            stopFFTStream()
          }

          try {
            const detected = await verifySignalAtFrequency(
              body.frequency,
              body.gain,
              -30 // Default threshold
            )

            const response: SignalCheckResponse = {
              frequency: body.frequency,
              power: detected ? -20 : -50, // Approximate
              detected,
              timestamp: new Date().toISOString(),
            }

            // Restart FFT if it was running
            if (wasFFTRunning) {
              const config = getFFTStreamConfig()
              if (config) {
                startFFTStream(config, broadcastFFTData)
              }
            }

            return Response.json(response, { headers: corsHeaders })
          } catch (error) {
            // Restart FFT if it was running
            if (wasFFTRunning) {
              const config = getFFTStreamConfig()
              if (config) {
                startFFTStream(config, broadcastFFTData)
              }
            }

            return Response.json(
              { error: error instanceof Error ? error.message : 'Signal check failed' },
              { status: 500, headers: corsHeaders }
            )
          }
        }

        // Health check
        if (path === '/health' && req.method === 'GET') {
          return Response.json({ status: 'ok', mode: currentMode }, { headers: corsHeaders })
        }

        return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders })
      } catch (error) {
        logger.error(`SDR relay error: ${error}`)
        return Response.json(
          { error: error instanceof Error ? error.message : 'Internal server error' },
          { status: 500, headers: corsHeaders }
        )
      }
    },

    websocket: {
      open(ws) {
        logger.debug('FFT WebSocket connection opened')
      },

      message(ws, message) {
        try {
          const data = JSON.parse(message.toString()) as FFTWSMessage
          handleFFTMessage(ws, data)
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }))
        }
      },

      close(ws) {
        fftSubscribers.delete(ws)
        logger.debug(`FFT WebSocket closed (remaining: ${fftSubscribers.size})`)

        // Stop FFT if no more subscribers
        if (fftSubscribers.size === 0 && isFFTStreamRunning()) {
          stopFFTStream()
          currentMode = 'idle'
        }
      },
    },
  })

  logger.info(`SDR relay server listening on http://${host}:${port}`)
  logger.info('Endpoints:')
  logger.info('  GET  /sdr/status           - SDR device status')
  logger.info('  POST /sdr/tune             - Tune to frequency')
  logger.info('  POST /sdr/capture/start    - Start recording')
  logger.info('  POST /sdr/capture/stop     - Stop recording')
  logger.info('  GET  /sdr/capture/:id      - Get capture status')
  logger.info('  GET  /sdr/capture/:id/audio - Download WAV file')
  logger.info('  POST /sdr/signal/check     - Check signal strength')
  logger.info('  WS   /sdr/fft              - FFT data stream')

  return server
}
