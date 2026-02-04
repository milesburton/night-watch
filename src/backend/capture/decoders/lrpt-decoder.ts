import { basename, join } from 'node:path'
import { ensureDir, fileExists } from '../../utils/fs'
import { logger } from '../../utils/logger'
import { runCommand } from '../../utils/shell'
import type { Decoder, DecoderResult } from './types'

const decodeWithSatDump = async (
  wavPath: string,
  outputDir: string
): Promise<string[]> => {
  const baseName = basename(wavPath, '.wav')
  const decodeOutputDir = join(outputDir, `${baseName}_lrpt`)

  logger.image('Decoding LRPT signal with SatDump...')

  // Use bash wrapper script for SatDump
  const wrapperPath = join(process.cwd(), 'scripts', 'lrpt-decode-wrapper.sh')
  const result = await runCommand(wrapperPath, [wavPath, decodeOutputDir], {
    timeout: 300000, // 5 minutes timeout
  })

  const success = result.exitCode === 0

  if (success) {
    // SatDump creates PNG files in the output directory
    // Find all generated images
    const lsResult = await runCommand('find', [
      decodeOutputDir,
      '-name',
      '*.png',
      '-type',
      'f',
    ])

    const imagePaths =
      lsResult.exitCode === 0
        ? lsResult.stdout
            .trim()
            .split('\n')
            .filter((p) => p.length > 0)
        : []

    if (imagePaths.length > 0) {
      logger.image(`LRPT decode successful: ${imagePaths.length} images generated`)
      return imagePaths
    }

    logger.warn('SatDump completed but no images were generated')
    return []
  }

  logger.warn('LRPT decoding failed')
  return []
}

export const lrptDecoder: Decoder = {
  name: 'LRPT Decoder (SatDump)',
  signalType: 'lrpt',

  async decode(wavPath: string, outputDir: string): Promise<DecoderResult | null> {
    const fileFound = await fileExists(wavPath)

    if (!fileFound) {
      logger.error(`Recording file not found: ${wavPath}`)
      return null
    }

    await ensureDir(outputDir)

    const outputPaths = await decodeWithSatDump(wavPath, outputDir)

    return outputPaths.length > 0
      ? {
          outputPaths,
          metadata: {
            decoder: 'SatDump',
            pipeline: 'meteor_m2-x_lrpt',
          },
        }
      : null
  },

  async checkInstalled(): Promise<boolean> {
    try {
      // Check if SatDump is installed
      const result = await runCommand('which', ['satdump'])
      if (result.exitCode !== 0) {
        logger.warn('SatDump not found in PATH')
        return false
      }

      // Check if wrapper script exists
      const wrapperPath = join(process.cwd(), 'scripts', 'lrpt-decode-wrapper.sh')
      const wrapperExists = await fileExists(wrapperPath)

      if (!wrapperExists) {
        logger.warn('LRPT decoder wrapper script not found')
        return false
      }

      return true
    } catch {
      return false
    }
  },
}
