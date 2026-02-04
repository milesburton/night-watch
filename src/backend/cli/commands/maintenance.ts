#!/usr/bin/env bun
/**
 * Maintenance script for retroactive decoding and cleanup
 *
 * Usage:
 *   bun run src/backend/cli/commands/maintenance.ts --decode   # Decode existing WAV files
 *   bun run src/backend/cli/commands/maintenance.ts --cleanup  # Clean up failed recordings
 *   bun run src/backend/cli/commands/maintenance.ts --all      # Do both
 */

import { readdir, stat, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import '@backend/capture/decoders' // Register decoders
import { getDecoder } from '@backend/capture/decoders/registry'
import { loadConfig } from '@backend/config/config'
import { getDatabase, initializeDatabase } from '@backend/db/database'
import type { SatelliteInfo } from '@backend/types'
import { logger } from '@backend/utils/logger'

interface WavFileInfo {
  path: string
  name: string
  size: number
  satellite: string
  timestamp: Date
}

/**
 * Parse satellite name and timestamp from WAV filename
 * Format: SATELLITE_YYYY-MM-DDTHH-MM-SS.wav
 */
function parseWavFilename(filename: string): { satellite: string; timestamp: Date } | null {
  // Match: NOAA-15_2026-02-03T07-05-39.wav or ISS_2026-02-03T13-56-39.wav
  const match = filename.match(/^(.+?)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.wav$/)
  if (!match) return null

  const satellite = match[1]
  const dateStr = match[2]
  if (!satellite || !dateStr) return null

  const timestamp = new Date(dateStr.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3'))

  return { satellite, timestamp }
}

/**
 * Scan recordings directory and get info about all WAV files
 */
async function scanRecordings(recordingsDir: string): Promise<WavFileInfo[]> {
  try {
    const files = await readdir(recordingsDir)
    const wavFiles = files.filter((f) => f.endsWith('.wav'))

    const fileInfos: WavFileInfo[] = []
    for (const file of wavFiles) {
      const filePath = join(recordingsDir, file)
      const stats = await stat(filePath)
      const parsed = parseWavFilename(file)

      if (parsed) {
        fileInfos.push({
          path: filePath,
          name: file,
          size: stats.size,
          satellite: parsed.satellite,
          timestamp: parsed.timestamp,
        })
      }
    }

    return fileInfos
  } catch (error) {
    logger.error(`Failed to scan recordings directory: ${error}`)
    return []
  }
}

/**
 * Find recordings that exist but aren't in the database
 */
async function findMissingRecordings(
  recordings: WavFileInfo[],
  minSize = 1_000_000 // 1MB minimum
): Promise<WavFileInfo[]> {
  const db = getDatabase()

  return recordings.filter((recording) => {
    // Skip tiny files (failed recordings)
    if (recording.size < minSize) return false

    // Check if recording path exists in database
    const allCaptures = db.getRecentCaptures(1000)
    const existing = allCaptures.find((c) => c.recordingPath?.includes(recording.name))

    return !existing
  })
}

/**
 * Find recordings with no decoded images
 */
async function findUndecodedRecordings(
  recordings: WavFileInfo[],
  minSize = 1_000_000
): Promise<WavFileInfo[]> {
  const db = getDatabase()

  return recordings.filter((recording) => {
    if (recording.size < minSize) return false

    // Get all recent captures to check if this recording has images
    const allCaptures = db.getRecentCaptures(1000)
    const capture = allCaptures.find((c) => c.recordingPath?.includes(recording.name))

    return capture && (!capture.imagePaths || capture.imagePaths.length === 0)
  })
}

/**
 * Attempt to decode a recording retroactively
 */
async function decodeRecording(
  recording: WavFileInfo,
  config: ReturnType<typeof loadConfig>
): Promise<{ success: boolean; imagePaths: string[] }> {
  try {
    // Determine signal type from satellite name
    const signalType = recording.satellite.startsWith('METEOR') ? 'lrpt' : 'sstv'
    const decoder = getDecoder(signalType)

    if (!decoder) {
      logger.warn(`No decoder available for ${signalType}`)
      return { success: false, imagePaths: [] }
    }

    logger.info(`Decoding ${recording.name} (${(recording.size / 1_000_000).toFixed(1)}MB)...`)

    const result = await decoder.decode(recording.path, config.recording.imagesDir)

    if (result && result.outputPaths.length > 0) {
      logger.info(`✓ Decoded ${result.outputPaths.length} images from ${recording.name}`)
      return { success: true, imagePaths: result.outputPaths }
    }

    logger.warn(`✗ Failed to decode ${recording.name}`)
    return { success: false, imagePaths: [] }
  } catch (error) {
    logger.error(`Error decoding ${recording.name}: ${error}`)
    return { success: false, imagePaths: [] }
  }
}

/**
 * Add retroactively decoded images to the database
 */
async function addImagesToDatabase(recordingName: string, imagePaths: string[]): Promise<void> {
  const db = getDatabase()

  // Find the capture ID for this recording
  const allCaptures = db.getRecentCaptures(1000)
  const capture = allCaptures.find((c) => c.recordingPath?.includes(recordingName))

  if (!capture) {
    logger.warn(`No database entry found for ${recordingName}`)
    return
  }

  // Add images to the database using the public method
  db.saveImages(capture.id, imagePaths)

  logger.info(`Added ${imagePaths.length} images to database for ${recordingName}`)
}

/**
 * Clean up small/failed recording files
 */
async function cleanupFailedRecordings(
  recordings: WavFileInfo[],
  maxSize = 10_000 // 10KB - definitely failed
): Promise<number> {
  let deletedCount = 0

  for (const recording of recordings) {
    if (recording.size <= maxSize) {
      try {
        await unlink(recording.path)
        logger.info(`Deleted failed recording: ${recording.name} (${recording.size} bytes)`)
        deletedCount++
      } catch (error) {
        logger.error(`Failed to delete ${recording.name}: ${error}`)
      }
    }
  }

  return deletedCount
}

/**
 * Main maintenance routine
 */
export async function runMaintenance(options: {
  decode?: boolean
  cleanup?: boolean
}): Promise<void> {
  const config = loadConfig()

  // Initialize database
  initializeDatabase(config.database.path)

  const recordings = await scanRecordings(config.recording.recordingsDir)

  logger.info(`Found ${recordings.length} WAV files in recordings directory`)

  // Decode existing recordings
  if (options.decode) {
    logger.info('\n=== Retroactive Decoding ===')

    // Find recordings not in database
    const missing = await findMissingRecordings(recordings)
    logger.info(`Found ${missing.length} recordings not in database`)

    // Find recordings with no images
    const undecoded = await findUndecodedRecordings(recordings)
    logger.info(`Found ${undecoded.length} recordings without decoded images`)

    // Decode missing recordings
    for (const recording of undecoded) {
      const result = await decodeRecording(recording, config)
      if (result.success && result.imagePaths.length > 0) {
        await addImagesToDatabase(recording.name, result.imagePaths)
      }
    }

    logger.info(`\n✓ Decoded ${undecoded.filter((r) => r.size > 1_000_000).length} recordings`)
  }

  // Clean up failed recordings
  if (options.cleanup) {
    logger.info('\n=== Cleanup Failed Recordings ===')

    const failedRecordings = recordings.filter((r) => r.size <= 10_000)
    logger.info(`Found ${failedRecordings.length} small/failed recordings to clean up`)

    const deleted = await cleanupFailedRecordings(failedRecordings)
    logger.info(`\n✓ Deleted ${deleted} failed recording files`)
  }

  logger.info('\n✓ Maintenance complete')
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2)
  const shouldDecode = args.includes('--decode') || args.includes('--all')
  const shouldCleanup = args.includes('--cleanup') || args.includes('--all')

  if (!shouldDecode && !shouldCleanup) {
    console.log('Usage:')
    console.log(
      '  bun run src/backend/cli/commands/maintenance.ts --decode   # Decode existing WAV files'
    )
    console.log(
      '  bun run src/backend/cli/commands/maintenance.ts --cleanup  # Clean up failed recordings'
    )
    console.log('  bun run src/backend/cli/commands/maintenance.ts --all      # Do both')
    process.exit(1)
  }

  runMaintenance({
    decode: shouldDecode,
    cleanup: shouldCleanup,
  })
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(`Maintenance failed: ${error}`)
      process.exit(1)
    })
}
