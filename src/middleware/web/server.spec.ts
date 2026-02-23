import type { EventEmitter } from 'node:events'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

// ── Hoist vi.fn() mocks so vi.mock factories can reference them ───────────────
// vi.hoisted() runs before any imports, so EventEmitter must be require()'d.

const {
  mockStateEmitter,
  mockGetState,
  mockIsFFTStreamRunning,
  mockStartFFTStream,
  mockStopFFTStream,
  mockGetFFTStreamConfig,
  mockGetFFTStreamError,
  mockGetNotchFilters,
} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('node:events') as typeof import('node:events')
  const emitter = new EE()
  emitter.setMaxListeners(50)
  return {
    mockStateEmitter: emitter as EventEmitter,
    mockGetState: vi.fn(),
    mockIsFFTStreamRunning: vi.fn(),
    mockStartFFTStream: vi.fn(),
    mockStopFFTStream: vi.fn(),
    mockGetFFTStreamConfig: vi.fn(),
    mockGetFFTStreamError: vi.fn(),
    mockGetNotchFilters: vi.fn(),
  }
})

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@backend/state/state-manager', () => ({
  stateManager: Object.assign(mockStateEmitter, { getState: mockGetState }),
}))

vi.mock('@backend/capture/fft-stream', () => ({
  isFFTStreamRunning: mockIsFFTStreamRunning,
  startFFTStream: mockStartFFTStream,
  stopFFTStream: mockStopFFTStream,
  getFFTStreamConfig: mockGetFFTStreamConfig,
  getFFTStreamError: mockGetFFTStreamError,
  getNotchFilters: mockGetNotchFilters,
  addNotchFilter: vi.fn(),
  removeNotchFilter: vi.fn(() => true),
  setNotchFilterEnabled: vi.fn(() => true),
  clearNotchFilters: vi.fn(),
}))

vi.mock('@backend/db/database', () => ({
  getDatabase: vi.fn(() => ({
    getRecentCaptures: vi.fn(() => []),
    getCaptureSummary: vi.fn(() => ({ total: 0, successful: 0, failed: 0 })),
  })),
}))

vi.mock('@backend/satellites/events', () => ({
  getSstvStatus: vi.fn(() => ({ manualEnabled: false, groundScanEnabled: false, status: 'idle' })),
  setManualSstvEnabled: vi.fn(),
  setGroundSstvScanEnabled: vi.fn(),
}))

vi.mock('@backend/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    satellite: vi.fn(),
    capture: vi.fn(),
  },
}))

vi.mock('@backend/utils/node-compat', () => ({
  fileExists: vi.fn(() => false),
  getDirname: vi.fn(() => '/tmp'),
  readFileText: vi.fn(() => Promise.resolve('{}')),
}))

vi.mock('./globe-service', () => ({
  getGlobeState: vi.fn(() => null),
}))

// ── Import server after mocks ─────────────────────────────────────────────────

import { startWebServer } from './server'

// ── Shared test state ─────────────────────────────────────────────────────────

const mockSystemState = {
  status: 'idle' as const,
  currentPass: null,
  nextPass: null,
  upcomingPasses: [],
  captureProgress: 0,
  captureElapsed: 0,
  captureTotal: 0,
  lastUpdate: new Date(),
  scanningFrequency: undefined as number | undefined,
  scanningFrequencyName: undefined as string | undefined,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function get(port: number, path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

async function post(
  port: number,
  path: string,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const responseBody = await res.json().catch(() => null)
  return { status: res.status, body: responseBody }
}

/**
 * A buffering WebSocket wrapper that captures messages before listeners are attached.
 * The server sends `init` immediately on connection, which can arrive before `open`
 * fires on the client — so we must buffer messages from the start.
 */
class BufferedWs {
  readonly ws: WebSocket
  private readonly buffer: unknown[] = []
  private readonly waiters: Array<(msg: unknown) => void> = []

  constructor(ws: WebSocket) {
    this.ws = ws
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      const waiter = this.waiters.shift()
      if (waiter) {
        waiter(msg)
      } else {
        this.buffer.push(msg)
      }
    })
  }

  send(data: string): void {
    this.ws.send(data)
  }

  next(timeoutMs = 2000): Promise<unknown> {
    if (this.buffer.length > 0) {
      return Promise.resolve(this.buffer.shift())
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(resolve)
        if (idx !== -1) this.waiters.splice(idx, 1)
        reject(new Error('Timeout waiting for WS message'))
      }, timeoutMs)
      this.waiters.push((msg) => {
        clearTimeout(timer)
        resolve(msg)
      })
    })
  }

  waitFor(predicate: (msg: unknown) => boolean, timeoutMs = 2000): Promise<unknown> {
    const deadline = Date.now() + timeoutMs
    const tryNext = (): Promise<unknown> =>
      this.next(Math.max(0, deadline - Date.now())).then((msg) =>
        predicate(msg) ? msg : tryNext()
      )
    return tryNext()
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) {
        resolve()
        return
      }
      this.ws.once('close', () => resolve())
      this.ws.close()
    })
  }
}

