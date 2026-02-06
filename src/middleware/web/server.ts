import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  type FFTData,
  type NotchFilter,
  addNotchFilter,
  clearNotchFilters,
  getFFTStreamConfig,
  getFFTStreamError,
  getNotchFilters,
  isFFTStreamRunning,
  removeNotchFilter,
  setNotchFilterEnabled,
  startFFTStream,
  stopFFTStream,
} from '@backend/capture/fft-stream'
import { getDatabase } from '@backend/db/database'
import {
  getSstvStatus,
  setGroundSstvScanEnabled,
  setManualSstvEnabled,
} from '@backend/satellites/events'
import { stateManager } from '@backend/state/state-manager'
import type { StateEvent } from '@backend/types'
import { logger } from '@backend/utils/logger'
import { fileExists, getDirname, readFileText } from '@backend/utils/node-compat'
import { type FrequencyBand, createAutoGain, createBandGainStore } from './auto-gain'
import { getGlobeState } from './globe-service'

const __dirname = getDirname(import.meta.url)

const clients = new Set<WebSocket>()
const fftSubscribers = new Set<WebSocket>()

// Runtime-adjustable SDR gain (initialised from environment)
const defaultGain = Number(process.env.SDR_GAIN) || 20
let currentGain = defaultGain
let currentBand: FrequencyBand = 'noaa'

// Per-band gain store
const bandGainStore = createBandGainStore()

// Per-band auto-gain target ranges (2M needs higher gain for weak signals)
const BAND_GAIN_TARGETS: Record<FrequencyBand, { targetMin: number; targetMax: number }> = {
  noaa: { targetMin: -80, targetMax: -55 },
  '2m': { targetMin: -55, targetMax: -35 }, // Higher targets = more gain for weak 2m signals
  unknown: { targetMin: -75, targetMax: -50 },
}

// Auto-gain calibration (single instance - one SDR at a time)
const autoGain = createAutoGain(currentGain, {
  targetMin: -80,
  targetMax: -55,
  samplesNeeded: 10,
  step: 5,
  minGain: 0,
  maxGain: 49, // RTL-SDR practical max ~49.6 dB
})
// Disable auto-gain if explicitly set via environment
if (process.env.SDR_GAIN) {
  autoGain.disable()
}

// Debounce FFT start requests to prevent rapid restarts
let pendingFFTStart: ReturnType<typeof setTimeout> | null = null
const FFT_START_DEBOUNCE_MS = 500

// Track deferred FFT stop timer so it can be cancelled on re-subscribe
let pendingFFTStop: ReturnType<typeof setTimeout> | null = null

// Server-side FFT history ring buffer (sent to new subscribers on connect)
const FFT_HISTORY_MAX = 150
const fftHistoryBuffer: FFTData[] = []

// Check if React build exists
async function getStaticDir(): Promise<string> {
  const reactDir = resolve(__dirname, 'static-react')
  const legacyDir = resolve(__dirname, 'static')

  if (fileExists(`${reactDir}/index.html`)) {
    return reactDir
  }
  return legacyDir
}

