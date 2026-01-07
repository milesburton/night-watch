import { basename, dirname, join } from 'node:path'
import { ensureDir, fileExists } from '../utils/fs'
import { logger } from '../utils/logger'
import { runCommand } from '../utils/shell'

export interface DecodedImages {
  channelA?: string
  channelB?: string
  composite?: string
}

export async function decodeRecording(
  wavPath: string,
  outputDir: string
): Promise<DecodedImages | null> {
  if (!(await fileExists(wavPath))) {
    logger.error(`Recording file not found: ${wavPath}`)
    return null
  }

  await ensureDir(outputDir)

  const baseName = basename(wavPath, '.wav')
  const channelAPath = join(outputDir, `${baseName}-chA.png`)
  const channelBPath = join(outputDir, `${baseName}-chB.png`)
  const compositePath = join(outputDir, `${baseName}-colour.png`)

  const results: DecodedImages = {}

  logger.image('Decoding Channel A...')
  const chAResult = await runCommand('aptdec', ['-A', '-o', channelAPath, wavPath], {
    timeout: 300000,
  })

  if (chAResult.exitCode === 0 && (await fileExists(channelAPath))) {
    results.channelA = channelAPath
    logger.image(`Channel A saved: ${channelAPath}`)
  } else {
    logger.warn('Channel A decoding failed')
  }

  logger.image('Decoding Channel B...')
  const chBResult = await runCommand('aptdec', ['-B', '-o', channelBPath, wavPath], {
    timeout: 300000,
  })

  if (chBResult.exitCode === 0 && (await fileExists(channelBPath))) {
    results.channelB = channelBPath
    logger.image(`Channel B saved: ${channelBPath}`)
  } else {
    logger.warn('Channel B decoding failed')
  }

  logger.image('Creating colour composite...')
  const compositeResult = await runCommand('aptdec', ['-c', '-o', compositePath, wavPath], {
    timeout: 300000,
  })

  if (compositeResult.exitCode === 0 && (await fileExists(compositePath))) {
    results.composite = compositePath
    logger.image(`Colour composite saved: ${compositePath}`)
  } else {
    logger.warn('Colour composite creation failed')
  }

  if (!results.channelA && !results.channelB && !results.composite) {
    logger.error('All decoding attempts failed')
    return null
  }

  return results
}

export async function checkAptdecInstalled(): Promise<boolean> {
  try {
    const result = await runCommand('which', ['aptdec'])
    return result.exitCode === 0
  } catch {
    return false
  }
}
