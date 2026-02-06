#!/usr/bin/env tsx
/**
 * Generate version.json file with build metadata
 * Usage: npm run version:generate
 */

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
    // Read base version from package.json
    const packageJson = require('../package.json')
    const baseVersion = packageJson.version || '2.0.0'

    // Generate date-based build number (YYYYMMDD format)
    const now = new Date()
    const dateBuild =
      now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate()

    // Return version in format: 2.0.YYYYMMDD
    const [major, minor] = baseVersion.split('.')
    return `${major}.${minor}.${dateBuild}`
  } catch {
    return '2.0.0'
  }
}

function main() {
  const versionInfo: VersionInfo = {
    version: getVersion(),
    commit: getGitCommit(),
    buildTime: new Date().toISOString(),
  }

  const outputPath = join(__dirname, '..', 'version.json')
  writeFileSync(outputPath, `${JSON.stringify(versionInfo)}\n`, 'utf8')

  console.log('Generated version.json:')
  console.log(`  Version: ${versionInfo.version}`)
  console.log(`  Commit:  ${versionInfo.commit}`)
  console.log(`  Build:   ${versionInfo.buildTime}`)
}

main()
