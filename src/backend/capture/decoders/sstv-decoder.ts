import { basename, join } from 'node:path'
import { ensureDir, fileExists } from '../../utils/fs'
import { logger } from '../../utils/logger'
import { runCommand } from '../../utils/shell'
import type { Decoder, DecoderResult } from './types'

const decodeWithSstv = async (
  wavPath: string,
  outputDir: string
): Promise<DecoderResult | null> => {
  const baseName = basename(wavPath, '.wav')
  const outputPath = join(outputDir, `${baseName}-sstv.png`)

  logger.image('Decoding SSTV image...')

  // Use Python wrapper to avoid TTY issues in non-interactive environments
  const wrapperPath = join(process.cwd(), 'scripts', 'sstv-decode-wrapper.py')
  const result = await runCommand('python3', [wrapperPath, wavPath, outputPath], {
    timeout: 300000,
  })

  const success = result.exitCode === 0 && (await fileExists(outputPath))

  success ? logger.image(`SSTV image saved: ${outputPath}`) : logger.warn('SSTV decoding failed')

  return success ? { outputPaths: [outputPath], metadata: { mode: 'auto-detected' } } : null
}

export const sstvDecoder: Decoder = {
  name: 'SSTV Decoder',
  signalType: 'sstv',

  async decode(wavPath: string, outputDir: string): Promise<DecoderResult | null> {
    const fileFound = await fileExists(wavPath)

    if (!fileFound) {
      logger.error(`Recording file not found: ${wavPath}`)
    }

    await (fileFound ? ensureDir(outputDir) : Promise.resolve())

    return fileFound ? decodeWithSstv(wavPath, outputDir) : null
  },

  async checkInstalled(): Promise<boolean> {
    try {
      // Check if Python wrapper script exists and sstv module is available
      const wrapperPath = join(process.cwd(), 'scripts', 'sstv-decode-wrapper.py')
      const wrapperExists = await fileExists(wrapperPath)

      if (!wrapperExists) {
        logger.warn('SSTV decoder wrapper script not found')
        return false
      }

      // Check if sstv Python module is installed
      const result = await runCommand('python3', ['-c', 'import sstv; print("OK")'])
      return result.exitCode === 0 && result.stdout.includes('OK')
    } catch {
      return false
    }
  },
}
