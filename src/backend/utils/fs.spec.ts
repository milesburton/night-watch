import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureDir,
  ensureParentDir,
  fileExists,
  formatBytes,
  generateFilename,
  readTextFile,
  writeTextFile,
} from '@backend/utils/fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('fs utilities', () => {
  const testDir = join(tmpdir(), `rf-capture-test-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('ensureDir', () => {
    it('should create a directory', async () => {
      const dir = join(testDir, 'new-dir')
      await ensureDir(dir)
      expect(await fileExists(dir)).toBe(true)
    })

    it('should create nested directories', async () => {
      const dir = join(testDir, 'a', 'b', 'c')
      await ensureDir(dir)
      expect(await fileExists(dir)).toBe(true)
    })

    it('should not fail if directory exists', async () => {
      const dir = join(testDir, 'existing')
      await mkdir(dir)
      // Should complete without error - resolves to undefined
      await expect(ensureDir(dir)).resolves.toBeUndefined()
    })
  })

  describe('ensureParentDir', () => {
    it('should create parent directory for file path', async () => {
      const filePath = join(testDir, 'parent', 'file.txt')
      await ensureParentDir(filePath)
      expect(await fileExists(join(testDir, 'parent'))).toBe(true)
    })

    it('should handle nested parent directories', async () => {
      const filePath = join(testDir, 'a', 'b', 'c', 'file.txt')
      await ensureParentDir(filePath)
      expect(await fileExists(join(testDir, 'a', 'b', 'c'))).toBe(true)
    })
  })

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const filePath = join(testDir, 'exists.txt')
      await writeFile(filePath, 'test')
      expect(await fileExists(filePath)).toBe(true)
    })

    it('should return false for non-existing file', async () => {
      const filePath = join(testDir, 'not-exists.txt')
      expect(await fileExists(filePath)).toBe(false)
    })

    it('should return true for existing directory', async () => {
      expect(await fileExists(testDir)).toBe(true)
    })
  })

  describe('readTextFile', () => {
    it('should read file content', async () => {
      const filePath = join(testDir, 'read.txt')
      const content = 'Hello, World!'
      await writeFile(filePath, content)

      const result = await readTextFile(filePath)
      expect(result).toBe(content)
    })

    it('should read UTF-8 content', async () => {
      const filePath = join(testDir, 'utf8.txt')
      const content = 'Hello, 世界! 🌍'
      await writeFile(filePath, content, 'utf-8')

      const result = await readTextFile(filePath)
      expect(result).toBe(content)
    })

    it('should throw for non-existing file', async () => {
      const filePath = join(testDir, 'not-exists.txt')
      await expect(readTextFile(filePath)).rejects.toThrow()
    })
  })

  describe('writeTextFile', () => {
    it('should write file content', async () => {
      const filePath = join(testDir, 'write.txt')
      const content = 'Test content'

      await writeTextFile(filePath, content)
      const result = await readTextFile(filePath)

      expect(result).toBe(content)
    })

    it('should create parent directories', async () => {
      const filePath = join(testDir, 'new', 'dir', 'file.txt')
      const content = 'Nested content'

      await writeTextFile(filePath, content)
      const result = await readTextFile(filePath)

      expect(result).toBe(content)
    })

    it('should overwrite existing file', async () => {
      const filePath = join(testDir, 'overwrite.txt')
      await writeFile(filePath, 'old content')

      await writeTextFile(filePath, 'new content')
      const result = await readTextFile(filePath)

      expect(result).toBe('new content')
    })
  })

  describe('formatBytes', () => {
    it('should format bytes', () => {
      expect(formatBytes(100)).toBe('100 B')
      expect(formatBytes(500)).toBe('500 B')
    })

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1.0 KB')
      expect(formatBytes(2048)).toBe('2.0 KB')
      expect(formatBytes(1536)).toBe('1.5 KB')
    })

    it('should format megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
      expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB')
    })

    it('should handle zero', () => {
      expect(formatBytes(0)).toBe('0 B')
    })
  })

  describe('generateFilename', () => {
    it('should generate filename with satellite name and extension', () => {
      const filename = generateFilename('NOAA 19', 'wav')
      expect(filename).toMatch(/^NOAA-19_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.wav$/)
    })

    it('should replace spaces with dashes', () => {
      const filename = generateFilename('Test Satellite Name', 'png')
      expect(filename).toMatch(/^Test-Satellite-Name_/)
    })

    it('should include timestamp', () => {
      const before = new Date()
      const filename = generateFilename('SAT', 'txt')
      const timestampMatch = filename.match(/SAT_(\d{4}-\d{2}-\d{2})T(\d{2}-\d{2}-\d{2})/)

      expect(timestampMatch).not.toBeNull()
      if (timestampMatch) {
        const [, datePart, timePart] = timestampMatch
        const fileDate = new Date(`${datePart}T${timePart?.replace(/-/g, ':')}Z`)
        expect(fileDate.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
      }
    })
  })
})
