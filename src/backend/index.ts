import chalk from 'chalk'
import { loadConfig } from './config/config'
import { filterHighQualityPasses, formatPassesTable, predictPasses } from './prediction/passes'
import { NOAA_SATELLITES } from './satellites/constants'
import { getTles } from './satellites/tle'
import { runScheduler } from './scheduler/scheduler'
import { ensureDir } from './utils/fs'
import { logger } from './utils/logger'
import { checkDependencies } from './utils/shell'

const REQUIRED_COMMANDS = ['rtl_fm', 'rtl_power', 'sox', 'aptdec']

async function main(): Promise<void> {
  console.log(chalk.bold.cyan('\n🛰️  NOAA Satellite Capture System\n'))

  const config = loadConfig()
  logger.setLevel(config.logLevel)

  logger.info(
    `Station location: ${config.station.latitude.toFixed(4)}°N, ${config.station.longitude.toFixed(4)}°E`
  )

  await ensureDir(config.recording.recordingsDir)
  await ensureDir(config.recording.imagesDir)

  logger.info('Checking dependencies...')
  const deps = await checkDependencies(REQUIRED_COMMANDS)
  const missing = [...deps.entries()].filter(([_, exists]) => !exists).map(([cmd]) => cmd)

  if (missing.length > 0) {
    logger.error(`Missing dependencies: ${missing.join(', ')}`)
    logger.info('Please install: sudo apt install rtl-sdr sox')
    logger.info('For aptdec: https://github.com/Xerbo/aptdec')
    process.exit(1)
  }

  logger.info('Fetching TLE data...')
  const tles = await getTles(NOAA_SATELLITES, config.tle.updateIntervalHours)
  logger.info(`Loaded TLEs for ${tles.length} satellites`)

  logger.info('Predicting satellite passes...')
  const allPasses = predictPasses(NOAA_SATELLITES, tles, config.station, {
    minElevation: config.recording.minElevation,
    hoursAhead: 24,
  })

  if (allPasses.length === 0) {
    logger.warn('No passes found in the next 24 hours')
    process.exit(0)
  }

  const passes = filterHighQualityPasses(allPasses, config.recording.minElevation)

  console.log(chalk.bold('\n📅 Upcoming Passes:\n'))
  console.log(formatPassesTable(passes))
  console.log()

  logger.info(`Found ${passes.length} high-quality passes (${allPasses.length} total)`)

  const results = await runScheduler(passes, config)

  const successful = results.filter((r) => r.success).length
  logger.info(`Session complete: ${successful}/${results.length} captures successful`)
}

main().catch((error) => {
  logger.error('Fatal error:', error)
  process.exit(1)
})
