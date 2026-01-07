import { basename, join } from 'node:path'
import { ensureDir, fileExists } from '../../utils/fs'
import { logger } from '../../utils/logger'
import { runCommand } from '../../utils/shell'
import type { Decoder, DecoderResult } from './types'

const decodeWithAptdec = async (
  wavPath: string,
  outputDir: string,
  outputs: Array<{ flag: string; suffix: string; label: string }>
): Promise<string[]> => {
  const baseName = basename(wavPath, '.wav')

  const results = await Promise.all(
    outputs.map(async ({ flag, suffix, label }) => {
      const outputPath = join(outputDir, `${baseName}${suffix}`)
      logger.image(`Decoding ${label}...`)

      const result = await runCommand('aptdec', [flag, '-o', outputPath, wavPath], {
        timeout: 300000,
      })

      const success = result.exitCode === 0 && (await fileExists(outputPath))
      success
        ? logger.image(`${label} saved: ${outputPath}`)
        : logger.warn(`${label} decoding failed`)

      return success ? outputPath : null
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

    const outputs = [
      { flag: '-A', suffix: '-chA.png', label: 'Channel A' },
      { flag: '-B', suffix: '-chB.png', label: 'Channel B' },
      { flag: '-c', suffix: '-colour.png', label: 'Colour composite' },
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
