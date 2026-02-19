import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { ensureDir, fileExists } from '../../utils/fs'
import { logger } from '../../utils/logger'
import { SSTVDecoder, parseWAV } from './sstv-toolkit/SSTVDecoder.js'
import { writePng } from './sstv-toolkit/writePng.js'
import type { Decoder, DecoderResult } from './types'

const decodeWithToolkit = async (
  wavPath: string,
  outputDir: string
): Promise<DecoderResult | null> => {
  const baseName = basename(wavPath, '.wav')
  const outputPath = join(outputDir, `${baseName}-sstv.png`)

  logger.image(`Decoding SSTV image from ${wavPath}...`)

  const wavBuffer = await readFile(wavPath)
  const { samples, sampleRate } = parseWAV(wavBuffer.buffer as ArrayBuffer)

  const decoder = new SSTVDecoder(sampleRate)
  const result = decoder.decodeSamples(samples)

  await writePng(outputPath, result.pixels, result.width, result.height)

  const { mode, quality } = result.diagnostics
  logger.image(
    `SSTV image saved: ${outputPath} (mode: ${mode}, quality: ${quality.verdict}, decoded in ${result.diagnostics.decodeTimeMs}ms)`
  )

  return {
    outputPaths: [outputPath],
    metadata: {
      mode,
      quality: quality.verdict,
      warnings: quality.warnings,
      freqOffset: result.diagnostics.freqOffset,
      visCode: result.diagnostics.visCode,
    },
  }
}

export const sstvDecoder: Decoder = {
  name: 'SSTV Decoder (sstv-toolkit)',
  signalType: 'sstv',

  async decode(wavPath: string, outputDir: string): Promise<DecoderResult | null> {
    const fileFound = await fileExists(wavPath)

    if (!fileFound) {
      logger.error(`Recording file not found: ${wavPath}`)
      return null
    }

    await ensureDir(outputDir)

    try {
      return await decodeWithToolkit(wavPath, outputDir)
    } catch (err) {
      logger.error(`SSTV decode failed: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  },

  async checkInstalled(): Promise<boolean> {
    return Promise.resolve(true)
  },
}
