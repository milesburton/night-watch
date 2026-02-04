import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CaptureResult, SatellitePass } from '@backend/types'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CaptureDatabase, closeDatabase, getDatabase, initializeDatabase } from './database'

const createTestPass = (): SatellitePass => ({
  aos: new Date('2024-01-01T12:00:00Z'),
  los: new Date('2024-01-01T12:15:00Z'),
  maxElevation: 45,
  maxElevationTime: new Date('2024-01-01T12:07:30Z'),
  duration: 900,
  satellite: {
    name: 'NOAA 19',
    noradId: 33591,
    frequency: 137.1e6,
    signalType: 'lrpt',
    signalConfig: { type: 'lrpt', bandwidth: 34_000, sampleRate: 48_000, demodulation: 'fm' },
    enabled: true,
  },
})

const createTestResult = (pass: SatellitePass, success = true): CaptureResult => ({
  satellite: pass.satellite,
  recordingPath: '/tmp/test-recording.wav',
  imagePaths: [],
  startTime: pass.aos,
  endTime: pass.los,
  maxSignalStrength: -45.5,
  success,
  error: success ? undefined : 'Test error',
})

describe('CaptureDatabase', () => {
  let db: CaptureDatabase
  let dbPath: string

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`)
    db = new CaptureDatabase(dbPath)
  })

  afterEach(async () => {
    db.close()
    await unlink(dbPath).catch(() => {})
  })

  describe('saveCapture', () => {
    it('should save a successful capture and return an id', () => {
      const pass = createTestPass()
      const result = createTestResult(pass)

      const id = db.saveCapture(result, pass)

      expect(id).toBeGreaterThan(0)
    })

    it('should save a failed capture', () => {
      const pass = createTestPass()
      const result = createTestResult(pass, false)

      const id = db.saveCapture(result, pass)

      expect(id).toBeGreaterThan(0)
    })
  })

  describe('saveImages', () => {
    it('should save image paths for a capture', () => {
      const pass = createTestPass()
      const result = createTestResult(pass)
      const captureId = db.saveCapture(result, pass)

      db.saveImages(captureId, ['/images/test-chA.png', '/images/test-chB.png', '/images/test.png'])

      const captures = db.getRecentCaptures()
      expect(captures[0]?.imagePaths).toHaveLength(3)
    })

    it('should detect channel A images', () => {
      const pass = createTestPass()
      const result = createTestResult(pass)
      const captureId = db.saveCapture(result, pass)

      db.saveImages(captureId, ['/images/test-chA.png'])

      const captures = db.getRecentCaptures()
      expect(captures[0]?.imagePaths).toContain('/images/test-chA.png')
    })
  })

  describe('getRecentCaptures', () => {
    it('should return empty array when no captures', () => {
      const captures = db.getRecentCaptures()
      expect(captures).toHaveLength(0)
    })

    it('should return captures in descending order', () => {
      const pass1 = createTestPass()
      const pass2 = {
        ...createTestPass(),
        aos: new Date('2024-01-02T12:00:00Z'),
        los: new Date('2024-01-02T12:15:00Z'),
      }

      db.saveCapture(createTestResult(pass1), pass1)
      db.saveCapture(createTestResult(pass2), pass2)

      const captures = db.getRecentCaptures()
      expect(captures).toHaveLength(2)
    })

    it('should respect limit parameter', () => {
      const pass = createTestPass()
      for (let i = 0; i < 5; i++) {
        const p = { ...pass, aos: new Date(pass.aos.getTime() + i * 1_000) }
        db.saveCapture(createTestResult(p), p)
      }

      const captures = db.getRecentCaptures(2)
      expect(captures).toHaveLength(2)
    })

    it('should respect offset parameter', () => {
      const pass = createTestPass()
      for (let i = 0; i < 5; i++) {
        const p = { ...pass, aos: new Date(pass.aos.getTime() + i * 1_000) }
        db.saveCapture(createTestResult(p), p)
      }

      const captures = db.getRecentCaptures(10, 3)
      expect(captures).toHaveLength(2)
    })
  })

  describe('getCaptureSummary', () => {
    it('should return zeros when no captures', () => {
      const summary = db.getCaptureSummary()
      expect(summary).toEqual({ total: 0, successful: 0, failed: 0 })
    })

    it('should count successful and failed captures', () => {
      const pass = createTestPass()
      db.saveCapture(createTestResult(pass, true), pass)
      db.saveCapture(createTestResult({ ...pass, aos: new Date('2024-01-02T12:00:00Z') }, true), {
        ...pass,
        aos: new Date('2024-01-02T12:00:00Z'),
      })
      db.saveCapture(createTestResult({ ...pass, aos: new Date('2024-01-03T12:00:00Z') }, false), {
        ...pass,
        aos: new Date('2024-01-03T12:00:00Z'),
      })

      const summary = db.getCaptureSummary()
      expect(summary.total).toBe(3)
      expect(summary.successful).toBe(2)
      expect(summary.failed).toBe(1)
    })
  })
})

describe('database singleton', () => {
  let dbPath: string

  beforeEach(() => {
    closeDatabase()
    dbPath = join(tmpdir(), `test-singleton-${Date.now()}.sqlite`)
  })

  afterEach(async () => {
    closeDatabase()
    await unlink(dbPath).catch(() => {})
  })

  it('should throw when getDatabase called before initialization', () => {
    expect(() => getDatabase()).toThrow('Database not initialized')
  })

  it('should initialize and return database instance', async () => {
    const db = await initializeDatabase(dbPath)
    expect(db).toBeInstanceOf(CaptureDatabase)
  })

  it('should return same instance on repeated calls', async () => {
    const db1 = await initializeDatabase(dbPath)
    const db2 = await initializeDatabase(dbPath)
    expect(db1).toBe(db2)
  })

  it('should allow getDatabase after initialization', async () => {
    await initializeDatabase(dbPath)
    const db = getDatabase()
    expect(db).toBeInstanceOf(CaptureDatabase)
  })
})
