import { commandExists, runCommand, spawnProcess } from '@backend/utils/shell'
import { describe, expect, it } from 'vitest'

describe('shell utilities', () => {
  describe('runCommand', () => {
    it('should execute simple command', async () => {
      const result = await runCommand('echo', ['hello'])
      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim()).toBe('hello')
    })

    it('should capture stdout', async () => {
      const result = await runCommand('echo', ['line1\nline2'])
      expect(result.stdout).toContain('line1')
    })

    it('should capture stderr', async () => {
      const result = await runCommand('sh', ['-c', 'echo error >&2'])
      expect(result.stderr.trim()).toBe('error')
    })

    it('should return non-zero exit code for failed commands', async () => {
      const result = await runCommand('sh', ['-c', 'exit 1'])
      expect(result.exitCode).toBe(1)
    })

    it('should handle commands with multiple arguments', async () => {
      const result = await runCommand('printf', ['%s %s', 'hello', 'world'])
      expect(result.stdout).toBe('hello world')
    })
  })

  describe('spawnProcess', () => {
    it('should spawn a process that can be killed', async () => {
      const process = spawnProcess('sleep', ['10'])

      expect(process.process.pid).toBeDefined()
      expect(process.process.killed).toBe(false)

      process.kill()
      const result = await process.wait()

      expect(process.process.killed).toBe(true)
      // Process was killed - either returns signal-based exit code or 0 if already terminated
      expect(typeof result.exitCode).toBe('number')
    })

    it('should allow waiting for process completion', async () => {
      const process = spawnProcess('echo', ['test'])
      const result = await process.wait()

      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim()).toBe('test')
    })

    it('should capture output during execution', async () => {
      const process = spawnProcess('sh', ['-c', 'echo start; sleep 0.1; echo end'])
      const result = await process.wait()

      expect(result.stdout).toContain('start')
      expect(result.stdout).toContain('end')
    })
  })

  describe('commandExists', () => {
    it('should return true for existing command', async () => {
      const exists = await commandExists('echo')
      expect(exists).toBe(true)
    })

    it('should return true for ls', async () => {
      const exists = await commandExists('ls')
      expect(exists).toBe(true)
    })

    it('should return false for non-existing command', async () => {
      const exists = await commandExists('definitely-not-a-real-command-12345')
      expect(exists).toBe(false)
    })

    it('should return true for which', async () => {
      const exists = await commandExists('which')
      expect(exists).toBe(true)
    })
  })
})
