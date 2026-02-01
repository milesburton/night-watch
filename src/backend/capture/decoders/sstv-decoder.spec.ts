import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/fs', () => ({
  ensureDir: vi.fn(() => Promise.resolve()),
  fileExists: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../../utils/shell', () => ({
  runCommand: vi.fn(() => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })),
}))

import { ensureDir, fileExists } from '../../utils/fs'
import { runCommand } from '../../utils/shell'
import { sstvDecoder } from './sstv-decoder'

describe('sstvDecoder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(sstvDecoder.name).toBe('SSTV Decoder')
    })

    it('should have correct signal type', () => {
      expect(sstvDecoder.signalType).toBe('sstv')
    })
  })

  describe('decode', () => {
    it('should return null when input file does not exist', async () => {
      fileExists.mockResolvedValue(false)

      const result = await sstvDecoder.decode('/path/to/missing.wav', '/output')

      expect(result).toBeNull()
      expect(ensureDir).not.toHaveBeenCalled()
    })

    it('should ensure output directory exists before decoding', async () => {
      fileExists.mockResolvedValue(true)
      runCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      await sstvDecoder.decode('/path/to/recording.wav', '/output/dir')

      expect(ensureDir).toHaveBeenCalledWith('/output/dir')
    })

    it('should call sstv command with correct arguments', async () => {
      fileExists.mockResolvedValue(true)
      runCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      await sstvDecoder.decode('/path/to/recording.wav', '/output')

      expect(runCommand).toHaveBeenCalledWith(
        'sstv',
        ['-d', '/path/to/recording.wav', '-o', '/output/recording-sstv.png'],
        { timeout: 300_000 }
      )
    })

    it('should return output path for successful decode', async () => {
      fileExists.mockResolvedValue(true)
      runCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      const result = await sstvDecoder.decode('/path/to/test.wav', '/images')

      expect(result).not.toBeNull()
      expect(result?.outputPaths).toHaveLength(1)
      expect(result?.outputPaths[0]).toBe('/images/test-sstv.png')
    })

    it('should include metadata with mode auto-detected', async () => {
      fileExists.mockResolvedValue(true)
      runCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      const result = await sstvDecoder.decode('/path/to/test.wav', '/images')

      expect(result?.metadata).toEqual({ mode: 'auto-detected' })
    })

    it('should return null when decode fails', async () => {
      fileExists.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.endsWith('.wav')) {
          return true
        }
        return false
      })
      runCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' })

      const result = await sstvDecoder.decode('/path/to/test.wav', '/images')

      expect(result).toBeNull()
    })

    it('should return null when output file not created', async () => {
      fileExists.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.endsWith('.wav')) {
          return true
        }
        return false
      })
      runCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      const result = await sstvDecoder.decode('/path/to/test.wav', '/images')

      expect(result).toBeNull()
    })
  })

  describe('checkInstalled', () => {
    it('should return true when sstv is installed', async () => {
      runCommand.mockResolvedValue({ exitCode: 0, stdout: '/usr/bin/sstv', stderr: '' })

      const result = await sstvDecoder.checkInstalled()

      expect(result).toBe(true)
      expect(runCommand).toHaveBeenCalledWith('which', ['sstv'])
    })

    it('should return false when sstv is not installed', async () => {
      runCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' })

      const result = await sstvDecoder.checkInstalled()

      expect(result).toBe(false)
    })

    it('should return false when which command throws', async () => {
      runCommand.mockRejectedValue(new Error('Command failed'))

      const result = await sstvDecoder.checkInstalled()

      expect(result).toBe(false)
    })
  })
})
