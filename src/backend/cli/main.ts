import chalk from 'chalk'
import { predictCommand } from './commands/predict'
import { runCommand } from './commands/run'
import { serveCommand } from './commands/serve'
import { statusCommand } from './commands/status'

const HELP_TEXT = `
${chalk.bold.cyan('NOAA Satellite Capture System')}

${chalk.bold('Usage:')}
  bun run src/cli/main.ts <command> [options]

${chalk.bold('Commands:')}
  ${chalk.green('run')}       Start the capture daemon with web dashboard (default)
  ${chalk.green('predict')}   Show upcoming satellite passes
  ${chalk.green('status')}    Query current system status
  ${chalk.green('serve')}     Start web server only (no capture)
  ${chalk.green('help')}      Show this help message

${chalk.bold('Examples:')}
  bun start                    Start capture daemon
  bun run predict              Show passes for next 24 hours
  bun run predict 48           Show passes for next 48 hours
  bun run serve                Start web dashboard only
  bun run status               Check system status

${chalk.bold('Environment:')}
  Configure via .env file (see .env.example)
`

async function main(): Promise<void> {
  const command = process.argv[2] || 'run'
  const args = process.argv.slice(3)

  switch (command) {
    case 'run':
    case 'start':
      await runCommand(args)
      break

    case 'predict':
      await predictCommand(args)
      break

    case 'status':
      await statusCommand(args)
      break

    case 'serve':
      await serveCommand(args)
      break

    case 'help':
    case '--help':
    case '-h':
      console.log(HELP_TEXT)
      break

    default:
      console.error(chalk.red(`Unknown command: ${command}`))
      console.log(HELP_TEXT)
      process.exit(1)
  }
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error)
  process.exit(1)
})
