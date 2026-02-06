import type { SatelliteInfo } from '@backend/types'
import { SIGNAL } from '../satellites/constants'
import { logger } from '../utils/logger'
import { sleep } from '../utils/node-compat'
import { type RunningProcess, runCommand, spawnProcess } from '../utils/shell'

export interface SignalStrength {
  frequency: number
  power: number
  timestamp: Date
}

const parsePowerReadings = (stdout: string): { totalPower: number; count: number } =>
  stdout
    .trim()
    .split('\n')
    .reduce(
      (acc, line) => {
        const parts = line.split(',')
        const power = parts.length >= 7 ? Number.parseFloat(parts[6] ?? '0') : Number.NaN

        return !Number.isNaN(power) && Number.isFinite(power)
          ? { totalPower: acc.totalPower + power, count: acc.count + 1 }
          : acc
      },
      { totalPower: 0, count: 0 }
    )

const parsePowerFromLine = (line: string): number | null => {
  const parts = line.split(',')
  const power = parts.length >= 7 ? Number.parseFloat(parts[6] ?? '0') : Number.NaN
  return !Number.isNaN(power) && Number.isFinite(power) ? power : null
}

export async function checkSignalStrength(
  satellite: SatelliteInfo,
  gain: number
): Promise<SignalStrength | null> {
  const freqMHz = satellite.frequency / 1e6
  const startFreq = `${freqMHz}M`
  const endFreq = `${freqMHz + 1}M`

  try {
    const result = await runCommand('rtl_power', [
      '-f',
      `${startFreq}:${endFreq}:${SIGNAL.scanBandwidthHz}`,
      '-g',
      gain.toString(),
      '-i',
      '1',
      '-e',
      `${SIGNAL.scanDurationSeconds}s`,
      '-',
    ])

    const scanFailed = result.exitCode !== 0
    scanFailed && logger.warn(`Signal scan failed for ${satellite.name}`)

    const { totalPower, count } = scanFailed
      ? { totalPower: 0, count: 0 }
      : parsePowerReadings(result.stdout)

    return count > 0
      ? { frequency: satellite.frequency, power: totalPower / count, timestamp: new Date() }
      : null
  } catch (error) {
    logger.error(`Error checking signal for ${satellite.name}:`, error)
    return null
  }
}

const checkSignalOnce = async (
  satellite: SatelliteInfo,
  gain: number,
  minStrength: number,
  attemptNum: number,
  totalAttempts: number
): Promise<boolean> => {
  const strength = await checkSignalStrength(satellite, gain)
  const isStrong = strength !== null && strength.power > minStrength

  isStrong
    ? logger.debug(
        `Signal check ${attemptNum}/${totalAttempts}: ${strength.power.toFixed(1)} dB (pass)`
      )
    : logger.debug(`Signal check ${attemptNum}/${totalAttempts}: weak or no signal`)

  return isStrong
}

export async function verifySignal(
  satellite: SatelliteInfo,
  gain: number,
  minStrength: number,
  attempts = 3
): Promise<boolean> {
  const results: boolean[] = []

  for (let i = 0; i < attempts; i++) {
    const isStrong = await checkSignalOnce(satellite, gain, minStrength, i + 1, attempts)
    results.push(isStrong)

    const isNotLastAttempt = i < attempts - 1
    isNotLastAttempt && (await sleep(2000))
  }

  const successCount = results.filter(Boolean).length
  const passed = successCount >= Math.ceil(attempts / 2)

  logger.info(
    `Signal verification for ${satellite.name}: ${passed ? 'passed' : 'failed'} (${successCount}/${attempts})`
  )

  return passed
}

/**
 * Quick signal check at a specific frequency without full satellite info
 * Used for scanning frequencies during idle time
 */
export async function verifySignalAtFrequency(
  frequency: number,
  gain: number,
  minStrength: number
): Promise<boolean> {
  const freqMHz = frequency / 1e6
  const startFreq = `${freqMHz}M`
  const endFreq = `${freqMHz + 0.1}M` // Narrow scan for quick check

  try {
    const result = await runCommand('rtl_power', [
      '-f',
      `${startFreq}:${endFreq}:10k`,
      '-g',
      gain.toString(),
      '-i',
      '1',
      '-e',
      '2s', // Quick 2-second scan
      '-',
    ])

    if (result.exitCode !== 0) {
      return false
    }

    const { totalPower, count } = parsePowerReadings(result.stdout)
    if (count === 0) return false

    const avgPower = totalPower / count
    logger.debug(`Signal at ${freqMHz.toFixed(3)} MHz: ${avgPower.toFixed(1)} dB`)
    return avgPower > minStrength
  } catch (error) {
    logger.debug(`Error scanning ${freqMHz.toFixed(3)} MHz: ${error}`)
    return false
  }
}

export function startSignalMonitor(
  satellite: SatelliteInfo,
  gain: number,
  onReading: (power: number) => void
): RunningProcess {
  const freqMHz = satellite.frequency / 1e6
  const startFreq = `${freqMHz}M`
  const endFreq = `${freqMHz + 1}M`

  const proc = spawnProcess('rtl_power', [
    '-f',
    `${startFreq}:${endFreq}:${SIGNAL.scanBandwidthHz}`,
    '-g',
    gain.toString(),
    '-i',
    '2',
    '-',
  ])

  let buffer = ''

  proc.process.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    lines.forEach((line) => {
      const power = parsePowerFromLine(line)
      power !== null && onReading(power)
    })
  })

  return proc
}