function connectWs(port: number): Promise<BufferedWs> {
  return new Promise((resolve, reject) => {
    const raw = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    // Create the BufferedWs immediately so message listeners are attached
    // before `open` fires (the server may send `init` right on connection).
    const bws = new BufferedWs(raw)
    raw.once('open', () => resolve(bws))
    raw.once('error', reject)
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('startWebServer', () => {
  let port: number
  let closeServer: () => Promise<void>
  // Track all WS connections so we can clean them up before closing the server
  const openSockets: BufferedWs[] = []

  async function ws(p: number): Promise<BufferedWs> {
    const sock = await connectWs(p)
    openSockets.push(sock)
    return sock
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    mockIsFFTStreamRunning.mockReturnValue(false)
    mockGetFFTStreamConfig.mockReturnValue(null)
    mockGetFFTStreamError.mockReturnValue(null)
    mockGetNotchFilters.mockReturnValue([])
    mockGetState.mockReturnValue({ ...mockSystemState })
    mockStartFFTStream.mockResolvedValue(true)
    mockStopFFTStream.mockResolvedValue(undefined)
    openSockets.length = 0

    // startWebServer calls server.listen internally
    const server = startWebServer(0, '127.0.0.1', '/tmp/images')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    port = (server.address() as AddressInfo).port

    closeServer = async () => {
      // Close all open WebSocket connections first — otherwise server.close hangs
      await Promise.all(openSockets.map((s) => s.close()))
      openSockets.length = 0
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
    }
  })

  afterEach(async () => {
    await closeServer()
  })

  // ── HTTP API ──────────────────────────────────────────────────────────────

  describe('GET /api/status', () => {
    it('returns current system state', async () => {
      const { status, body } = await get(port, '/api/status')
      expect(status).toBe(200)
      expect(body).toMatchObject({ status: 'idle' })
    })
  })

  describe('GET /api/passes', () => {
    it('returns upcoming passes array', async () => {
      const { status, body } = await get(port, '/api/passes')
      expect(status).toBe(200)
      expect(body).toEqual([])
    })
  })

  describe('GET /api/captures', () => {
    it('returns empty captures list', async () => {
      const { status, body } = await get(port, '/api/captures')
      expect(status).toBe(200)
      expect(body).toEqual([])
    })
  })

  describe('GET /api/summary', () => {
    it('returns capture summary', async () => {
      const { status, body } = await get(port, '/api/summary')
      expect(status).toBe(200)
      expect(body).toMatchObject({ total: 0, successful: 0, failed: 0 })
    })
  })

  describe('GET /api/fft/status', () => {
    it('returns FFT stream status', async () => {
      const { status, body } = await get(port, '/api/fft/status')
      expect(status).toBe(200)
      expect(body).toMatchObject({ running: false, subscribers: 0 })
    })
  })

  describe('POST /api/fft/stop', () => {
    it('stops the FFT stream and returns success', async () => {
      const { status, body } = await post(port, '/api/fft/stop', {})
      expect(status).toBe(200)
      expect(body).toMatchObject({ success: true, running: false })
      expect(mockStopFFTStream).toHaveBeenCalled()
    })
  })

  describe('GET /api/sstv/status', () => {
    it('returns SSTV status', async () => {
      const { status, body } = await get(port, '/api/sstv/status')
      expect(status).toBe(200)
      expect(body).toMatchObject({ status: 'idle' })
    })
  })

  describe('GET /api/fft/notch', () => {
    it('returns notch filters list', async () => {
      const { status, body } = await get(port, '/api/fft/notch')
      expect(status).toBe(200)
      expect(body).toMatchObject({ filters: [] })
    })
  })

  describe('POST /api/config/gain', () => {
    it('rejects gain below 0', async () => {
      const { status } = await post(port, '/api/config/gain', { gain: -1 })
      expect(status).toBe(400)
    })

    it('rejects gain above 49', async () => {
      const { status } = await post(port, '/api/config/gain', { gain: 50 })
      expect(status).toBe(400)
    })

    it('accepts valid gain in range', async () => {
      const { status, body } = await post(port, '/api/config/gain', { gain: 30 })
      expect(status).toBe(200)
      expect(body).toMatchObject({ success: true, gain: 30 })
    })
  })

  describe('unknown route', () => {
    it('returns 404', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/does-not-exist`)
      expect(res.status).toBe(404)
    })
  })

  describe('image path traversal prevention', () => {
    it('blocks directory traversal in /api/images/', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/images/..%2Fetc%2Fpasswd`)
      expect(res.status).toBe(403)
    })
  })

  // ── WebSocket ─────────────────────────────────────────────────────────────

  describe('WebSocket connection', () => {
    it('sends init message on connect containing state and fft info', async () => {
      const sock = await ws(port)
      const msg = (await sock.next()) as { type: string; state: unknown; fft: unknown }

      expect(msg.type).toBe('init')
      expect(msg.state).toMatchObject({ status: 'idle' })
      expect(msg.fft).toMatchObject({ running: false })
    })

    it('rejects WebSocket upgrade to non-/ws paths', async () => {
      const raw = new WebSocket(`ws://127.0.0.1:${port}/other`)
      await expect(
        new Promise<void>((_, reject) => {
          raw.once('error', reject)
          raw.once('unexpected-response', () => reject(new Error('unexpected-response')))
          raw.once('close', (code) => {
            if (code !== 1000) reject(new Error(`closed with code ${code}`))
          })
        })
      ).rejects.toBeDefined()
    })
  })

  describe('fft_subscribe message', () => {
    it('responds with fft_subscribed', async () => {
      const sock = await ws(port)
      await sock.next() // consume init

      sock.send(JSON.stringify({ type: 'fft_subscribe', frequency: 137_500_000 }))
      const msg = (await sock.waitFor(
        (m: unknown) => (m as { type: string }).type === 'fft_subscribed'
      )) as { type: string; running: boolean }

      expect(msg.type).toBe('fft_subscribed')
      expect(msg.running).toBe(false)
    })

    it('starts FFT stream when idle and stream is not running', async () => {
      mockGetState.mockReturnValue({ ...mockSystemState, status: 'idle' })
      mockIsFFTStreamRunning.mockReturnValue(false)

      const sock = await ws(port)
      await sock.next()
      sock.send(JSON.stringify({ type: 'fft_subscribe', frequency: 137_500_000 }))
      await sock.waitFor((m: unknown) => (m as { type: string }).type === 'fft_subscribed')

      // Wait for debounce (500ms) to fire
      await new Promise((r) => setTimeout(r, 700))

      expect(mockStartFFTStream).toHaveBeenCalled()
    })

    it('does not start FFT stream when status is capturing', async () => {
      mockGetState.mockReturnValue({ ...mockSystemState, status: 'capturing' })
      mockIsFFTStreamRunning.mockReturnValue(false)

      const sock = await ws(port)
      await sock.next()
      sock.send(JSON.stringify({ type: 'fft_subscribe', frequency: 137_500_000 }))
      await sock.waitFor((m: unknown) => (m as { type: string }).type === 'fft_subscribed')

      await new Promise((r) => setTimeout(r, 700))

      expect(mockStartFFTStream).not.toHaveBeenCalled()
    })

    it('does not start FFT stream when status is decoding', async () => {
      mockGetState.mockReturnValue({ ...mockSystemState, status: 'decoding' })
      mockIsFFTStreamRunning.mockReturnValue(false)

      const sock = await ws(port)
      await sock.next()
      sock.send(JSON.stringify({ type: 'fft_subscribe', frequency: 137_500_000 }))
      await sock.waitFor((m: unknown) => (m as { type: string }).type === 'fft_subscribed')

      await new Promise((r) => setTimeout(r, 700))

      expect(mockStartFFTStream).not.toHaveBeenCalled()
    })
  })

  describe('fft_unsubscribe message', () => {
    it('responds with fft_unsubscribed', async () => {
      const sock = await ws(port)
      await sock.next()

      sock.send(JSON.stringify({ type: 'fft_subscribe', frequency: 137_500_000 }))
      await sock.waitFor((m: unknown) => (m as { type: string }).type === 'fft_subscribed')

      sock.send(JSON.stringify({ type: 'fft_unsubscribe' }))
      const msg = (await sock.waitFor(
        (m: unknown) => (m as { type: string }).type === 'fft_unsubscribed'
      )) as { type: string }

      expect(msg.type).toBe('fft_unsubscribed')
    })
  })

  // ── State event broadcasting ──────────────────────────────────────────────

  describe('state event broadcasting', () => {
    it('broadcasts state events to all connected clients', async () => {
      const sock = await ws(port)
      await sock.next() // consume init

      const msgPromise = sock.waitFor(
        (m: unknown) => (m as { type: string }).type === 'status_change'
      )
      mockStateEmitter.emit('state', { type: 'status_change', status: 'capturing' })

      const msg = (await msgPromise) as { type: string; status: string }

      expect(msg.type).toBe('status_change')
      expect(msg.status).toBe('capturing')
    })

    it('broadcasts to multiple connected clients', async () => {
      const sock1 = await ws(port)
      const sock2 = await ws(port)
      await sock1.next()
      await sock2.next()

      const p1 = sock1.waitFor((m: unknown) => (m as { type: string }).type === 'status_change')
      const p2 = sock2.waitFor((m: unknown) => (m as { type: string }).type === 'status_change')

      mockStateEmitter.emit('state', { type: 'status_change', status: 'decoding' })

      const [msg1, msg2] = await Promise.all([p1, p2])

      expect((msg1 as { status: string }).status).toBe('decoding')
      expect((msg2 as { status: string }).status).toBe('decoding')
    })
  })

  // ── FFT stream lifecycle via state events ─────────────────────────────────

  describe('FFT stream lifecycle (state events)', () => {
    it('stops FFT stream on pass_start when stream is running', async () => {
      mockIsFFTStreamRunning.mockReturnValue(true)

      mockStateEmitter.emit('state', { type: 'pass_start', pass: {} })
      await new Promise((r) => setTimeout(r, 20))

      expect(mockStopFFTStream).toHaveBeenCalled()
    })

    it('does not stop FFT stream on pass_start when stream is already stopped', async () => {
      mockIsFFTStreamRunning.mockReturnValue(false)

      mockStateEmitter.emit('state', { type: 'pass_start', pass: {} })
      await new Promise((r) => setTimeout(r, 20))

      expect(mockStopFFTStream).not.toHaveBeenCalled()
    })

    it('restarts FFT stream on status → idle when subscribers present and stream stopped', async () => {
      // Subscribe a client first
      const sock = await ws(port)
      await sock.next()
      sock.send(JSON.stringify({ type: 'fft_subscribe', frequency: 137_500_000 }))
      await sock.waitFor((m: unknown) => (m as { type: string }).type === 'fft_subscribed')

      // Wait for the subscribe-triggered debounced start to fire, then reset
      await new Promise((r) => setTimeout(r, 700))
      mockStartFFTStream.mockClear()

      // Simulate stream having been stopped during capture
      mockIsFFTStreamRunning.mockReturnValue(false)
      mockGetFFTStreamConfig.mockReturnValue({
        frequency: 137_500_000,
        bandwidth: 200_000,
        fftSize: 2_048,
        gain: 20,
        updateRate: 30,
      })

      mockStateEmitter.emit('state', { type: 'status_change', status: 'idle' })

      // Wait for debounce (500ms) + handler
      await new Promise((r) => setTimeout(r, 700))

      expect(mockStartFFTStream).toHaveBeenCalledWith(
        expect.objectContaining({ frequency: 137_500_000 }),
        expect.any(Function)
      )
    })

    it('does not restart FFT stream on idle when no subscribers', async () => {
      mockIsFFTStreamRunning.mockReturnValue(false)

      mockStateEmitter.emit('state', { type: 'status_change', status: 'idle' })
      await new Promise((r) => setTimeout(r, 700))

      expect(mockStartFFTStream).not.toHaveBeenCalled()
    })

    it('does not restart FFT stream on idle when stream is already running', async () => {
      const sock = await ws(port)
      await sock.next()
      sock.send(JSON.stringify({ type: 'fft_subscribe', frequency: 137_500_000 }))
      await sock.waitFor((m: unknown) => (m as { type: string }).type === 'fft_subscribed')

      // Wait for debounced start to fire, then reset
      await new Promise((r) => setTimeout(r, 700))
      mockStartFFTStream.mockClear()

      // Stream is already running — should not restart
      mockIsFFTStreamRunning.mockReturnValue(true)

      mockStateEmitter.emit('state', { type: 'status_change', status: 'idle' })
      await new Promise((r) => setTimeout(r, 700))

      expect(mockStartFFTStream).not.toHaveBeenCalled()
    })

    it('does not restart FFT stream on non-idle status changes', async () => {
      const sock = await ws(port)
      await sock.next()
      sock.send(JSON.stringify({ type: 'fft_subscribe' }))
      await sock.waitFor((m: unknown) => (m as { type: string }).type === 'fft_subscribed')

      // Wait for debounced start, then reset
      await new Promise((r) => setTimeout(r, 700))
      mockStartFFTStream.mockClear()
      mockIsFFTStreamRunning.mockReturnValue(false)

      mockStateEmitter.emit('state', { type: 'status_change', status: 'capturing' })
      mockStateEmitter.emit('state', { type: 'status_change', status: 'decoding' })
      mockStateEmitter.emit('state', { type: 'status_change', status: 'scanning' })

      await new Promise((r) => setTimeout(r, 700))

      expect(mockStartFFTStream).not.toHaveBeenCalled()
    })
  })
})
