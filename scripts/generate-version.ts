#!/usr/bin/env tsx
/**
 * Generate version.json file with build metadata
 * Usage: npm run version:generate
 */

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface VersionInfo {
  version: string
  commit: string
  buildTime: string
}

function getGitCommit(): string {
  // Check for env var first (from Docker build args)
  if (process.env.GIT_COMMIT) {
    return process.env.GIT_COMMIT
  }
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function getVersion(): string {
  try {
    // Generate date-based build number (YYYYMMDD format)
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const day = String(now.getUTCDate()).padStart(2, '0')
    const dateBuild = `${year}${month}${day}`

    // Return version in format: 2.0.YYYYMMDD
    return `2.0.${dateBuild}`
  } catch (error) {
    console.error('Error generating version:', error)
    return '2.0.0'
  }
}

function main() {
  const versionInfo: VersionInfo = {
    version: getVersion(),
    commit: getGitCommit(),
    buildTime: new Date().toISOString(),
  }

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const outputPath = join(__dirname, '..', 'version.json')
  writeFileSync(outputPath, `${JSON.stringify(versionInfo)}\n`, 'utf8')

  console.log('Generated version.json:')
  console.log(`  Version: ${versionInfo.version}`)
  console.log(`  Commit:  ${versionInfo.commit}`)
  console.log(`  Build:   ${versionInfo.buildTime}`)
}

main()
