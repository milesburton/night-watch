import { resolve } from 'node:path'
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
import type { ServerWebSocket } from 'bun'
import { type FrequencyBand, createAutoGain, createBandGainStore } from './auto-gain'
import { getGlobeState } from './globe-service'

const clients = new Set<ServerWebSocket<unknown>>()
const fftSubscribers = new Set<ServerWebSocket<unknown>>()

// Runtime-adjustable SDR gain (initialised from environment)
const defaultGain = Number(process.env.SDR_GAIN) || 20
let currentGain = defaultGain
let currentBand: FrequencyBand = 'noaa'

// Per-band gain store
const bandGainStore = createBandGainStore()

// Per-band auto-gain target ranges (2M is noisier, allow higher floor)
const BAND_GAIN_TARGETS: Record<FrequencyBand, { targetMin: number; targetMax: number }> = {
  noaa: { targetMin: -80, targetMax: -55 },
  '2m': { targetMin: -70, targetMax: -45 },
  unknown: { targetMin: -75, targetMax: -50 },
}

// Auto-gain calibration (single instance - one SDR at a time)
const autoGain = createAutoGain(currentGain, {
  targetMin: -80,
  targetMax: -55,
  samplesNeeded: 10,
  step: 5,
  minGain: 0,
  maxGain: 50,
})
// Disable auto-gain if explicitly set via environment
if (process.env.SDR_GAIN) {
  autoGain.disable()
}

// Debounce FFT start requests to prevent rapid restarts
let pendingFFTStart: ReturnType<typeof setTimeout> | null = null
const FFT_START_DEBOUNCE_MS = 500

