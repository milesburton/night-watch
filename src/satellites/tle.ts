import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SatelliteInfo, TwoLineElement } from '../types'
import { ensureDir, readTextFile, writeTextFile } from '../utils/fs'
import { logger } from '../utils/logger'
import { CELESTRAK_GP_API } from './constants'

const TLE_CACHE_DIR = join(homedir(), '.noaa-satellite-capture', 'tle')
const TLE_CACHE_FILE = join(TLE_CACHE_DIR, 'weather.txt')

interface TleCache {
  fetchedAt: number
  satellites: TwoLineElement[]
}

export async function fetchTle(satellite: SatelliteInfo): Promise<TwoLineElement | null> {
  const url = `${CELESTRAK_GP_API}?CATNR=${satellite.noradId}&FORMAT=TLE`

  try {
    const response = await fetch(url)

    if (!response.ok) {
      logger.error(`Failed to fetch TLE for ${satellite.name}: ${response.statusText}`)
      return null
    }

    const text = await response.text()
    return parseTleText(text, satellite.name)
  } catch (error) {
    logger.error(`Error fetching TLE for ${satellite.name}:`, error)
    return null
  }
}

export async function fetchAllTles(satellites: SatelliteInfo[]): Promise<TwoLineElement[]> {
  const results = await Promise.all(satellites.map(fetchTle))
  return results.filter((tle): tle is TwoLineElement => tle !== null)
}

function parseTleText(text: string, expectedName: string): TwoLineElement | null {
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())

  if (lines.length < 2) {
    return null
  }

  if (lines.length === 2 && lines[0]?.startsWith('1 ') && lines[1]?.startsWith('2 ')) {
    return {
      name: expectedName,
      line1: lines[0],
      line2: lines[1],
    }
  }

  if (lines.length >= 3 && lines[1]?.startsWith('1 ') && lines[2]?.startsWith('2 ')) {
    return {
      name: lines[0] ?? expectedName,
      line1: lines[1],
      line2: lines[2],
    }
  }

  return null
}

export async function loadCachedTles(maxAgeHours: number): Promise<TwoLineElement[] | null> {
  try {
    const cacheJson = await readTextFile(join(TLE_CACHE_DIR, 'cache.json'))
    const cache: TleCache = JSON.parse(cacheJson)

    const ageHours = (Date.now() - cache.fetchedAt) / (1000 * 60 * 60)

    if (ageHours > maxAgeHours) {
      logger.debug(`TLE cache expired (${ageHours.toFixed(1)} hours old)`)
      return null
    }

    logger.debug(`Using cached TLEs (${ageHours.toFixed(1)} hours old)`)
    return cache.satellites
  } catch {
    return null
  }
}

export async function saveTlesToCache(tles: TwoLineElement[]): Promise<void> {
  await ensureDir(TLE_CACHE_DIR)

  const cache: TleCache = {
    fetchedAt: Date.now(),
    satellites: tles,
  }

  await writeTextFile(join(TLE_CACHE_DIR, 'cache.json'), JSON.stringify(cache, null, 2))

  const tleText = tles.map((t) => `${t.name}\n${t.line1}\n${t.line2}`).join('\n\n')
  await writeTextFile(TLE_CACHE_FILE, tleText)

  logger.info(`Saved ${tles.length} TLEs to cache`)
}

export async function getTles(
  satellites: SatelliteInfo[],
  maxAgeHours: number
): Promise<TwoLineElement[]> {
  const cached = await loadCachedTles(maxAgeHours)

  if (cached && cached.length === satellites.length) {
    return cached
  }

  logger.info('Fetching fresh TLE data from CelesTrak...')
  const fresh = await fetchAllTles(satellites)

  if (fresh.length > 0) {
    await saveTlesToCache(fresh)
    return fresh
  }

  if (cached) {
    logger.warn('Using stale cached TLEs as fallback')
    return cached
  }

  throw new Error('Failed to obtain TLE data')
}
