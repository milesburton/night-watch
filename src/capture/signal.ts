import { SIGNAL } from '../satellites/constants'
import type { SatelliteInfo } from '../types'
import { logger } from '../utils/logger'
import { type RunningProcess, runCommand, spawnProcess } from '../utils/shell'

export interface SignalStrength {
  frequency: number
  power: number
  timestamp: Date
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

    if (result.exitCode !== 0) {
      logger.warn(`Signal scan failed for ${satellite.name}`)
      return null
    }

    const lines = result.stdout.trim().split('\n')
    let totalPower = 0
    let count = 0

    for (const line of lines) {
      const parts = line.split(',')
      if (parts.length >= 7) {
        const power = Number.parseFloat(parts[6] ?? '0')
        if (!Number.isNaN(power) && Number.isFinite(power)) {
          totalPower += power
          count++
        }
      }
    }

    if (count === 0) {
      return null
    }

    return {
      frequency: satellite.frequency,
      power: totalPower / count,
      timestamp: new Date(),
    }
  } catch (error) {
    logger.error(`Error checking signal for ${satellite.name}:`, error)
    return null
  }
}

export async function verifySignal(
  satellite: SatelliteInfo,
  gain: number,
  minStrength: number,
  attempts = 3
): Promise<boolean> {
  let successCount = 0

  for (let i = 0; i < attempts; i++) {
    const strength = await checkSignalStrength(satellite, gain)

    if (strength && strength.power > minStrength) {
      successCount++
      logger.debug(`Signal check ${i + 1}/${attempts}: ${strength.power.toFixed(1)} dB (pass)`)
    } else {
      logger.debug(`Signal check ${i + 1}/${attempts}: weak or no signal`)
    }

    if (i < attempts - 1) {
      await Bun.sleep(2000)
    }
  }

  const passed = successCount >= Math.ceil(attempts / 2)
  logger.info(
    `Signal verification for ${satellite.name}: ${passed ? 'passed' : 'failed'} (${successCount}/${attempts})`
  )

  return passed
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

    for (const line of lines) {
      const parts = line.split(',')
      if (parts.length >= 7) {
        const power = Number.parseFloat(parts[6] ?? '0')
        if (!Number.isNaN(power) && Number.isFinite(power)) {
          onReading(power)
        }
      }
    }
  })

  return proc
}