// Check if React build exists
async function getStaticDir(): Promise<string> {
  const reactDir = resolve(import.meta.dir, 'static-react')
  const legacyDir = resolve(import.meta.dir, 'static')

  const reactIndex = Bun.file(`${reactDir}/index.html`)
  if (await reactIndex.exists()) {
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
  const defaultNotchFilters = [
    { frequency: 144.42e6, width: 10000 }, // Local interference ~144.42 MHz (±10 kHz)
  ]
  for (const filter of defaultNotchFilters) {
    addNotchFilter(filter.frequency, filter.width)
  }
  logger.info(`Initialized ${defaultNotchFilters.length} default notch filter(s)`)

  const server = Bun.serve({
    port,
    hostname: host,

    async fetch(req, server) {
      // Ensure staticDir is initialized
      if (!staticDir) {
        staticDir = await getStaticDir()
      }

      const url = new URL(req.url)

      // WebSocket upgrade
      if (url.pathname === '/ws') {
        if (server.upgrade(req)) {
          return undefined
        }
        return new Response('WebSocket upgrade failed', { status: 400 })
      }

      // Static files - serve index.html
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return serveStatic(staticDir, 'index.html', 'text/html')
      }

      // Legacy static files (for backwards compatibility)
      if (url.pathname === '/styles.css') {
        return serveStatic(staticDir, 'styles.css', 'text/css')
      }

      if (url.pathname === '/app.js') {
        return serveStatic(staticDir, 'app.js', 'application/javascript')
      }

      // Vite assets (JS, CSS chunks)
      if (url.pathname.startsWith('/assets/')) {
        const filename = url.pathname.slice(1) // Remove leading /
        const contentType = getContentType(filename)
        return serveStatic(staticDir, filename, contentType)
      }

      // Image serving from /images/ path
      if (url.pathname.startsWith('/images/')) {
        const filename = url.pathname.slice(8)
        return serveImage(resolvedImagesDir, filename)
      }

      // Image serving from /api/images/ path
      if (url.pathname.startsWith('/api/images/')) {
        const filename = decodeURIComponent(url.pathname.slice(12))
        return serveImage(resolvedImagesDir, filename)
      }

      // API routes
      if (url.pathname === '/api/status') {
        return jsonResponse(stateManager.getState())
      }

      if (url.pathname === '/api/passes') {
        return jsonResponse(stateManager.getState().upcomingPasses)
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
          return jsonResponse(mapped)
        } catch {
          return jsonResponse([])
        }
      }

      if (url.pathname === '/api/summary') {
        try {
          const db = getDatabase()
          return jsonResponse(db.getCaptureSummary())
        } catch {
          return jsonResponse({ total: 0, successful: 0, failed: 0 })
        }
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
        return jsonResponse(sstv)
      }

      if (url.pathname === '/api/sstv/toggle' && req.method === 'POST') {
        try {
          const body = (await req.json()) as { enabled?: boolean }
          const enabled = body.enabled ?? !getSstvStatus().manualEnabled
          setManualSstvEnabled(enabled)
          broadcastSstvStatus()
          return jsonResponse(getSstvStatus())
        } catch {
          return new Response('Bad Request', { status: 400 })
        }
      }

      if (url.pathname === '/api/sstv/ground-scan/toggle' && req.method === 'POST') {
        try {
          const body = (await req.json()) as { enabled?: boolean }
          const enabled = body.enabled ?? !getSstvStatus().groundScanEnabled
          setGroundSstvScanEnabled(enabled)
          broadcastSstvStatus()
          return jsonResponse(getSstvStatus())
        } catch {
          return new Response('Bad Request', { status: 400 })
        }
      }

      if (url.pathname === '/api/globe') {
        const globe = getGlobeState()
        return jsonResponse(globe)
      }

      if (url.pathname === '/api/version') {
        try {
          const versionFile = Bun.file('./version.json')
          if (await versionFile.exists()) {
            const version = await versionFile.json()
            return jsonResponse(version)
          }
        } catch {
          // Ignore errors reading version file
        }
        return jsonResponse({ version: 'dev', commit: 'unknown', buildTime: null })
      }

      if (url.pathname === '/api/config') {
        const globe = getGlobeState()
        return jsonResponse({
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
            sampleRate: Number(process.env.SDR_SAMPLE_RATE) || 48000,
          },
          recording: {
            minElevation: Number(process.env.MIN_ELEVATION) || 20,
            minSignalStrength: Number(process.env.MIN_SIGNAL_STRENGTH) || -30,
            skipSignalCheck: process.env.SKIP_SIGNAL_CHECK === 'true',
          },
        })
      }

      // FFT stream status
      if (url.pathname === '/api/fft/status') {
        return jsonResponse({
          running: isFFTStreamRunning(),
          config: getFFTStreamConfig(),
          subscribers: fftSubscribers.size,
        })
      }

      // Start FFT stream
      if (url.pathname === '/api/fft/start' && req.method === 'POST') {
        try {
          const body = (await req.json()) as {
            frequency?: number
            bandwidth?: number
            gain?: number
            fftSize?: number
            updateRate?: number
          }

          const frequency = body.frequency || 137500000 // Default to 137.5 MHz
          const bandwidth = body.bandwidth || 200000 // 200 kHz
          const gain = body.gain || currentGain
          const fftSize = body.fftSize || 1024
          const updateRate = body.updateRate || 10

          const success = await startFFTStream(
            { frequency, bandwidth, fftSize, gain, updateRate },
            broadcastFFTData
          )

          return jsonResponse({ success, running: isFFTStreamRunning() })
        } catch {
          return new Response('Bad Request', { status: 400 })
        }
      }

      // Update SDR gain at runtime
      if (url.pathname === '/api/config/gain' && req.method === 'POST') {
        try {
          const body = (await req.json()) as { gain?: number; auto?: boolean }
          if (body.auto === true) {
            bandGainStore.clear(currentBand)
            autoGain.enable()
            logger.info(`Auto-gain calibration enabled for band '${currentBand}'`)
            return jsonResponse({
              success: true,
              gain: currentGain,
              autoGain: true,
              band: currentBand,
            })
          }
          const gain = body.gain
          if (gain === undefined || gain < 0 || gain > 50) {
            return new Response('Gain must be between 0 and 50', { status: 400 })
          }
          currentGain = gain
          autoGain.setGain(gain)
          bandGainStore.set(currentBand, gain, true)
          logger.info(`SDR gain updated to ${gain} dB for band '${currentBand}'`)
          if (isFFTStreamRunning()) {
            const config = getFFTStreamConfig()
            debouncedFFTStart(config?.frequency || 137500000)
          }
          return jsonResponse({ success: true, gain: currentGain, autoGain: false })
        } catch {
          return new Response('Bad Request', { status: 400 })
        }
      }

      // Stop FFT stream
      if (url.pathname === '/api/fft/stop' && req.method === 'POST') {
        stopFFTStream()
        return jsonResponse({ success: true, running: false })
      }

      // Get notch filters
      if (url.pathname === '/api/fft/notch' && req.method === 'GET') {
        return jsonResponse({ filters: getNotchFilters() })
      }

      // Add notch filter
      if (url.pathname === '/api/fft/notch' && req.method === 'POST') {
        try {
          const body = (await req.json()) as {
            frequency?: number
            width?: number
          }
          const frequency = body.frequency
          const width = body.width || 5000

          if (!frequency || typeof frequency !== 'number') {
            return new Response('frequency required', { status: 400 })
          }

          addNotchFilter(frequency, width)
          return jsonResponse({ success: true, filters: getNotchFilters() })
        } catch {
          return new Response('Bad Request', { status: 400 })
        }
      }

      // Remove notch filter
      if (url.pathname === '/api/fft/notch' && req.method === 'DELETE') {
        try {
          const body = (await req.json()) as { frequency?: number }
          const frequency = body.frequency

          if (!frequency || typeof frequency !== 'number') {
            return new Response('frequency required', { status: 400 })
          }

          const removed = removeNotchFilter(frequency)
          return jsonResponse({ success: removed, filters: getNotchFilters() })
        } catch {
          return new Response('Bad Request', { status: 400 })
        }
      }

      // Toggle notch filter
      if (url.pathname === '/api/fft/notch/toggle' && req.method === 'POST') {
        try {
          const body = (await req.json()) as {
            frequency?: number
            enabled?: boolean
          }
          const frequency = body.frequency
          const enabled = body.enabled

          if (!frequency || typeof frequency !== 'number' || typeof enabled !== 'boolean') {
            return new Response('frequency and enabled required', { status: 400 })
          }

          const updated = setNotchFilterEnabled(frequency, enabled)
          return jsonResponse({ success: updated, filters: getNotchFilters() })
        } catch {
          return new Response('Bad Request', { status: 400 })
        }
      }

      // Clear all notch filters
      if (url.pathname === '/api/fft/notch/clear' && req.method === 'POST') {
        clearNotchFilters()
        return jsonResponse({ success: true, filters: [] })
      }

      return new Response('Not Found', { status: 404 })
    },

    websocket: {
      open(ws) {
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
      },

      close(ws) {
        clients.delete(ws)
        fftSubscribers.delete(ws)
      },

      message(ws, message) {
        try {
          const data = JSON.parse(message.toString()) as { type: string; [key: string]: unknown }

          // Handle FFT subscription
          if (data.type === 'fft_subscribe') {
            fftSubscribers.add(ws)
            logger.debug(`FFT subscriber added, total: ${fftSubscribers.size}`)

            // Auto-start FFT stream if not running and we have subscribers
            // Use debouncing to prevent rapid restart cycles
            if (!isFFTStreamRunning()) {
              const frequency = (data.frequency as number) || 137500000
              debouncedFFTStart(frequency)
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
            setTimeout(() => {
              if (fftSubscribers.size === 0 && isFFTStreamRunning()) {
                stopFFTStream()
              }
            }, 1000)

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
            if (gain !== undefined && gain >= 0 && gain <= 50) {
              currentGain = gain
              autoGain.setGain(gain)
              bandGainStore.set(currentBand, gain, true)
              logger.info(`SDR gain updated via WebSocket to ${gain} dB for band '${currentBand}'`)
              if (isFFTStreamRunning()) {
                const config = getFFTStreamConfig()
                debouncedFFTStart(config?.frequency || 137500000)
              }
              ws.send(JSON.stringify({ type: 'gain_updated', gain: currentGain }))
            }
          }
        } catch {
          // Ignore invalid messages
        }
      },
    },
  })

  // Subscribe to state changes and broadcast to all clients
  stateManager.on('state', (event: StateEvent) => {
    const message = JSON.stringify(event)
    for (const client of clients) {
      try {
        client.send(message)
      } catch {
        clients.delete(client)
      }
    }
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
    pendingFFTStart = null

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
      { frequency, bandwidth: 200000, fftSize: 2048, gain: currentGain, updateRate: 30 },
      broadcastFFTData
    )
    // Check for errors after a short delay (rtl_sdr exits quickly if no device)
    setTimeout(() => {
      const error = getFFTStreamError()
      if (error) {
        broadcastFFTError(error)
      }
    }, 1500)
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
  if (fftSubscribers.size === 0) return

  // Feed auto-gain calibration
  if (autoGain.state.enabled) {
    const result = autoGain.feed(data.bins)
    if (result.action === 'adjusted') {
      currentGain = result.newGain
      bandGainStore.set(currentBand, currentGain, false)
      const config = getFFTStreamConfig()
      debouncedFFTStart(config?.frequency || 137500000)
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

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

async function serveStatic(dir: string, filename: string, contentType: string): Promise<Response> {
  const file = Bun.file(`${dir}/${filename}`)
  if (await file.exists()) {
    return new Response(file, {
      headers: { 'Content-Type': contentType },
    })
  }
  return new Response('Not Found', { status: 404 })
}

async function serveImage(imagesDir: string, filename: string): Promise<Response> {
  // Prevent directory traversal
  if (filename.includes('..')) {
    return new Response('Forbidden', { status: 403 })
  }

  const file = Bun.file(`${imagesDir}/${filename}`)
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  }
  return new Response('Not Found', { status: 404 })
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
