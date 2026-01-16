import chalk from 'chalk'
import { loadConfig } from '../config/config'
import { formatPass, formatPassesTable, predictPasses } from '../prediction/passes'
import { NOAA_SATELLITES } from '../satellites/constants'
import { getTles } from '../satellites/tle'
import { logger } from '../utils/logger'

async function main(): Promise<void> {
  console.log(chalk.bold.cyan('\n🛰️  NOAA Pass Prediction\n'))

  const config = loadConfig()
  logger.setLevel(config.logLevel)

  const hoursAhead = Number(process.argv[2]) || 24

  logger.info(
    `Station: ${config.station.latitude.toFixed(4)}°N, ${config.station.longitude.toFixed(4)}°E`
  )
  logger.info(`Predicting passes for next ${hoursAhead} hours...`)

  const tles = await getTles(NOAA_SATELLITES, config.tle.updateIntervalHours)
  logger.info(`Loaded TLEs for ${tles.length} satellites`)

  const passes = predictPasses(NOAA_SATELLITES, tles, config.station, {
    minElevation: config.recording.minElevation,
    hoursAhead,
  })

  if (passes.length === 0) {
    logger.warn(`No passes found above ${config.recording.minElevation}° elevation`)
    return
  }

  console.log(chalk.bold(`\n📅 Passes in next ${hoursAhead} hours:\n`))
  console.log(formatPassesTable(passes))

  console.log(chalk.bold('\n📋 Details:\n'))
  for (const pass of passes) {
    console.log(`  ${formatPass(pass)}`)
  }

  console.log(`\n${chalk.gray(`Total: ${passes.length} passes`)}\n`)
}

main().catch((error) => {
  logger.error('Error:', error)
  process.exit(1)
})
