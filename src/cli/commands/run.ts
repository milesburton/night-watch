import chalk from 'chalk'
import { loadConfig } from '../../config/config'
import { closeDatabase, initializeDatabase } from '../../db/database'
import { filterHighQualityPasses, formatPassesTable, predictPasses } from '../../prediction/passes'
import { SATELLITES } from '../../satellites/constants'
import { isSstvActive, setManualSstvEnabled } from '../../satellites/events'
import { getTles } from '../../satellites/tle'
import { runScheduler } from '../../scheduler/scheduler'
import { stateManager } from '../../state/state-manager'
import { ensureDir } from '../../utils/fs'
import { logger } from '../../utils/logger'
import { checkDependencies } from '../../utils/shell'
import { startGlobeService, stopGlobeService } from '../../web/globe-service'
import { startWebServer } from '../../web/server'

const REQUIRED_COMMANDS = ['rtl_fm', 'rtl_power', 'sox']
const OPTIONAL_COMMANDS = ['aptdec', 'sstv']

export async function runCommand(_args: string[]): Promise<void> {
  console.log(chalk.bold.cyan('\n  RFCapture - Multi-Signal RF Capture System\n'))

  const config = loadConfig()
  logger.setLevel(config.logLevel)

  logger.info(
    `Station location: ${config.station.latitude.toFixed(4)}°N, ${config.station.longitude.toFixed(4)}°E`
  )

  // Initialize ISS SSTV mode from config
  if (config.issSstvEnabled) {
    setManualSstvEnabled(true)
    logger.info('ISS SSTV capture enabled by default')
  }

  // Ensure directories exist
  await ensureDir(config.recording.recordingsDir)
  await ensureDir(config.recording.imagesDir)

  // Initialize database
  logger.info('Initializing database...')
  await initializeDatabase(config.database.path)

  // Check dependencies
  logger.info('Checking dependencies...')
  const deps = await checkDependencies(REQUIRED_COMMANDS)
  const missing = [...deps.entries()].filter(([_, exists]) => !exists).map(([cmd]) => cmd)

  if (missing.length > 0) {
    logger.error(`Missing dependencies: ${missing.join(', ')}`)
    logger.info('Please install: sudo apt install rtl-sdr sox')
    process.exit(1)
  }

  const optionalDeps = await checkDependencies(OPTIONAL_COMMANDS)
  for (const [cmd, exists] of optionalDeps) {
    if (!exists) {
      logger.warn(`Optional decoder '${cmd}' not found - some signal types may not decode`)
    }
  }

  // Start web server
  const server = startWebServer(config.web.port, config.web.host, config.recording.imagesDir)
  logger.info(`Web dashboard running at http://${config.web.host}:${config.web.port}`)

  // Start globe service for real-time satellite positions
  await startGlobeService(config.station)

  // Graceful shutdown handler
  const shutdown = () => {
    logger.info('\nShutting down...')
    stopGlobeService()
    server.stop()
    closeDatabase()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Continuous capture loop
  logger.info('Starting continuous capture loop...')

  while (true) {
    try {
      const activeSatellites = SATELLITES.filter(
        (sat) => sat.enabled && (!sat.eventBased || isSstvActive())
      )

      if (activeSatellites.length === 0) {
        logger.info('No active satellites. Enable SSTV mode or check satellite configuration.')
        stateManager.setStatus('idle')
        await Bun.sleep(60 * 1000)
        continue
      }

      logger.info(`Active satellites: ${activeSatellites.map((s) => s.name).join(', ')}`)

      logger.info('Fetching TLE data...')
      const tles = await getTles(activeSatellites, config.tle.updateIntervalHours)
      logger.info(`Loaded TLEs for ${tles.length} satellites`)

      logger.info('Predicting satellite passes...')
      const allPasses = predictPasses(activeSatellites, tles, config.station, {
        minElevation: config.recording.minElevation,
        hoursAhead: 24,
      })

      if (allPasses.length === 0) {
        logger.warn('No passes found in the next 24 hours')
        stateManager.updatePasses([])
        stateManager.setStatus('idle')

        // Wait 1 hour before checking again
        logger.info('Checking again in 1 hour...')
        await Bun.sleep(60 * 60 * 1000)
        continue
      }

      const passes = filterHighQualityPasses(allPasses, config.recording.minElevation)
      stateManager.updatePasses(passes)

      console.log(chalk.bold('\n  Upcoming Passes:\n'))
      console.log(formatPassesTable(passes))
      console.log()

      logger.info(`Found ${passes.length} high-quality passes (${allPasses.length} total)`)

      if (passes.length === 0) {
        logger.info('No high-quality passes, checking again in 1 hour...')
        stateManager.setStatus('idle')
        await Bun.sleep(60 * 60 * 1000)
        continue
      }

      // Run scheduler for current batch of passes
      const results = await runScheduler(passes, config)

      const successful = results.filter((r) => r.success).length
      logger.info(`Batch complete: ${successful}/${results.length} captures successful`)

      // Small delay before re-predicting
      stateManager.setStatus('idle')
      await Bun.sleep(5000)
    } catch (error) {
      logger.error('Error in capture loop:', error)
      stateManager.setStatus('idle')
      // Wait 5 minutes before retrying on error
      await Bun.sleep(5 * 60 * 1000)
    }
  }
}
