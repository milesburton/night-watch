import { Database } from 'bun:sqlite'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CaptureHistoryEntry, CaptureResult, SatellitePass, SignalType } from '@backend/types'

export class CaptureDatabase {
  private db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true })
    this.db.exec('PRAGMA journal_mode = WAL')
    this.initialize()
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS captures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pass_id TEXT UNIQUE NOT NULL,
        satellite_name TEXT NOT NULL,
        satellite_norad_id INTEGER NOT NULL,
        frequency INTEGER NOT NULL,
        signal_type TEXT NOT NULL DEFAULT 'lrpt',
        aos_time TEXT NOT NULL,
        los_time TEXT NOT NULL,
        max_elevation REAL NOT NULL,
        duration_seconds INTEGER NOT NULL,
        recording_path TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        max_signal_strength REAL,
        success INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    this.migrateIfNeeded()

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capture_id INTEGER NOT NULL,
        image_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_captures_satellite ON captures(satellite_name)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_captures_success ON captures(success)
    `)
  }

  private migrateIfNeeded(): void {
    const columns = this.db.query<{ name: string }, []>('PRAGMA table_info(captures)').all()
    const hasSignalType = columns.some((c) => c.name === 'signal_type')
    if (!hasSignalType) {
      this.db.exec(`ALTER TABLE captures ADD COLUMN signal_type TEXT NOT NULL DEFAULT 'lrpt'`)
    }
  }

  saveCapture(result: CaptureResult, pass: SatellitePass): number {
    const passId = this.generatePassId(pass)

    const stmt = this.db.prepare(`
      INSERT INTO captures (
        pass_id, satellite_name, satellite_norad_id, frequency, signal_type,
        aos_time, los_time, max_elevation, duration_seconds,
        recording_path, start_time, end_time, max_signal_strength,
        success, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      passId,
      result.satellite.name,
      result.satellite.noradId,
      result.satellite.frequency,
      result.satellite.signalType,
      pass.aos.toISOString(),
      pass.los.toISOString(),
      pass.maxElevation,
      Math.ceil(pass.duration),
      result.recordingPath || null,
      result.startTime.toISOString(),
      result.endTime.toISOString(),
      result.maxSignalStrength,
      result.success ? 1 : 0,
      result.error || null
    )

    const lastId = this.db.query<{ id: number }, []>('SELECT last_insert_rowid() as id').get()
    return lastId?.id ?? 0
  }

  saveImages(captureId: number, imagePaths: string[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO images (capture_id, image_type, file_path)
      VALUES (?, ?, ?)
    `)

    for (const path of imagePaths) {
      const imageType = path.includes('-chA')
        ? 'channelA'
        : path.includes('-chB')
          ? 'channelB'
          : 'composite'
      stmt.run(captureId, imageType, path)
    }
  }

  getRecentCaptures(limit = 50, offset = 0): CaptureHistoryEntry[] {
    const rows = this.db
      .query<
        {
          id: number
          pass_id: string
          satellite_name: string
          satellite_norad_id: number
          frequency: number
          signal_type: string
          aos_time: string
          los_time: string
          max_elevation: number
          duration_seconds: number
          recording_path: string | null
          start_time: string
          end_time: string | null
          max_signal_strength: number | null
          success: number
          error_message: string | null
          created_at: string
          image_paths: string | null
        },
        [number, number]
      >(
        `
      SELECT c.*, GROUP_CONCAT(i.file_path) as image_paths
      FROM captures c
      LEFT JOIN images i ON c.id = i.capture_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(limit, offset)

    return rows.map((row) => ({
      id: row.id,
      passId: row.pass_id,
      satelliteName: row.satellite_name,
      satelliteNoradId: row.satellite_norad_id,
      frequency: row.frequency,
      signalType: (row.signal_type || 'lrpt') as SignalType,
      aosTime: row.aos_time,
      losTime: row.los_time,
      maxElevation: row.max_elevation,
      durationSeconds: row.duration_seconds,
      recordingPath: row.recording_path,
      startTime: row.start_time,
      endTime: row.end_time,
      maxSignalStrength: row.max_signal_strength,
      success: row.success === 1,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      imagePaths: row.image_paths ? row.image_paths.split(',') : [],
    }))
  }

  getCaptureSummary(): { total: number; successful: number; failed: number } {
    const row = this.db
      .query<{ total: number; successful: number | null; failed: number | null }, []>(
        `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
      FROM captures
    `
      )
      .get()

    return {
      total: row?.total ?? 0,
      successful: row?.successful ?? 0,
      failed: row?.failed ?? 0,
    }
  }

  private generatePassId(pass: SatellitePass): string {
    const timestamp = pass.aos.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const safeName = pass.satellite.name.replace(/\s+/g, '-')
    return `${safeName}_${timestamp}`
  }

  close(): void {
    this.db.close()
  }
}

// Singleton instance - initialized lazily
let databaseInstance: CaptureDatabase | null = null

export async function initializeDatabase(dbPath: string): Promise<CaptureDatabase> {
  if (databaseInstance) {
    return databaseInstance
  }

  // Ensure directory exists
  const dir = dirname(dbPath)
  await mkdir(dir, { recursive: true })

  databaseInstance = new CaptureDatabase(dbPath)
  return databaseInstance
}

export function getDatabase(): CaptureDatabase {
  if (!databaseInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return databaseInstance
}

export function closeDatabase(): void {
  if (databaseInstance) {
    databaseInstance.close()
    databaseInstance = null
  }
}
