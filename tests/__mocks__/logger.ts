import { vi } from 'vitest'

export const logger = {
  setLevel: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  satellite: vi.fn(),
  pass: vi.fn(),
  capture: vi.fn(),
  image: vi.fn(),
  child: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}

export type Logger = typeof logger
