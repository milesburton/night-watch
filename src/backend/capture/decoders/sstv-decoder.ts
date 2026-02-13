import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDir, fileExists } from '../../utils/fs'
import { logger } from '../../utils/logger'
import { runCommand } from '../../utils/shell'
import type { Decoder, DecoderResult } from './types'

// Resolve wrapper path relative to project root (works in Docker /app and local dev)
const currentDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(currentDir, '..', '..', '..')
const WRAPPER_PATH = join(projectRoot, 'scripts', 'sstv-decode-wrapper.py')

const decodeWithSstv = async (
  wavPath: string,
  outputDir: string
): Promise<DecoderResult | null> => {
  const baseName = basename(wavPath, '.wav')
  const outputPath = join(outputDir, `${baseName}-sstv.png`)

  logger.image(`Decoding SSTV image from ${wavPath}...`)

  const result = await runCommand('python3', [WRAPPER_PATH, wavPath, outputPath], {
    timeout: 300_000, // 5 minutes max for decode
  })

  if (result.exitCode !== 0) {
    logger.error(`SSTV decode failed (exit ${result.exitCode}): ${result.stderr.trim()}`)
    if (result.stdout.trim()) {
      logger.debug(`SSTV decoder stdout: ${result.stdout.trim()}`)
    }
    return null
  }

  const outputExists = await fileExists(outputPath)
  if (!outputExists) {
    logger.warn('SSTV decoder exited OK but no output image was created')
    return null
  }

  logger.image(`SSTV image saved: ${outputPath}`)
  return { outputPaths: [outputPath], metadata: { mode: 'auto-detected' } }
}

export const sstvDecoder: Decoder = {
  name: 'SSTV Decoder',
  signalType: 'sstv',

  async decode(wavPath: string, outputDir: string): Promise<DecoderResult | null> {
    const fileFound = await fileExists(wavPath)

    if (!fileFound) {
      logger.error(`Recording file not found: ${wavPath}`)
      return null
    }

    await ensureDir(outputDir)
    return decodeWithSstv(wavPath, outputDir)
  },

  async checkInstalled(): Promise<boolean> {
    try {
      const wrapperExists = await fileExists(WRAPPER_PATH)

      if (!wrapperExists) {
        logger.warn(`SSTV decoder wrapper not found at: ${WRAPPER_PATH}`)
        return false
      }

      // Check if sstv Python module and its dependencies are importable
      const result = await runCommand('python3', [
        '-c',
        'import sstv; from PIL import Image; print("OK")',
      ])

      if (result.exitCode !== 0) {
        logger.warn(`SSTV decoder dependencies missing: ${result.stderr.trim()}`)
        return false
      }

      return result.stdout.includes('OK')
    } catch {
      return false
    }
  },
}
