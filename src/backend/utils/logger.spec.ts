import { beforeEach, describe, expect, it, vi } from 'vitest'

// Create shared mock pino instance
const mockPinoInstance = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => mockPinoInstance),
}

// Mock pino before importing logger
vi.mock('pino', () => {
  const pinoConstructor = vi.fn(() => mockPinoInstance)
  return { default: pinoConstructor }
})

// Import after mock
import pino from 'pino'
import { logger } from './logger'

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('setLevel', () => {
    it('should set logger level to debug', () => {
      logger.setLevel('debug')

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
        })
      )
    })

    it('should set logger level to info', () => {
      logger.setLevel('info')

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
        })
      )
    })

    it('should set logger level to warn', () => {
      logger.setLevel('warn')

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
        })
      )
    })

    it('should set logger level to error', () => {
      logger.setLevel('error')

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
        })
      )
    })

    it('should configure pino-pretty transport', () => {
      logger.setLevel('info')

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
        })
      )
    })
  })

  describe('debug', () => {
    it('should log debug message', () => {
      logger.debug('test message')

      expect(mockPinoInstance.debug).toHaveBeenCalledWith({ args: undefined }, 'test message')
    })

    it('should log debug message with args', () => {
      logger.debug('test message', 'arg1', 'arg2')

      expect(mockPinoInstance.debug).toHaveBeenCalledWith(
        { args: ['arg1', 'arg2'] },
        'test message'
      )
    })
  })

  describe('info', () => {
    it('should log info message', () => {
      logger.info('test message')

      expect(mockPinoInstance.info).toHaveBeenCalledWith({ args: undefined }, 'test message')
    })

    it('should log info message with args', () => {
      logger.info('test message', { key: 'value' }, 123)

      expect(mockPinoInstance.info).toHaveBeenCalledWith(
        { args: [{ key: 'value' }, 123] },
        'test message'
      )
    })
  })

  describe('warn', () => {
    it('should log warn message', () => {
      logger.warn('test warning')

      expect(mockPinoInstance.warn).toHaveBeenCalledWith({ args: undefined }, 'test warning')
    })

    it('should log warn message with args', () => {
      logger.warn('test warning', 'detail1', 'detail2')

      expect(mockPinoInstance.warn).toHaveBeenCalledWith(
        { args: ['detail1', 'detail2'] },
        'test warning'
      )
    })
  })

  describe('error', () => {
    it('should log error message', () => {
      logger.error('test error')

      expect(mockPinoInstance.error).toHaveBeenCalledWith({ args: undefined }, 'test error')
    })

    it('should log error message with error object', () => {
      const error = new Error('something failed')
      logger.error('test error', error)

      expect(mockPinoInstance.error).toHaveBeenCalledWith({ args: [error] }, 'test error')
    })
  })

  describe('satellite', () => {
    it('should log satellite message with name', () => {
      logger.satellite('METEOR-M N2-3', 'Signal detected')

      expect(mockPinoInstance.info).toHaveBeenCalledWith(
        { satellite: 'METEOR-M N2-3' },
        'Signal detected'
      )
    })
  })

  describe('pass', () => {
    it('should log pass message with type', () => {
      logger.pass('Pass starting in 5 minutes')

      expect(mockPinoInstance.info).toHaveBeenCalledWith(
        { type: 'pass' },
        'Pass starting in 5 minutes'
      )
    })
  })

  describe('capture', () => {
    it('should log capture message with type', () => {
      logger.capture('Recording started')

      expect(mockPinoInstance.info).toHaveBeenCalledWith({ type: 'capture' }, 'Recording started')
    })
  })

  describe('image', () => {
    it('should log image message with type', () => {
      logger.image('Image decoded successfully')

      expect(mockPinoInstance.info).toHaveBeenCalledWith(
        { type: 'image' },
        'Image decoded successfully'
      )
    })
  })

  describe('child', () => {
    it('should create child logger with bindings', () => {
      const bindings = { requestId: '123', userId: '456' }

      logger.child(bindings)

      expect(mockPinoInstance.child).toHaveBeenCalledWith(bindings)
    })
  })

  describe('integration', () => {
    it('should handle multiple logging calls in sequence', () => {
      logger.debug('Debug message')
      logger.info('Info message')
      logger.warn('Warn message')
      logger.error('Error message')

      expect(mockPinoInstance.debug).toHaveBeenCalledTimes(1)
      expect(mockPinoInstance.info).toHaveBeenCalledTimes(1)
      expect(mockPinoInstance.warn).toHaveBeenCalledTimes(1)
      expect(mockPinoInstance.error).toHaveBeenCalledTimes(1)
    })

    it('should support changing log level at runtime', () => {
      logger.setLevel('debug')
      logger.setLevel('error')

      expect(pino).toHaveBeenCalledTimes(2)
      expect(pino).toHaveBeenLastCalledWith(
        expect.objectContaining({
          level: 'error',
        })
      )
    })
  })
})
