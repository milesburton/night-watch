import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

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

// Type assertions for mocked functions
const mockFileExists = fileExists as unknown as Mock
const mockRunCommand = runCommand as unknown as Mock
const mockEnsureDir = ensureDir as unknown as Mock

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
      mockFileExists.mockResolvedValue(false)

      const result = await aptDecoder.decode('/path/to/missing.wav', '/output')

      expect(result).toBeNull()
      expect(mockEnsureDir).not.toHaveBeenCalled()
    })

    it('should ensure output directory exists before decoding', async () => {
      mockFileExists.mockResolvedValue(true)
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      await aptDecoder.decode('/path/to/recording.wav', '/output/dir')

      expect(mockEnsureDir).toHaveBeenCalledWith('/output/dir')
    })

    it('should decode all three channels', async () => {
      mockFileExists.mockResolvedValue(true)
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      await aptDecoder.decode('/path/to/recording.wav', '/output')

      expect(mockRunCommand).toHaveBeenCalledTimes(3)
      expect(mockRunCommand).toHaveBeenCalledWith(
        'aptdec',
        ['-i', 'a', '-d', '/output', '/path/to/recording.wav'],
        { timeout: 300_000 }
      )
      expect(mockRunCommand).toHaveBeenCalledWith(
        'aptdec',
        ['-i', 'b', '-d', '/output', '/path/to/recording.wav'],
        { timeout: 300_000 }
      )
      expect(mockRunCommand).toHaveBeenCalledWith(
        'aptdec',
        ['-i', 'c', '-d', '/output', '/path/to/recording.wav'],
        { timeout: 300_000 }
      )
    })

    it('should return output paths for successful decodes', async () => {
      mockFileExists.mockResolvedValue(true)
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      const result = await aptDecoder.decode('/path/to/test.wav', '/images')

      expect(result).not.toBeNull()
      expect(result?.outputPaths).toHaveLength(3)
      expect(result?.outputPaths).toContain('/images/test-a.png')
      expect(result?.outputPaths).toContain('/images/test-b.png')
      expect(result?.outputPaths).toContain('/images/test-c.png')
    })

    it('should filter out failed channel decodes', async () => {
      mockFileExists.mockImplementation(async (path: string) => {
        if (typeof path === 'string' && path.includes('-b.png')) {
          return false
        }
        return true
      })
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })

      const result = await aptDecoder.decode('/path/to/test.wav', '/images')

      expect(result).not.toBeNull()
      expect(result?.outputPaths).toHaveLength(2)
      expect(result?.outputPaths).not.toContain('/images/test-b.png')
    })

    it('should return null when all decodes fail', async () => {
      mockFileExists.mockImplementation(async (path: string) => {
        if (typeof path === 'string' && path.endsWith('.wav')) {
          return true
        }
        return false
      })
      mockRunCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' })

      const result = await aptDecoder.decode('/path/to/test.wav', '/images')

      expect(result).toBeNull()
    })
  })

  describe('checkInstalled', () => {
    it('should return true when aptdec is installed', async () => {
      mockRunCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '/usr/bin/aptdec',
        stderr: '',
      })

      const result = await aptDecoder.checkInstalled()

      expect(result).toBe(true)
      expect(mockRunCommand).toHaveBeenCalledWith('which', ['aptdec'])
    })

    it('should return false when aptdec is not installed', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' })

      const result = await aptDecoder.checkInstalled()

      expect(result).toBe(false)
    })

    it('should return false when which command throws', async () => {
      mockRunCommand.mockRejectedValue(new Error('Command failed'))

      const result = await aptDecoder.checkInstalled()

      expect(result).toBe(false)
    })
  })
})
