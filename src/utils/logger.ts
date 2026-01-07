import chalk from 'chalk'
import type { LogLevel } from '../types'

let currentLevel: LogLevel = 'info'

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const prefixes: Record<LogLevel, string> = {
  debug: chalk.gray('🔍'),
  info: chalk.blue('ℹ️ '),
  warn: chalk.yellow('⚠️ '),
  error: chalk.red('❌'),
}

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[currentLevel]
}

function formatTimestamp(): string {
  return chalk.gray(new Date().toLocaleTimeString('en-GB', { hour12: false }))
}

function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (!shouldLog(level)) return

  const timestamp = formatTimestamp()
  const prefix = prefixes[level]

  console.log(`${timestamp} ${prefix} ${message}`, ...args)
}

export const logger = {
  setLevel(level: LogLevel): void {
    currentLevel = level
  },

  debug(message: string, ...args: unknown[]): void {
    log('debug', message, ...args)
  },

  info(message: string, ...args: unknown[]): void {
    log('info', message, ...args)
  },

  warn(message: string, ...args: unknown[]): void {
    log('warn', message, ...args)
  },

  error(message: string, ...args: unknown[]): void {
    log('error', message, ...args)
  },

  satellite(name: string, message: string): void {
    if (!shouldLog('info')) return
    const timestamp = formatTimestamp()
    console.log(`${timestamp} ${chalk.cyan('📡')} ${chalk.bold(name)}: ${message}`)
  },

  pass(message: string): void {
    if (!shouldLog('info')) return
    const timestamp = formatTimestamp()
    console.log(`${timestamp} ${chalk.green('🛰️ ')} ${message}`)
  },

  capture(message: string): void {
    if (!shouldLog('info')) return
    const timestamp = formatTimestamp()
    console.log(`${timestamp} ${chalk.magenta('🎙️ ')} ${message}`)
  },

  image(message: string): void {
    if (!shouldLog('info')) return
    const timestamp = formatTimestamp()
    console.log(`${timestamp} ${chalk.yellow('🖼️ ')} ${message}`)
  },
}