export function startWebServer(port: number, host: string, imagesDir: string) {
  const resolvedImagesDir = resolve(imagesDir)
  let staticDir: string

  // Initialize static directory (async IIFE to set up before server starts handling requests)
  getStaticDir().then((dir) => {
    staticDir = dir
  })

  // Add default notch filters for known interference frequencies
  // These can be managed via the API endpoints
  const defaultNotchFilters = [{ frequency: 144.42e6, width: 10_000 }]
  for (const filter of defaultNotchFilters) {
    addNotchFilter(filter.frequency, filter.width)
  }
  logger.info(`Initialized ${defaultNotchFilters.length} default notch filter(s)`)

  // Create HTTP server
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Ensure staticDir is initialized
    if (!staticDir) {
      staticDir = await getStaticDir()
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    // Static files - serve index.html
    if (url.pathname === '/' || url.pathname === '/index.html') {
      await serveStaticNode(res, staticDir, 'index.html', 'text/html')
      return
    }

    // Legacy static files (for backwards compatibility)
    if (url.pathname === '/styles.css') {
      await serveStaticNode(res, staticDir, 'styles.css', 'text/css')
      return
    }

    if (url.pathname === '/app.js') {
      await serveStaticNode(res, staticDir, 'app.js', 'application/javascript')
      return
    }

    // Vite assets (JS, CSS chunks)
    if (url.pathname.startsWith('/assets/')) {
      const filename = url.pathname.slice(1) // Remove leading /
      const contentType = getContentType(filename)
      await serveStaticNode(res, staticDir, filename, contentType)
      return
    }

    // Image serving from /images/ path
    if (url.pathname.startsWith('/images/')) {
      const filename = url.pathname.slice(8)
      await serveImageNode(res, resolvedImagesDir, filename)
      return
    }

    // Image serving from /api/images/ path
    if (url.pathname.startsWith('/api/images/')) {
      const filename = decodeURIComponent(url.pathname.slice(12))
      await serveImageNode(res, resolvedImagesDir, filename)
      return
    }

    // API routes
    if (url.pathname === '/api/status') {
      jsonResponseNode(res, stateManager.getState())
      return
    }

    if (url.pathname === '/api/passes') {
      jsonResponseNode(res, stateManager.getState().upcomingPasses)
      return
    }

    if (url.pathname === '/api/captures') {
      const limit = Number(url.searchParams.get('limit')) || 50
      const offset = Number(url.searchParams.get('offset')) || 0
      try {
        const db = getDatabase()
        const captures = db.getRecentCaptures(limit, offset)
        // Map database fields to frontend CaptureRecord type
        const mapped = captures.map((c) => ({
          ...c,
          satellite: c.satelliteName, // Add satellite field for frontend
          timestamp: c.startTime, // Map startTime to timestamp for frontend
        }))
        jsonResponseNode(res, mapped)
      } catch {
        jsonResponseNode(res, [])
      }
      return
    }

    if (url.pathname === '/api/summary') {
      try {
        const db = getDatabase()
        jsonResponseNode(res, db.getCaptureSummary())
      } catch {
        jsonResponseNode(res, { total: 0, successful: 0, failed: 0 })
      }
      return
    }

    if (url.pathname === '/api/sstv/status') {
      const sstv = getSstvStatus()
      const systemStatus = stateManager.getState().status
      // Override status if system is scanning or capturing SSTV
      if (systemStatus === 'scanning') {
        sstv.status = 'scanning'
      } else if (systemStatus === 'capturing') {
        sstv.status = 'capturing'
      }
      jsonResponseNode(res, sstv)
      return
    }

    if (url.pathname === '/api/sstv/toggle' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const enabled = body.enabled ?? !getSstvStatus().manualEnabled
        setManualSstvEnabled(enabled)
        broadcastSstvStatus()
        jsonResponseNode(res, getSstvStatus())
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request')
      }
      return
    }

    if (url.pathname === '/api/sstv/ground-scan/toggle' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const enabled = body.enabled ?? !getSstvStatus().groundScanEnabled
        setGroundSstvScanEnabled(enabled)
        broadcastSstvStatus()
        jsonResponseNode(res, getSstvStatus())
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request')
      }
      return
    }

    if (url.pathname === '/api/globe') {
      const globe = getGlobeState()
      jsonResponseNode(res, globe)
      return
    }

    if (url.pathname === '/api/version') {
      try {
        const versionPath = resolve('./version.json')
        if (await fileExists(versionPath)) {
          const versionText = await readFileText(versionPath)
          const version = JSON.parse(versionText)
          jsonResponseNode(res, version)
          return
        }
      } catch {
        // Ignore errors reading version file
      }
      jsonResponseNode(res, { version: 'dev', commit: 'unknown', buildTime: null })
      return
    }

    if (url.pathname === '/api/config') {
      const globe = getGlobeState()
      jsonResponseNode(res, {
        station: {
          latitude: globe?.station?.latitude ?? (Number(process.env.STATION_LATITUDE) || 0),
          longitude: globe?.station?.longitude ?? (Number(process.env.STATION_LONGITUDE) || 0),
          altitude: Number(process.env.STATION_ALTITUDE) || 0,
        },
        sdr: {
          gain: currentGain,
          band: currentBand,
          bandGains: bandGainStore.getAll(),
          ppmCorrection: Number(process.env.SDR_PPM_CORRECTION) || 0,
          sampleRate: Number(process.env.SDR_SAMPLE_RATE) || 48_000,
        },
        recording: {
          minElevation: Number(process.env.MIN_ELEVATION) || 20,
          minSignalStrength: Number(process.env.MIN_SIGNAL_STRENGTH) || -30,
          skipSignalCheck: process.env.SKIP_SIGNAL_CHECK === 'true',
        },
      })
      return
    }

    // FFT stream status
    if (url.pathname === '/api/fft/status') {
      jsonResponseNode(res, {
        running: isFFTStreamRunning(),
        config: getFFTStreamConfig(),
        subscribers: fftSubscribers.size,
      })
      return
    }

    // Start FFT stream
    if (url.pathname === '/api/fft/start' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req)

        const frequency = body.frequency || 137_500_000
        const bandwidth = body.bandwidth || 200_000
        const gain = body.gain || currentGain
        const fftSize = body.fftSize || 1024
        const updateRate = body.updateRate || 10

        const success = await startFFTStream(
          { frequency, bandwidth, fftSize, gain, updateRate },
          broadcastFFTData
        )

        jsonResponseNode(res, { success, running: isFFTStreamRunning() })
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request')
      }
      return
    }

    // Update SDR gain at runtime
    if (url.pathname === '/api/config/gain' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        if (body.auto === true) {
          bandGainStore.clear(currentBand)
          autoGain.enable()
          logger.info(`Auto-gain calibration enabled for band '${currentBand}'`)
          jsonResponseNode(res, {
            success: true,
            gain: currentGain,
            autoGain: true,
            band: currentBand,
          })
          return
        }
        const gain = body.gain
        if (gain === undefined || gain < 0 || gain > 49) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Gain must be between 0 and 49')
          return
        }
        currentGain = gain
        autoGain.setGain(gain)
        bandGainStore.set(currentBand, gain, true)
        logger.info(`SDR gain updated to ${gain} dB for band '${currentBand}'`)
        if (isFFTStreamRunning()) {
          const config = getFFTStreamConfig()
          debouncedFFTStart(config?.frequency || 137_500_000)
        }
        jsonResponseNode(res, { success: true, gain: currentGain, autoGain: false })
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request')
      }
      return
    }

    // Stop FFT stream
    if (url.pathname === '/api/fft/stop' && req.method === 'POST') {
      await stopFFTStream()
      jsonResponseNode(res, { success: true, running: false })
      return
    }

    // Get notch filters
    if (url.pathname === '/api/fft/notch' && req.method === 'GET') {
      jsonResponseNode(res, { filters: getNotchFilters() })
      return
    }

    // Add notch filter
    if (url.pathname === '/api/fft/notch' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const frequency = body.frequency
        const width = body.width || 5000

        if (!frequency || typeof frequency !== 'number') {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('frequency required')
          return
        }

        addNotchFilter(frequency, width)
        jsonResponseNode(res, { success: true, filters: getNotchFilters() })
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request')
      }
      return
    }

    // Remove notch filter
    if (url.pathname === '/api/fft/notch' && req.method === 'DELETE') {
      try {
        const body = await readJsonBody(req)
        const frequency = body.frequency

        if (!frequency || typeof frequency !== 'number') {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('frequency required')
          return
        }

        const removed = removeNotchFilter(frequency)
        jsonResponseNode(res, { success: removed, filters: getNotchFilters() })
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request')
      }
      return
    }

    // Toggle notch filter
    if (url.pathname === '/api/fft/notch/toggle' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req)
        const frequency = body.frequency
        const enabled = body.enabled

        if (!frequency || typeof frequency !== 'number' || typeof enabled !== 'boolean') {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('frequency and enabled required')
          return
        }

        const updated = setNotchFilterEnabled(frequency, enabled)
        jsonResponseNode(res, { success: updated, filters: getNotchFilters() })
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request')
      }
      return
    }

    // Clear all notch filters
    if (url.pathname === '/api/fft/notch/clear' && req.method === 'POST') {
      clearNotchFilters()
      jsonResponseNode(res, { success: true, filters: [] })
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })

  // Create WebSocket server
  const wss = new WebSocketServer({ noServer: true })

  // Handle WebSocket upgrade
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    if (url.pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  // WebSocket connection handler
  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws)

    // Send current state on connection
    ws.send(
      JSON.stringify({
        type: 'init',
        state: stateManager.getState(),
        globe: getGlobeState(),
        fft: {
          running: isFFTStreamRunning(),
          config: getFFTStreamConfig(),
          notchFilters: getNotchFilters(),
          error: getFFTStreamError(),
        },
      })
    )

    // Handle WebSocket close
    ws.on('close', () => {
      clients.delete(ws)
      fftSubscribers.delete(ws)
    })

    // Handle WebSocket messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString()) as { type: string; [key: string]: unknown }

        // Handle FFT subscription
        if (data.type === 'fft_subscribe') {
          fftSubscribers.add(ws)
          logger.debug(`FFT subscriber added, total: ${fftSubscribers.size}`)

          // Cancel any pending deferred stop — a new subscriber needs the stream alive
          if (pendingFFTStop) {
            clearTimeout(pendingFFTStop)
            pendingFFTStop = null
          }

          // Send buffered history to new subscriber
          if (fftHistoryBuffer.length > 0) {
            ws.send(JSON.stringify({ type: 'fft_history', data: fftHistoryBuffer }))
          }

          // Auto-start FFT stream if not running and we have subscribers
          // When scanning, the scanner controls frequency via state events
          // Don't start during active capture — the SDR is in use by rtl_fm
          if (!isFFTStreamRunning()) {
            const state = stateManager.getState()
            if (state.status === 'capturing' || state.status === 'decoding') {
              logger.debug('Skipping FFT start — SDR in use for capture/decode')
            } else {
              const frequency =
                state.status === 'scanning' && state.scanningFrequency
                  ? state.scanningFrequency
                  : (data.frequency as number) || 137_500_000
              debouncedFFTStart(frequency)
            }
          }

          ws.send(
            JSON.stringify({
              type: 'fft_subscribed',
              running: isFFTStreamRunning(),
              config: getFFTStreamConfig(),
              error: getFFTStreamError(),
            })
          )
        }

        // Handle FFT unsubscription
        if (data.type === 'fft_unsubscribe') {
          fftSubscribers.delete(ws)
          logger.debug(`FFT subscriber removed, total: ${fftSubscribers.size}`)

          // Auto-stop FFT stream if no subscribers (with delay to allow re-subscription)
          if (pendingFFTStop) {
            clearTimeout(pendingFFTStop)
          }
          pendingFFTStop = setTimeout(async () => {
            pendingFFTStop = null
            if (fftSubscribers.size === 0 && isFFTStreamRunning()) {
              await stopFFTStream()
            }
          }, 1_000)

          ws.send(JSON.stringify({ type: 'fft_unsubscribed' }))
        }

        // Handle FFT frequency change
        if (data.type === 'fft_set_frequency') {
          const frequency = data.frequency as number
          if (frequency) {
            debouncedFFTStart(frequency)
          }
        }

        // Handle SDR gain change
        if (data.type === 'fft_set_gain') {
          const gain = data.gain as number
          if (gain !== undefined && gain >= 0 && gain <= 49) {
            currentGain = gain
            autoGain.setGain(gain)
            bandGainStore.set(currentBand, gain, true)
            logger.info(`SDR gain updated via WebSocket to ${gain} dB for band '${currentBand}'`)
            if (isFFTStreamRunning()) {
              const config = getFFTStreamConfig()
              debouncedFFTStart(config?.frequency || 137_500_000)
            }
            ws.send(JSON.stringify({ type: 'gain_updated', gain: currentGain }))
          }
        }
      } catch {
        // Ignore invalid messages
      }
    })
  })

  // Subscribe to state changes and broadcast to all clients
  stateManager.on('state', async (event: StateEvent) => {
    // Retune FFT stream when scanning frequency changes (but not during active capture)
    if (event.type === 'scanning_frequency' && fftSubscribers.size > 0) {
      const state = stateManager.getState()
      if (state.status !== 'capturing' && state.status !== 'decoding') {
        debouncedFFTStart(event.frequency)
      }
    }

    // Stop FFT stream when a satellite pass capture starts
    // The SDR can only be used by one process at a time (rtl_sdr vs rtl_fm)
    if (event.type === 'pass_start' && isFFTStreamRunning()) {
      logger.info('Stopping FFT stream for satellite pass capture')
      await stopFFTStream()
    }

    const message = JSON.stringify(event)
    for (const client of clients) {
      try {
        client.send(message)
      } catch {
        clients.delete(client)
      }
    }
  })

  // Start listening
  server.listen(port, host, () => {
    logger.info(`Web server listening on http://${host}:${port}`)
  })

  return server
}

