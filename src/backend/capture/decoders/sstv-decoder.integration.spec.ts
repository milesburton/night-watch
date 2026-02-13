import { describe, expect, it } from 'vitest'
import { fileExists } from '../../utils/fs'
import { runCommand } from '../../utils/shell'
import { sstvDecoder } from './sstv-decoder'

/**
 * Integration tests for SSTV decoder
 * These tests verify the actual decoder installation and functionality
 * Run with: npm test -- sstv-decoder.integration.spec.ts
 */
describe('sstvDecoder integration', () => {
  it('should have SSTV decoder wrapper script available', async () => {
    // The wrapper path should resolve correctly (4 levels up from decoders/)
    const result = await runCommand('bash', [
      '-c',
      'cd src/backend/capture/decoders && ls -la ../../../../scripts/sstv-decode-wrapper.py',
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('sstv-decode-wrapper.py')
  })

  it('should have Python SSTV dependencies installed', async () => {
    const result = await runCommand('python3', [
      '-c',
      'import sstv; from PIL import Image; print("SSTV OK")',
    ])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('SSTV OK')
  })

  it('should report as installed when dependencies are available', async () => {
    const installed = await sstvDecoder.checkInstalled()

    expect(installed).toBe(true)
  })

  it('wrapper script should be executable by Python', async () => {
    // Just verify we can run the wrapper with --help or --version
    // The actual decode test requires a real audio file
    const result = await runCommand('python3', [
      'scripts/sstv-decode-wrapper.py',
      '--help',
    ])

    // If script doesn't support --help, it will show usage or error
    // But it should not fail with "file not found"
    expect(result.stderr).not.toContain('No such file or directory')
  })
})
