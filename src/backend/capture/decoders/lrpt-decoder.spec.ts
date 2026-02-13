import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('@backend/utils/fs', () => ({
  fileExists: vi.fn(),
  ensureDir: vi.fn(),
}))

vi.mock('@backend/utils/shell', () => ({
  runCommand: vi.fn(),
}))

// Import after mocks
import { ensureDir, fileExists } from '@backend/utils/fs'
import { runCommand } from '@backend/utils/shell'
import { lrptDecoder } from './lrpt-decoder'

describe('lrpt-decoder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ensureDir).mockResolvedValue()
    vi.mocked(fileExists).mockResolvedValue(true)
  })

  describe('decode', () => {
    it('should successfully decode LRPT recording with SatDump', async () => {
      vi.mocked(runCommand)
        // SatDump wrapper script execution
        .mockResolvedValueOnce({
          stdout: 'Decoding complete',
          stderr: '',
          exitCode: 0,
        })
        // find command to locate PNG files
        .mockResolvedValueOnce({
          stdout: '/tmp/images/recording_lrpt/image1.png\n/tmp/images/recording_lrpt/image2.png\n',
          stderr: '',
          exitCode: 0,
        })

      const result = await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(result).not.toBeNull()
      expect(result?.outputPaths).toEqual([
        '/tmp/images/recording_lrpt/image1.png',
        '/tmp/images/recording_lrpt/image2.png',
      ])
      expect(result?.metadata?.decoder).toBe('SatDump')
      expect(result?.metadata?.pipeline).toBe('meteor_m2-x_lrpt')
    })

    it('should check if recording file exists before decoding', async () => {
      vi.mocked(fileExists).mockResolvedValue(false)

      const result = await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(result).toBeNull()
      expect(vi.mocked(fileExists)).toHaveBeenCalledWith('/tmp/recording.wav')
    })

    it('should ensure output directory exists', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      })

      await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(vi.mocked(ensureDir)).toHaveBeenCalledWith('/tmp/images')
    })

    it('should call SatDump wrapper script with correct arguments', async () => {
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: 'Decoding complete',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '/tmp/images/recording_lrpt/image1.png\n',
          stderr: '',
          exitCode: 0,
        })

      await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(vi.mocked(runCommand)).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('lrpt-decode-wrapper.sh'),
        ['/tmp/recording.wav', '/tmp/images/recording_lrpt'],
        { timeout: 300000 }
      )
    })

    it('should use find command to locate generated PNG files', async () => {
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: 'Decoding complete',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '/tmp/images/recording_lrpt/image1.png\n',
          stderr: '',
          exitCode: 0,
        })

      await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(vi.mocked(runCommand)).toHaveBeenNthCalledWith(2, 'find', [
        '/tmp/images/recording_lrpt',
        '-name',
        '*.png',
        '-type',
        'f',
      ])
    })

    it('should return null when SatDump fails', async () => {
      vi.mocked(runCommand).mockResolvedValueOnce({
        stdout: '',
        stderr: 'Error: Invalid signal',
        exitCode: 1,
      })

      const result = await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(result).toBeNull()
    })

    it('should return null when SatDump succeeds but no images generated', async () => {
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: 'Decoding complete',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '', // No images found
          stderr: '',
          exitCode: 0,
        })

      const result = await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(result).toBeNull()
    })

    it('should handle find command failure gracefully', async () => {
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: 'Decoding complete',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'Error',
          exitCode: 1,
        })

      const result = await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(result).toBeNull()
    })

    it('should filter out empty lines from find output', async () => {
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: 'Decoding complete',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '/tmp/image1.png\n\n/tmp/image2.png\n\n\n',
          stderr: '',
          exitCode: 0,
        })

      const result = await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(result?.outputPaths).toEqual(['/tmp/image1.png', '/tmp/image2.png'])
    })

    it('should handle recordings with paths containing spaces', async () => {
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: 'Decoding complete',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '/tmp/images/my recording_lrpt/image1.png\n',
          stderr: '',
          exitCode: 0,
        })

      const result = await lrptDecoder.decode('/tmp/my recording.wav', '/tmp/images')

      expect(result).not.toBeNull()
      expect(vi.mocked(runCommand)).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        ['/tmp/my recording.wav', '/tmp/images/my recording_lrpt'],
        { timeout: 300000 }
      )
    })

    it('should use 5 minute timeout for SatDump processing', async () => {
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: 'Decoding complete',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '/tmp/image1.png\n',
          stderr: '',
          exitCode: 0,
        })

      await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      const wrapperCall = vi.mocked(runCommand).mock.calls[0]
      expect(wrapperCall?.[2]).toEqual({ timeout: 300000 })
    })

    it('should handle single image generation', async () => {
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: 'Decoding complete',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '/tmp/images/recording_lrpt/single_image.png\n',
          stderr: '',
          exitCode: 0,
        })

      const result = await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(result?.outputPaths).toHaveLength(1)
      expect(result?.outputPaths[0]).toBe('/tmp/images/recording_lrpt/single_image.png')
    })

    it('should handle multiple images generation', async () => {
      const images = Array.from({ length: 5 }, (_, i) => `/tmp/image${i + 1}.png`).join('\n')

      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: 'Decoding complete',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: `${images}\n`,
          stderr: '',
          exitCode: 0,
        })

      const result = await lrptDecoder.decode('/tmp/recording.wav', '/tmp/images')

      expect(result?.outputPaths).toHaveLength(5)
    })
  })

  describe('checkInstalled', () => {
    it('should return true when SatDump and wrapper script are installed', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '/usr/bin/satdump',
        stderr: '',
        exitCode: 0,
      })
      vi.mocked(fileExists).mockResolvedValue(true)

      const result = await lrptDecoder.checkInstalled()

      expect(result).toBe(true)
      expect(vi.mocked(runCommand)).toHaveBeenCalledWith('which', ['satdump'])
    })

    it('should return false when SatDump is not installed', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 1,
      })

      const result = await lrptDecoder.checkInstalled()

      expect(result).toBe(false)
    })

    it('should return false when wrapper script does not exist', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '/usr/bin/satdump',
        stderr: '',
        exitCode: 0,
      })
      vi.mocked(fileExists).mockResolvedValue(false)

      const result = await lrptDecoder.checkInstalled()

      expect(result).toBe(false)
    })

    it('should check for wrapper script at correct path', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '/usr/bin/satdump',
        stderr: '',
        exitCode: 0,
      })
      vi.mocked(fileExists).mockResolvedValue(true)

      await lrptDecoder.checkInstalled()

      expect(vi.mocked(fileExists)).toHaveBeenCalledWith(
        expect.stringContaining('lrpt-decode-wrapper.sh')
      )
    })

    it('should return false when which command throws exception', async () => {
      vi.mocked(runCommand).mockRejectedValue(new Error('Command failed'))

      const result = await lrptDecoder.checkInstalled()

      expect(result).toBe(false)
    })

    it('should return false when fileExists throws exception', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '/usr/bin/satdump',
        stderr: '',
        exitCode: 0,
      })
      vi.mocked(fileExists).mockRejectedValue(new Error('File system error'))

      const result = await lrptDecoder.checkInstalled()

      expect(result).toBe(false)
    })
  })

  describe('decoder metadata', () => {
    it('should have correct name', () => {
      expect(lrptDecoder.name).toBe('LRPT Decoder (SatDump)')
    })

    it('should have correct signal type', () => {
      expect(lrptDecoder.signalType).toBe('lrpt')
    })
  })
})
