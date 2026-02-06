/**
 * Node.js compatibility layer for Bun APIs
 * Provides drop-in replacements for common Bun functions
 */

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
  const { readFile } = await import('node:fs/promises')
  return readFile(path, 'utf-8')
}

/**
 * Read file as buffer
 * Replacement for Bun.file().arrayBuffer()
 */
export async function readFileBuffer(path: string): Promise<ArrayBuffer> {
  const { readFile } = await import('node:fs/promises')
  const buffer = await readFile(path)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

/**
 * Write buffer to file
 * Replacement for Bun.write()
 */
export async function writeFile(path: string, data: ArrayBuffer | Uint8Array | string): Promise<void> {
  const { writeFile: fsWriteFile } = await import('node:fs/promises')
  await fsWriteFile(path, data instanceof ArrayBuffer ? Buffer.from(data) : data)
}

/**
 * Check if file exists
 */
export function fileExists(path: string): boolean {
  const { existsSync } = require('node:fs')
  return existsSync(path)
}
