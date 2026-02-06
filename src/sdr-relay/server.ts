/**
 * SDR Relay Server
 *
 * Lightweight HTTP + WebSocket server that exposes SDR operations.
 * Runs on Raspberry Pi with SDR hardware attached.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { WebSocketServer, type WebSocket } from 'ws'
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
const fftSubscribers = new Set<WebSocket>()

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
function handleFFTMessage(ws: WebSocket, message: FFTWSMessage): void {
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

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  // Create HTTP server
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const path = url.pathname

    // Handle OPTIONS for CORS
    if (req.method === 'OPTIONS') {
      res.writeHead(200, corsHeaders)
      res.end()
      return
    }

    // REST API endpoints
    try {
      // GET /sdr/status
      if (path === '/sdr/status' && req.method === 'GET') {
        const status = await getSDRStatus()
        jsonResponse(res, status, corsHeaders)
        return
      }

      // POST /sdr/tune
      if (path === '/sdr/tune' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const tuneRequest = body as unknown as TuneRequest

        if (isFFTStreamRunning()) {
          updateFFTFrequency(tuneRequest.frequency)
        }

        const response: TuneResponse = {
          success: true,
          frequency: tuneRequest.frequency,
        }
        jsonResponse(res, response, corsHeaders)
        return
      }

      // POST /sdr/capture/start
      if (path === '/sdr/capture/start' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const startRequest = body as unknown as StartCaptureRequest

        // Check if already recording
        if (currentMode === 'recording') {
          const response: StartCaptureResponse = {
            sessionId: '',
            success: false,
            error: 'SDR is already recording',
          }
          jsonResponse(res, response, corsHeaders, 409)
          return
        }

        // Stop FFT if running
        if (isFFTStreamRunning()) {
          stopFFTStream()
        }

        const sessionId = generateSessionId()

        try {
          // Create satellite info for recorder
          const satelliteInfo = {
            name: startRequest.satelliteName || 'Unknown',
            noradId: 0,
            frequency: startRequest.frequency,
            signalType: 'lrpt' as const,
            signalConfig: {
              type: 'lrpt' as const,
              bandwidth: 120000,
              sampleRate: startRequest.sampleRate,
              demodulation: 'fm' as const,
            },
            enabled: true,
          }

          const config = {
            serviceMode: 'sdr-relay' as const,
            sdrRelay: { port, host, url: undefined },
            station: { latitude: 0, longitude: 0, altitude: 0 },
            sdr: {
              gain: startRequest.gain,
              sampleRate: startRequest.sampleRate,
              ppmCorrection: startRequest.ppmCorrection || 0,
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
            durationSeconds: startRequest.durationSeconds,
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
          jsonResponse(res, response, corsHeaders)
          return
        } catch (error) {
          currentMode = 'idle'
          const response: StartCaptureResponse = {
            sessionId: '',
            success: false,
            error: error instanceof Error ? error.message : 'Failed to start capture',
          }
          jsonResponse(res, response, corsHeaders, 500)
          return
        }
      }

      // POST /sdr/capture/stop
      if (path === '/sdr/capture/stop' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const stopRequest = body as unknown as StopCaptureRequest
        const sessionData = activeSessions.get(stopRequest.sessionId)

        if (!sessionData) {
          const response: StopCaptureResponse = {
            success: false,
            error: 'Session not found',
          }
          jsonResponse(res, response, corsHeaders, 404)
          return
        }

        await sessionData.session.stop()
        sessionData.status = 'complete'
        currentMode = 'idle'

        const response: StopCaptureResponse = {
          success: true,
          outputPath: sessionData.session.outputPath,
        }
        jsonResponse(res, response, corsHeaders)
        return
      }

      // GET /sdr/capture/:sessionId
      if (path.startsWith('/sdr/capture/') && req.method === 'GET') {
        const sessionId = path.split('/')[3]
        const sessionData = activeSessions.get(sessionId || '')

        if (!sessionData) {
          jsonResponse(res, { error: 'Session not found' }, corsHeaders, 404)
          return
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
        jsonResponse(res, session, corsHeaders)
        return
      }

      // GET /sdr/capture/:sessionId/audio
      if (path.match(/^\/sdr\/capture\/[\w-]+\/audio$/) && req.method === 'GET') {
        const sessionId = path.split('/')[3]
        const sessionData = activeSessions.get(sessionId || '')

        if (!sessionData || sessionData.status !== 'complete') {
          jsonResponse(
            res,
            { error: 'Recording not complete or not found' },
            corsHeaders,
            404
          )
          return
        }

        try {
          const audioData = await readFile(sessionData.session.outputPath)
          res.writeHead(200, {
            ...corsHeaders,
            'Content-Type': 'audio/wav',
            'Content-Disposition': `attachment; filename="${sessionId}.wav"`,
          })
          res.end(audioData)
        } catch (error) {
          jsonResponse(
            res,
            { error: 'Failed to read audio file' },
            corsHeaders,
            500
          )
        }
        return
      }

      // POST /sdr/signal/check
      if (path === '/sdr/signal/check' && req.method === 'POST') {
        const body = await readJsonBody(req)
        const signalRequest = body as unknown as SignalCheckRequest

        if (currentMode === 'recording') {
          jsonResponse(res, { error: 'SDR is currently recording' }, corsHeaders, 409)
          return
        }

        // Pause FFT if running
        const wasFFTRunning = isFFTStreamRunning()
        if (wasFFTRunning) {
          stopFFTStream()
        }

        try {
          const detected = await verifySignalAtFrequency(
            signalRequest.frequency,
            signalRequest.gain,
            -30 // Default threshold
          )

          const response: SignalCheckResponse = {
            frequency: signalRequest.frequency,
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

          jsonResponse(res, response, corsHeaders)
          return
        } catch (error) {
          // Restart FFT if it was running
          if (wasFFTRunning) {
            const config = getFFTStreamConfig()
            if (config) {
              startFFTStream(config, broadcastFFTData)
            }
          }

          jsonResponse(
            res,
            { error: error instanceof Error ? error.message : 'Signal check failed' },
            corsHeaders,
            500
          )
          return
        }
      }

      // Health check
      if (path === '/health' && req.method === 'GET') {
        jsonResponse(res, { status: 'ok', mode: currentMode }, corsHeaders)
        return
      }

      jsonResponse(res, { error: 'Not found' }, corsHeaders, 404)
    } catch (error) {
      logger.error(`SDR relay error: ${error}`)
      jsonResponse(
        res,
        { error: error instanceof Error ? error.message : 'Internal server error' },
        corsHeaders,
        500
      )
    }
  })

  // Create WebSocket server
  const wss = new WebSocketServer({ noServer: true })

  // Handle WebSocket upgrade
  server.on(
    'upgrade',
    (req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`)

      if (url.pathname === '/sdr/fft') {
        wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          wss.emit('connection', ws, req)
        })
      } else {
        socket.destroy()
      }
    }
  )

  // WebSocket connection handler
  wss.on('connection', (ws: WebSocket) => {
    logger.debug('FFT WebSocket connection opened')

    // Handle WebSocket messages
    ws.on('message', (message: import('ws').RawData) => {
      try {
        const data = JSON.parse(message.toString()) as FFTWSMessage
        handleFFTMessage(ws, data)
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }))
      }
    })

    // Handle WebSocket close
    ws.on('close', () => {
      fftSubscribers.delete(ws)
      logger.debug(`FFT WebSocket closed (remaining: ${fftSubscribers.size})`)

      // Stop FFT if no more subscribers
      if (fftSubscribers.size === 0 && isFFTStreamRunning()) {
        stopFFTStream()
        currentMode = 'idle'
      }
    })
  })

  // Start listening
  server.listen(port, host, () => {
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
  })

  return server
}

/**
 * Helper function to read JSON body from IncomingMessage
 */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body) as Record<string, unknown>)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

/**
 * Helper function to send JSON response with Node.js ServerResponse
 */
function jsonResponse(
  res: ServerResponse,
  data: unknown,
  headers: Record<string, string>,
  status = 200
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...headers,
  })
  res.end(JSON.stringify(data))
}