/**
 * Debounced FFT start to prevent rapid restart cycles
 * Consolidates multiple start requests into a single delayed start
 */
function debouncedFFTStart(frequency: number) {
  if (pendingFFTStart) {
    clearTimeout(pendingFFTStart)
  }

  pendingFFTStart = setTimeout(async () => {
    const thisTimeout = pendingFFTStart

    // Clear history buffer on frequency change (stale data from different freq)
    fftHistoryBuffer.length = 0

    // Look up gain for this frequency's band
    const { band, gain, needsCalibration } = bandGainStore.getForFrequency(frequency, defaultGain)
    currentBand = band
    currentGain = gain

    if (needsCalibration && !process.env.SDR_GAIN) {
      // Configure auto-gain targets for this band
      const targets = BAND_GAIN_TARGETS[band]
      autoGain.config.targetMin = targets.targetMin
      autoGain.config.targetMax = targets.targetMax
      autoGain.state.currentGain = gain
      autoGain.enable()
      logger.info(
        `Band '${band}': no calibrated gain, starting auto-gain from ${gain} dB (target ${targets.targetMin} to ${targets.targetMax} dB)`
      )
    } else {
      autoGain.disable()
    }

    await startFFTStream(
      { frequency, bandwidth: 200_000, fftSize: 2_048, gain: currentGain, updateRate: 30 },
      broadcastFFTData
    )
    // Check for errors after a short delay (rtl_sdr exits quickly if no device)
    setTimeout(() => {
      const error = getFFTStreamError()
      if (error) {
        broadcastFFTError(error)
      }
    }, 1_500)

    // Only clear if this timeout hasn't been replaced by a newer call
    if (pendingFFTStart === thisTimeout) {
      pendingFFTStart = null
    }
  }, FFT_START_DEBOUNCE_MS)
}

