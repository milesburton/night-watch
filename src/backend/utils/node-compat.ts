/**
 * Node.js compatibility layer for Bun APIs
 * Provides drop-in replacements for common Bun functions
 */

import { existsSync } from 'node:fs'
import { readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Sleep for a specified duration
 * Replacement for Bun.sleep()
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Read file contents
 * Replacement for Bun.file().text()
 */
export async function readFileText(path: string): Promise<string> {
  return fsReadFile(path, 'utf-8')
}

/**
 * Read file as buffer
 * Replacement for Bun.file().arrayBuffer()
 */
export async function readFileBuffer(path: string): Promise<ArrayBuffer> {
  const buffer = await fsReadFile(path)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

/**
 * Write buffer to file
 * Replacement for Bun.write()
 */
export async function writeFile(
  path: string,
  data: ArrayBuffer | Uint8Array | string
): Promise<void> {
  await fsWriteFile(path, data instanceof ArrayBuffer ? Buffer.from(data) : data)
}

/**
 * Check if file exists
 */
export function fileExists(path: string): boolean {
  return existsSync(path)
}

/**
 * Get directory name from import.meta.url
 * Replacement for import.meta.dir
 */
export function getDirname(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl))
}
