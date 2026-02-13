import { TEST_SATELLITE } from '@/test-fixtures'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('@backend/utils/shell', () => ({
  runCommand: vi.fn(),
  spawnProcess: vi.fn(),
}))

vi.mock('@backend/utils/node-compat', () => ({
  sleep: vi.fn(),
}))

// Import after mocks
import { sleep } from '@backend/utils/node-compat'
import { type RunningProcess, runCommand, spawnProcess } from '@backend/utils/shell'
import {
  checkSignalStrength,
  startSignalMonitor,
  verifySignal,
  verifySignalAtFrequency,
} from './signal'

describe('signal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sleep).mockResolvedValue()
  })

  describe('checkSignalStrength', () => {
    it('should return signal strength for valid rtl_power output', async () => {
      const mockOutput = [
        '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -45.2',
        '2024-01-01, 00:00:01, 137900000, 137950000, 50000, 1, -42.8',
        '2024-01-01, 00:00:02, 137900000, 137950000, 50000, 1, -44.5',
      ].join('\n')

      vi.mocked(runCommand).mockResolvedValue({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
      })

      const result = await checkSignalStrength(TEST_SATELLITE, 49)

      expect(result).not.toBeNull()
      expect(result?.frequency).toBe(TEST_SATELLITE.frequency)
      expect(result?.power).toBeCloseTo(-44.17, 1) // Average of -45.2, -42.8, -44.5
      expect(result?.timestamp).toBeInstanceOf(Date)

      expect(vi.mocked(runCommand)).toHaveBeenCalledWith('rtl_power', [
        '-f',
        '137.9M:138.9M:25000',
        '-g',
        '49',
        '-i',
        '1',
        '-e',
        '5s',
        '-',
      ])
    })

    it('should return null when rtl_power fails', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '',
        stderr: 'Error: Failed to open RTL-SDR device',
        exitCode: 1,
      })

      const result = await checkSignalStrength(TEST_SATELLITE, 49)

      expect(result).toBeNull()
    })

    it('should return null when output has no valid power readings', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: 'invalid data\nmore invalid\n',
        stderr: '',
        exitCode: 0,
      })

      const result = await checkSignalStrength(TEST_SATELLITE, 49)

      expect(result).toBeNull()
    })

    it('should handle output with mix of valid and invalid lines', async () => {
      const mockOutput = [
        '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -40.0',
        'invalid line',
        '2024-01-01, 00:00:02, 137900000, 137950000, 50000, 1, -50.0',
      ].join('\n')

      vi.mocked(runCommand).mockResolvedValue({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
      })

      const result = await checkSignalStrength(TEST_SATELLITE, 49)

      expect(result).not.toBeNull()
      expect(result?.power).toBeCloseTo(-45.0, 1) // Average of -40.0 and -50.0
    })

    it('should handle NaN and Infinity values in power readings', async () => {
      const mockOutput = [
        '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, NaN',
        '2024-01-01, 00:00:01, 137900000, 137950000, 50000, 1, Infinity',
        '2024-01-01, 00:00:02, 137900000, 137950000, 50000, 1, -40.0',
      ].join('\n')

      vi.mocked(runCommand).mockResolvedValue({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
      })

      const result = await checkSignalStrength(TEST_SATELLITE, 49)

      expect(result).not.toBeNull()
      expect(result?.power).toBe(-40.0) // Only valid reading
    })

    it('should handle exception during rtl_power execution', async () => {
      vi.mocked(runCommand).mockRejectedValue(new Error('Command failed'))

      const result = await checkSignalStrength(TEST_SATELLITE, 49)

      expect(result).toBeNull()
    })
  })

  describe('verifySignal', () => {
    it('should return true when majority of checks pass', async () => {
      // 2 out of 3 checks pass (strong signal)
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -30.0',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -70.0',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -30.0',
          stderr: '',
          exitCode: 0,
        })

      const result = await verifySignal(TEST_SATELLITE, 49, -35, 3)

      expect(result).toBe(true)
      expect(vi.mocked(runCommand)).toHaveBeenCalledTimes(3)
    })

    it('should return false when majority of checks fail', async () => {
      // Only 1 out of 3 checks pass (weak signal)
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -70.0',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -30.0',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -70.0',
          stderr: '',
          exitCode: 0,
        })

      const result = await verifySignal(TEST_SATELLITE, 49, -35, 3)

      expect(result).toBe(false)
    })

    it('should sleep between attempts except after last attempt', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -30.0',
        stderr: '',
        exitCode: 0,
      })

      await verifySignal(TEST_SATELLITE, 49, -35, 3)

      // Should sleep 2 times (between attempts 1-2 and 2-3, not after 3)
      expect(vi.mocked(sleep)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(sleep)).toHaveBeenCalledWith(2000)
    })

    it('should handle custom number of attempts', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -30.0',
        stderr: '',
        exitCode: 0,
      })

      await verifySignal(TEST_SATELLITE, 49, -35, 5)

      expect(vi.mocked(runCommand)).toHaveBeenCalledTimes(5)
      expect(vi.mocked(sleep)).toHaveBeenCalledTimes(4) // Between 5 attempts
    })

    it('should handle single attempt', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -30.0',
        stderr: '',
        exitCode: 0,
      })

      const result = await verifySignal(TEST_SATELLITE, 49, -35, 1)

      expect(result).toBe(true)
      expect(vi.mocked(runCommand)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(sleep)).not.toHaveBeenCalled()
    })

    it('should use majority voting for even number of attempts', async () => {
      // 2 out of 4 checks pass - needs ceiling(4/2) = 2 to pass
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -30.0',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -30.0',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -70.0',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -70.0',
          stderr: '',
          exitCode: 0,
        })

      const result = await verifySignal(TEST_SATELLITE, 49, -35, 4)

      expect(result).toBe(true) // 2 passes = ceiling(4/2) = 2 required
    })

    it('should handle null signal strength readings', async () => {
      vi.mocked(runCommand)
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 1, // Failed scan
        })
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -30.0',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -30.0',
          stderr: '',
          exitCode: 0,
        })

      const result = await verifySignal(TEST_SATELLITE, 49, -35, 3)

      expect(result).toBe(true) // 2 out of 3 pass
    })
  })

  describe('verifySignalAtFrequency', () => {
    it('should return true for strong signal at frequency', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '2024-01-01, 00:00:00, 145800000, 145810000, 10000, 1, -30.0',
        stderr: '',
        exitCode: 0,
      })

      const result = await verifySignalAtFrequency(145.8e6, 49, -35)

      expect(result).toBe(true)
      expect(vi.mocked(runCommand)).toHaveBeenCalledWith('rtl_power', [
        '-f',
        '145.8M:145.9M:10k',
        '-g',
        '49',
        '-i',
        '1',
        '-e',
        '2s',
        '-',
      ])
    })

    it('should return false for weak signal', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '2024-01-01, 00:00:00, 145800000, 145810000, 10000, 1, -70.0',
        stderr: '',
        exitCode: 0,
      })

      const result = await verifySignalAtFrequency(145.8e6, 49, -35)

      expect(result).toBe(false)
    })

    it('should return false when rtl_power fails', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: '',
        stderr: 'Error',
        exitCode: 1,
      })

      const result = await verifySignalAtFrequency(145.8e6, 49, -35)

      expect(result).toBe(false)
    })

    it('should return false when no valid readings', async () => {
      vi.mocked(runCommand).mockResolvedValue({
        stdout: 'invalid data\n',
        stderr: '',
        exitCode: 0,
      })

      const result = await verifySignalAtFrequency(145.8e6, 49, -35)

      expect(result).toBe(false)
    })

    it('should handle exception during scan', async () => {
      vi.mocked(runCommand).mockRejectedValue(new Error('Command failed'))

      const result = await verifySignalAtFrequency(145.8e6, 49, -35)

      expect(result).toBe(false)
    })
  })

  describe('startSignalMonitor', () => {
    it('should start rtl_power process and parse streaming output', () => {
      const mockStdout = {
        on: vi.fn(),
      }
      const mockProcess = {
        stdout: mockStdout,
      }
      const mockRunningProcess: RunningProcess = {
        process: mockProcess,
        kill: vi.fn(),
        wait: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      } as unknown as RunningProcess

      vi.mocked(spawnProcess).mockReturnValue(mockRunningProcess)

      const onReading = vi.fn()
      const proc = startSignalMonitor(TEST_SATELLITE, 49, onReading)

      expect(proc).toBe(mockRunningProcess)
      expect(vi.mocked(spawnProcess)).toHaveBeenCalledWith('rtl_power', [
        '-f',
        '137.9M:138.9M:25000',
        '-g',
        '49',
        '-i',
        '2',
        '-',
      ])
    })

    it('should parse power readings from stdout data', () => {
      const mockStdout = {
        on: vi.fn(),
      }
      const mockProcess = {
        stdout: mockStdout,
      }
      const mockRunningProcess: RunningProcess = {
        process: mockProcess,
        kill: vi.fn(),
        wait: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      } as unknown as RunningProcess

      vi.mocked(spawnProcess).mockReturnValue(mockRunningProcess)

      const onReading = vi.fn()
      startSignalMonitor(TEST_SATELLITE, 49, onReading)

      // Get the data callback
      const dataCallback = mockStdout.on.mock.calls.find((call) => call[0] === 'data')?.[1]
      expect(dataCallback).toBeDefined()

      // Simulate receiving data
      const data1 = Buffer.from('2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -45.2\n')
      dataCallback(data1)

      expect(onReading).toHaveBeenCalledWith(-45.2)
    })

    it('should handle partial lines by buffering', () => {
      const mockStdout = {
        on: vi.fn(),
      }
      const mockProcess = {
        stdout: mockStdout,
      }
      const mockRunningProcess: RunningProcess = {
        process: mockProcess,
        kill: vi.fn(),
        wait: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      } as unknown as RunningProcess

      vi.mocked(spawnProcess).mockReturnValue(mockRunningProcess)

      const onReading = vi.fn()
      startSignalMonitor(TEST_SATELLITE, 49, onReading)

      const dataCallback = mockStdout.on.mock.calls.find((call) => call[0] === 'data')?.[1]

      // Send partial line
      dataCallback(Buffer.from('2024-01-01, 00:00:00, 137900'))
      expect(onReading).not.toHaveBeenCalled()

      // Complete the line
      dataCallback(Buffer.from('000, 137950000, 50000, 1, -45.2\n'))
      expect(onReading).toHaveBeenCalledWith(-45.2)
    })

    it('should handle multiple lines in one data chunk', () => {
      const mockStdout = {
        on: vi.fn(),
      }
      const mockProcess = {
        stdout: mockStdout,
      }
      const mockRunningProcess: RunningProcess = {
        process: mockProcess,
        kill: vi.fn(),
        wait: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      } as unknown as RunningProcess

      vi.mocked(spawnProcess).mockReturnValue(mockRunningProcess)

      const onReading = vi.fn()
      startSignalMonitor(TEST_SATELLITE, 49, onReading)

      const dataCallback = mockStdout.on.mock.calls.find((call) => call[0] === 'data')?.[1]

      const multiLineData = Buffer.from(
        '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -45.2\n' +
          '2024-01-01, 00:00:01, 137900000, 137950000, 50000, 1, -42.8\n' +
          '2024-01-01, 00:00:02, 137900000, 137950000, 50000, 1, -44.5\n'
      )
      dataCallback(multiLineData)

      expect(onReading).toHaveBeenCalledTimes(3)
      expect(onReading).toHaveBeenNthCalledWith(1, -45.2)
      expect(onReading).toHaveBeenNthCalledWith(2, -42.8)
      expect(onReading).toHaveBeenNthCalledWith(3, -44.5)
    })

    it('should skip invalid power readings', () => {
      const mockStdout = {
        on: vi.fn(),
      }
      const mockProcess = {
        stdout: mockStdout,
      }
      const mockRunningProcess: RunningProcess = {
        process: mockProcess,
        kill: vi.fn(),
        wait: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      } as unknown as RunningProcess

      vi.mocked(spawnProcess).mockReturnValue(mockRunningProcess)

      const onReading = vi.fn()
      startSignalMonitor(TEST_SATELLITE, 49, onReading)

      const dataCallback = mockStdout.on.mock.calls.find((call) => call[0] === 'data')?.[1]

      const dataWithInvalid = Buffer.from(
        'invalid line\n' +
          '2024-01-01, 00:00:00, 137900000, 137950000, 50000, 1, -45.2\n' +
          'another invalid line\n' +
          '2024-01-01, 00:00:01, 137900000, 137950000, 50000, 1, NaN\n' +
          '2024-01-01, 00:00:02, 137900000, 137950000, 50000, 1, -42.8\n'
      )
      dataCallback(dataWithInvalid)

      expect(onReading).toHaveBeenCalledTimes(2)
      expect(onReading).toHaveBeenNthCalledWith(1, -45.2)
      expect(onReading).toHaveBeenNthCalledWith(2, -42.8)
    })
  })
})