function broadcastSstvStatus() {
  const message = JSON.stringify({
    type: 'sstv_status',
    status: getSstvStatus(),
  })
  for (const client of clients) {
    try {
      client.send(message)
    } catch {
      clients.delete(client)
    }
  }
}

function broadcastFFTData(data: FFTData) {
  // Always buffer, even if no subscribers (so late joiners get history)
  fftHistoryBuffer.push(data)
  if (fftHistoryBuffer.length > FFT_HISTORY_MAX) {
    fftHistoryBuffer.shift()
  }

  if (fftSubscribers.size === 0) return

  // Feed auto-gain calibration
  if (autoGain.state.enabled) {
    const result = autoGain.feed(data.bins)
    if (result.action === 'adjusted') {
      currentGain = result.newGain
      bandGainStore.set(currentBand, currentGain, false)
      const config = getFFTStreamConfig()
      debouncedFFTStart(config?.frequency || 137_500_000)
    } else if (result.action === 'in_range') {
      bandGainStore.set(currentBand, result.gain, true)
      currentGain = result.gain
      logger.info(`Band '${currentBand}': gain calibrated to ${result.gain} dB`)
    } else if (result.action === 'limit_reached') {
      bandGainStore.set(currentBand, result.gain, true)
      currentGain = result.gain
    }
  }

  const message = JSON.stringify({
    type: 'fft_data',
    data,
  })

  for (const subscriber of fftSubscribers) {
    try {
      subscriber.send(message)
    } catch {
      fftSubscribers.delete(subscriber)
    }
  }
}

