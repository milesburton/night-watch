import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await ensureDir(dirname(filePath))
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf-8')
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await ensureParentDir(path)
  await writeFile(path, content, 'utf-8')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function generateFilename(satellite: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeName = satellite.replace(/\s+/g, '-')
  return `${safeName}_${timestamp}.${extension}`
}
