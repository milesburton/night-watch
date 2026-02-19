import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'

vi.mock('../../utils/fs', () => ({
  ensureDir: vi.fn(() => Promise.resolve()),
  fileExists: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(() => Promise.resolve()),
}))

const mockDecodeSamples = vi.fn(() => ({
  pixels: new Uint8ClampedArray(320 * 240 * 4),
  width: 320,
  height: 240,
  diagnostics: {
    mode: 'Robot 36',
    visCode: 0x08,
    sampleRate: 48000,
    fileDuration: '36.00s',
    freqOffset: 0,
    autoCalibrate: true,
    visEndPos: 29280,
    decodeTimeMs: 1200,
    quality: { rAvg: 120, gAvg: 118, bAvg: 115, brightness: 118, verdict: 'good', warnings: [] },
  },
}))

vi.mock('./sstv-toolkit/SSTVDecoder.js', () => ({
  parseWAV: vi.fn(() => ({
    samples: new Float32Array(1000),
    sampleRate: 48000,
  })),
  SSTVDecoder: class {
    decodeSamples = mockDecodeSamples
  },
}))

vi.mock('./sstv-toolkit/writePng.js', () => ({
  writePng: vi.fn(() => Promise.resolve()),
}))

import { readFile } from 'node:fs/promises'
import { ensureDir, fileExists } from '../../utils/fs'
import { sstvDecoder } from './sstv-decoder'
import { parseWAV } from './sstv-toolkit/SSTVDecoder.js'
import { writePng } from './sstv-toolkit/writePng.js'

const mockFileExists = fileExists as unknown as Mock
const mockEnsureDir = ensureDir as unknown as Mock
const mockReadFile = readFile as unknown as Mock
const mockParseWAV = parseWAV as unknown as Mock
const mockWritePng = writePng as unknown as Mock

describe('sstvDecoder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadFile.mockResolvedValue(Buffer.from([]))
    mockParseWAV.mockReturnValue({ samples: new Float32Array(1000), sampleRate: 48000 })
    mockWritePng.mockResolvedValue(undefined)
    mockDecodeSamples.mockReturnValue({
      pixels: new Uint8ClampedArray(320 * 240 * 4),
      width: 320,
      height: 240,
      diagnostics: {
        mode: 'Robot 36',
        visCode: 0x08,
        sampleRate: 48000,
        fileDuration: '36.00s',
        freqOffset: 0,
        autoCalibrate: true,
        visEndPos: 29280,
        decodeTimeMs: 1200,
        quality: {
          rAvg: 120,
          gAvg: 118,
          bAvg: 115,
          brightness: 118,
          verdict: 'good',
          warnings: [],
        },
      },
    })
  })

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(sstvDecoder.name).toBe('SSTV Decoder (sstv-toolkit)')
    })

    it('should have correct signal type', () => {
      expect(sstvDecoder.signalType).toBe('sstv')
    })
  })

  describe('checkInstalled', () => {
    it('should always return true — no external dependencies', async () => {
      const result = await sstvDecoder.checkInstalled()
      expect(result).toBe(true)
    })
  })

  describe('decode', () => {
    it('should return null when input file does not exist', async () => {
      mockFileExists.mockResolvedValue(false)

      const result = await sstvDecoder.decode('/path/to/missing.wav', '/output')

      expect(result).toBeNull()
      expect(mockEnsureDir).not.toHaveBeenCalled()
    })

    it('should ensure output directory exists before decoding', async () => {
      mockFileExists.mockResolvedValue(true)

      await sstvDecoder.decode('/path/to/recording.wav', '/output/dir')

      expect(mockEnsureDir).toHaveBeenCalledWith('/output/dir')
    })

    it('should read the WAV file', async () => {
      mockFileExists.mockResolvedValue(true)

      await sstvDecoder.decode('/path/to/recording.wav', '/output')

      expect(mockReadFile).toHaveBeenCalledWith('/path/to/recording.wav')
    })

    it('should return output path for successful decode', async () => {
      mockFileExists.mockResolvedValue(true)

      const result = await sstvDecoder.decode('/path/to/test.wav', '/images')

      expect(result).not.toBeNull()
      expect(result?.outputPaths).toHaveLength(1)
      expect(result?.outputPaths[0]).toBe('/images/test-sstv.png')
    })

    it('should include mode and quality in metadata', async () => {
      mockFileExists.mockResolvedValue(true)

      const result = await sstvDecoder.decode('/path/to/test.wav', '/images')

      expect(result?.metadata).toMatchObject({
        mode: 'Robot 36',
        quality: 'good',
        warnings: [],
        freqOffset: 0,
        visCode: 0x08,
      })
    })

    it('should write the PNG to the correct output path', async () => {
      mockFileExists.mockResolvedValue(true)

      await sstvDecoder.decode('/path/to/test.wav', '/images')

      expect(mockWritePng).toHaveBeenCalledWith(
        '/images/test-sstv.png',
        expect.any(Uint8ClampedArray),
        320,
        240
      )
    })

    it('should return null when WAV parsing throws', async () => {
      mockFileExists.mockResolvedValue(true)
      mockParseWAV.mockImplementation(() => {
        throw new Error('Not a valid WAV file')
      })

      const result = await sstvDecoder.decode('/path/to/bad.wav', '/images')

      expect(result).toBeNull()
    })

    it('should return null when decoding throws', async () => {
      mockFileExists.mockResolvedValue(true)
      mockDecodeSamples.mockImplementationOnce(() => {
        throw new Error('Could not find sync pulse')
      })

      const result = await sstvDecoder.decode('/path/to/test.wav', '/images')

      expect(result).toBeNull()
    })
  })
})