function broadcastFFTError(error: string) {
  const message = JSON.stringify({
    type: 'fft_error',
    error,
  })

  for (const subscriber of fftSubscribers) {
    try {
      subscriber.send(message)
    } catch {
      fftSubscribers.delete(subscriber)
    }
  }
}

// Helper function to read JSON body from IncomingMessage
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

// Helper function to send JSON response with Node.js ServerResponse
function jsonResponseNode(res: ServerResponse, data: unknown): void {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(data))
}

// Helper function to serve static files with Node.js ServerResponse
async function serveStaticNode(
  res: ServerResponse,
  dir: string,
  filename: string,
  contentType: string
): Promise<void> {
  const filePath = resolve(dir, filename)
  if (await fileExists(filePath)) {
    try {
      const content = await readFile(filePath)
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(content)
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
}

// Helper function to serve images with Node.js ServerResponse
async function serveImageNode(
  res: ServerResponse,
  imagesDir: string,
  filename: string
): Promise<void> {
  // Prevent directory traversal
  if (filename.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('Forbidden')
    return
  }

  const filePath = resolve(imagesDir, filename)
  if (await fileExists(filePath)) {
    try {
      const content = await readFile(filePath)
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000',
      })
      res.end(content)
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
}

function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const contentTypes: Record<string, string> = {
    js: 'application/javascript',
    mjs: 'application/javascript',
    css: 'text/css',
    html: 'text/html',
    json: 'application/json',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    eot: 'application/vnd.ms-fontobject',
  }
  return contentTypes[ext || ''] || 'application/octet-stream'
}
