import pino from 'pino'
import type { LogLevel } from '../types'

const pinoLevelMap: Record<LogLevel, string> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
}

const createLogger = () =>
  pino({
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  })

let pinoLogger = createLogger()

export const logger = {
  setLevel(level: LogLevel): void {
    pinoLogger = pino({
      level: pinoLevelMap[level],
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    })
  },

  debug(message: string, ...args: unknown[]): void {
    pinoLogger.debug({ args: args.length > 0 ? args : undefined }, message)
  },

  info(message: string, ...args: unknown[]): void {
    pinoLogger.info({ args: args.length > 0 ? args : undefined }, message)
  },

  warn(message: string, ...args: unknown[]): void {
    pinoLogger.warn({ args: args.length > 0 ? args : undefined }, message)
  },

  error(message: string, ...args: unknown[]): void {
    pinoLogger.error({ args: args.length > 0 ? args : undefined }, message)
  },

  satellite(name: string, message: string): void {
    pinoLogger.info({ satellite: name }, message)
  },

  pass(message: string): void {
    pinoLogger.info({ type: 'pass' }, message)
  },

  capture(message: string): void {
    pinoLogger.info({ type: 'capture' }, message)
  },

  image(message: string): void {
    pinoLogger.info({ type: 'image' }, message)
  },

  child(bindings: Record<string, unknown>) {
    return pinoLogger.child(bindings)
  },
}

export type Logger = typeof logger
