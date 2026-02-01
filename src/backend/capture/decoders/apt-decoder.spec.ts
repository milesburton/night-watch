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
import { aptDecoder } from './apt-decoder'

describe('aptDecoder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(aptDecoder.name).toBe('APT Decoder (aptdec)')
    })

    it('should have correct signal type', () => {
      expect(aptDecoder.signalType).toBe('apt')
    })
  })

  describe('decode', () => {
    it('should return null when input file does not exist', async () => {
      fileExists.mockResolvedValue(false)

      const result = await aptDecoder.decode('/path/to/missing.wav', '/output')

      expect(result).toBeNull()
      expect(ensureDir).not.toHaveBeenCalled()
    })

    it('should ensure output directory exists before decoding', async () => {
      fileExists.mockResolvedValue(true)
      runCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      await aptDecoder.decode('/path/to/recording.wav', '/output/dir')

      expect(ensureDir).toHaveBeenCalledWith('/output/dir')
    })

    it('should decode all three channels', async () => {
      fileExists.mockResolvedValue(true)
      runCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      await aptDecoder.decode('/path/to/recording.wav', '/output')

      expect(runCommand).toHaveBeenCalledTimes(3)
      expect(runCommand).toHaveBeenCalledWith(
        'aptdec',
        ['-i', 'a', '-d', '/output', '/path/to/recording.wav'],
        { timeout: 300_000 }
      )
      expect(runCommand).toHaveBeenCalledWith(
        'aptdec',
        ['-i', 'b', '-d', '/output', '/path/to/recording.wav'],
        { timeout: 300_000 }
      )
      expect(runCommand).toHaveBeenCalledWith(
        'aptdec',
        ['-i', 'c', '-d', '/output', '/path/to/recording.wav'],
        { timeout: 300_000 }
      )
    })

    it('should return output paths for successful decodes', async () => {
      fileExists.mockResolvedValue(true)
      runCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      const result = await aptDecoder.decode('/path/to/test.wav', '/images')

      expect(result).not.toBeNull()
      expect(result?.outputPaths).toHaveLength(3)
      expect(result?.outputPaths).toContain('/images/test-a.png')
      expect(result?.outputPaths).toContain('/images/test-b.png')
      expect(result?.outputPaths).toContain('/images/test-c.png')
    })

    it('should filter out failed channel decodes', async () => {
      fileExists.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.includes('-b.png')) {
          return false
        }
        return true
      })
      runCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      const result = await aptDecoder.decode('/path/to/test.wav', '/images')

      expect(result).not.toBeNull()
      expect(result?.outputPaths).toHaveLength(2)
      expect(result?.outputPaths).not.toContain('/images/test-b.png')
    })

    it('should return null when all decodes fail', async () => {
      fileExists.mockImplementation(async (path) => {
        if (typeof path === 'string' && path.endsWith('.wav')) {
          return true
        }
        return false
      })
      runCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' })

      const result = await aptDecoder.decode('/path/to/test.wav', '/images')

      expect(result).toBeNull()
    })
  })

  describe('checkInstalled', () => {
    it('should return true when aptdec is installed', async () => {
      runCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '/usr/bin/aptdec',
        stderr: '',
      })

      const result = await aptDecoder.checkInstalled()

      expect(result).toBe(true)
      expect(runCommand).toHaveBeenCalledWith('which', ['aptdec'])
    })

    it('should return false when aptdec is not installed', async () => {
      runCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' })

      const result = await aptDecoder.checkInstalled()

      expect(result).toBe(false)
    })

    it('should return false when which command throws', async () => {
      runCommand.mockRejectedValue(new Error('Command failed'))

      const result = await aptDecoder.checkInstalled()

      expect(result).toBe(false)
    })
  })
})
