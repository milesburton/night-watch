import { basename, join } from 'node:path'
import { ensureDir, fileExists } from '../../utils/fs'
import { logger } from '../../utils/logger'
import { runCommand } from '../../utils/shell'
import type { Decoder, DecoderResult } from './types'

const decodeWithAptdec = async (
  wavPath: string,
  outputDir: string,
  outputs: Array<{ imageType: string; suffix: string; label: string }>
): Promise<string[]> => {
  const baseName = basename(wavPath, '.wav')

  const results = await Promise.all(
    outputs.map(async ({ imageType, suffix, label }) => {
      const expectedPath = join(outputDir, `${baseName}-${suffix}.png`)
      logger.image(`Decoding ${label}...`)

      // New aptdec CLI: -i <type> -d <output_dir> <input.wav>
      const result = await runCommand('aptdec', ['-i', imageType, '-d', outputDir, wavPath], {
        timeout: 300000,
      })

      const success = result.exitCode === 0 && (await fileExists(expectedPath))
      success
        ? logger.image(`${label} saved: ${expectedPath}`)
        : logger.warn(`${label} decoding failed`)

      return success ? expectedPath : null
    })
  )

  return results.filter((p): p is string => p !== null)
}

export const aptDecoder: Decoder = {
  name: 'APT Decoder (aptdec)',
  signalType: 'apt',

  async decode(wavPath: string, outputDir: string): Promise<DecoderResult | null> {
    const fileFound = await fileExists(wavPath)

    if (!fileFound) {
      logger.error(`Recording file not found: ${wavPath}`)
    }

    await (fileFound ? ensureDir(outputDir) : Promise.resolve())

    // aptdec outputs files as <basename>-<type>.png in the output directory
    const outputs = [
      { imageType: 'a', suffix: 'a', label: 'Channel A' },
      { imageType: 'b', suffix: 'b', label: 'Channel B' },
      { imageType: 'c', suffix: 'c', label: 'Colour composite' },
    ]

    const outputPaths = fileFound ? await decodeWithAptdec(wavPath, outputDir, outputs) : []

    return outputPaths.length > 0 ? { outputPaths } : null
  },

  async checkInstalled(): Promise<boolean> {
    try {
      const result = await runCommand('which', ['aptdec'])
      return result.exitCode === 0
    } catch {
      return false
    }
  },
}
