import { type ChildProcess, type SpawnOptions, spawn } from 'node:child_process'
import { logger } from './logger'

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface RunningProcess {
  process: ChildProcess
  kill: () => void
  wait: () => Promise<CommandResult>
}

export interface RunCommandOptions extends SpawnOptions {
  timeout?: number // Timeout in milliseconds - kills process if exceeded
}

export function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  const { timeout, ...spawnOptions } = options

  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { ...spawnOptions, stdio: 'pipe' })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | null = null

    if (timeout && timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL')
          }
        }, 2000)
      }, timeout)
    }

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('error', (error) => {
      if (timer) clearTimeout(timer)
      reject(new Error(`Failed to start ${command}: ${error.message}`))
    })

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (timedOut) {
        resolve({
          stdout,
          stderr: stderr || `Process timed out after ${timeout}ms`,
          exitCode: code ?? 1,
        })
      } else {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        })
      }
    })
  })
}

export function spawnProcess(
  command: string,
  args: string[],
  options: SpawnOptions = {}
): RunningProcess {
  const proc = spawn(command, args, { ...options, stdio: 'pipe' })

  let stdout = ''
  let stderr = ''

  proc.stdout?.on('data', (data) => {
    stdout += data.toString()
  })

  proc.stderr?.on('data', (data) => {
    stderr += data.toString()
  })

  return {
    process: proc,

    kill(): void {
      if (!proc.killed) {
        proc.kill('SIGTERM')
      }
    },

    wait(): Promise<CommandResult> {
      return new Promise((resolve) => {
        proc.on('close', (code) => {
          resolve({
            stdout,
            stderr,
            exitCode: code ?? 0,
          })
        })
      })
    },
  }
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    const result = await runCommand('which', [command])
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function checkDependencies(commands: string[]): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>()

  for (const cmd of commands) {
    const exists = await commandExists(cmd)
    results.set(cmd, exists)

    if (exists) {
      logger.debug(`Dependency found: ${cmd}`)
    } else {
      logger.warn(`Dependency missing: ${cmd}`)
    }
  }

  return results
}
