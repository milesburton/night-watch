import chalk from 'chalk'
import { loadConfig } from '../../config/config'
import { closeDatabase, initializeDatabase } from '../../db/database'
import { ensureDir } from '../../utils/fs'
import { logger } from '../../utils/logger'
import { startGlobeService, stopGlobeService } from '../../web/globe-service'
import { startWebServer } from '../../web/server'

export async function serveCommand(_args: string[]): Promise<void> {
  console.log(chalk.bold.cyan('\n  NOAA Satellite Capture - Web Server\n'))

  const config = loadConfig()
  logger.setLevel(config.logLevel)

  // Ensure directories exist
  await ensureDir(config.recording.imagesDir)

  // Initialize database
  logger.info('Initializing database...')
  await initializeDatabase(config.database.path)

  // Start web server
  const server = startWebServer(config.web.port, config.web.host, config.recording.imagesDir)

  // Start globe service for real-time satellite positions
  await startGlobeService(config.station)

  console.log(
    chalk.bold.green(`\n  Web dashboard running at http://${config.web.host}:${config.web.port}`)
  )
  console.log(chalk.gray('  Press Ctrl+C to stop\n'))

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

  // Keep process running
  await new Promise(() => {})
}
