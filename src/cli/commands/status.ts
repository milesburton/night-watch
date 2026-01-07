import chalk from 'chalk'
import { loadConfig } from '../../config/config'
import type { SystemState } from '../../types'

interface CaptureSummary {
  total: number
  successful: number
  failed: number
}

export async function statusCommand(_args: string[]): Promise<void> {
  const config = loadConfig()
  const baseUrl = `http://localhost:${config.web.port}`

  console.log(chalk.bold.cyan('\n  System Status\n'))

  try {
    // Try to fetch status from running server
    const statusResponse = await fetch(`${baseUrl}/api/status`)
    if (!statusResponse.ok) {
      throw new Error('Server not responding')
    }

    const status = (await statusResponse.json()) as SystemState

    const statusColors: Record<string, (s: string) => string> = {
      idle: chalk.gray,
      waiting: chalk.yellow,
      capturing: chalk.blue,
      decoding: chalk.green,
    }

    const colorFn = statusColors[status.status] || chalk.white
    console.log(`  Status: ${colorFn(status.status.toUpperCase())}`)
    console.log(`  Last Update: ${new Date(status.lastUpdate).toLocaleString()}`)

    if (status.currentPass) {
      console.log(chalk.bold('\n  Current Pass:'))
      console.log(`    Satellite: ${status.currentPass.satellite.name}`)
      console.log(`    Progress: ${status.captureProgress}%`)
    }

    if (status.nextPass) {
      console.log(chalk.bold('\n  Next Pass:'))
      console.log(`    Satellite: ${status.nextPass.satellite.name}`)
      console.log(`    Time: ${new Date(status.nextPass.aos).toLocaleString()}`)
      console.log(`    Max Elevation: ${status.nextPass.maxElevation.toFixed(1)}°`)
    }

    console.log(`\n  Upcoming Passes: ${status.upcomingPasses.length}`)

    // Fetch summary
    const summaryResponse = await fetch(`${baseUrl}/api/summary`)
    if (summaryResponse.ok) {
      const summary = (await summaryResponse.json()) as CaptureSummary
      console.log(chalk.bold('\n  Statistics:'))
      console.log(`    Total Captures: ${summary.total}`)
      console.log(`    Successful: ${chalk.green(summary.successful)}`)
      console.log(`    Failed: ${chalk.red(summary.failed)}`)
    }

    console.log(`\n  Web Dashboard: ${chalk.cyan(baseUrl)}\n`)
  } catch {
    console.log(chalk.yellow('  Server is not running.'))
    console.log(`  Start the daemon with: ${chalk.cyan('bun start')}\n`)
  }
}
