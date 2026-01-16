import { vi } from 'vitest'

vi.mock('@backend/utils/logger', () => ({
  logger: {
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
  },
}))
