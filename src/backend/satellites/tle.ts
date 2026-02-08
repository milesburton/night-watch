import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SatelliteInfo, TwoLineElement } from '@backend/types'
import { ensureDir, readTextFile, writeTextFile } from '../utils/fs'
import { logger } from '../utils/logger'
import { CELESTRAK_GP_API } from './constants'

const TLE_CACHE_DIR = join(homedir(), '.night-watch', 'tle')
const TLE_CACHE_FILE = join(TLE_CACHE_DIR, 'weather.txt')

interface TleCache {
  fetchedAt: number
  satellites: TwoLineElement[]
}

const parseTleText = (text: string, expectedName: string): TwoLineElement | null => {
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())

  const [line0, line1, line2] = lines

  const isTwoLineFormat = lines.length === 2 && line0?.startsWith('1 ') && line1?.startsWith('2 ')
  const isThreeLineFormat = lines.length >= 3 && line1?.startsWith('1 ') && line2?.startsWith('2 ')

  return isTwoLineFormat && line0 && line1
    ? { name: expectedName, line1: line0, line2: line1 }
    : isThreeLineFormat && line1 && line2
      ? { name: line0 ?? expectedName, line1, line2 }
      : null
}

export async function fetchTle(satellite: SatelliteInfo): Promise<TwoLineElement | null> {
  const url = `${CELESTRAK_GP_API}?CATNR=${satellite.noradId}&FORMAT=TLE`

  try {
    const response = await fetch(url)
    const responseOk = response.ok

    !responseOk && logger.error(`Failed to fetch TLE for ${satellite.name}: ${response.statusText}`)

    const text = responseOk ? await response.text() : ''

    return responseOk ? parseTleText(text, satellite.name) : null
  } catch (error) {
    logger.error(`Error fetching TLE for ${satellite.name}:`, error)
    return null
  }
}

export async function fetchAllTles(satellites: SatelliteInfo[]): Promise<TwoLineElement[]> {
  const results = await Promise.all(satellites.map(fetchTle))
  return results.filter((tle): tle is TwoLineElement => tle !== null)
}

export async function loadCachedTles(maxAgeHours: number): Promise<TwoLineElement[] | null> {
  try {
    const cacheJson = await readTextFile(join(TLE_CACHE_DIR, 'cache.json'))
    const cache: TleCache = JSON.parse(cacheJson)
    const ageHours = (Date.now() - cache.fetchedAt) / (1000 * 60 * 60)
    const isExpired = ageHours > maxAgeHours

    isExpired
      ? logger.debug(`TLE cache expired (${ageHours.toFixed(1)} hours old)`)
      : logger.debug(`Using cached TLEs (${ageHours.toFixed(1)} hours old)`)

    return isExpired ? null : cache.satellites
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
  const cacheIsValid = cached !== null && cached.length === satellites.length

  const fresh = cacheIsValid
    ? []
    : await (async () => {
        logger.info('Fetching fresh TLE data from CelesTrak...')
        return fetchAllTles(satellites)
      })()

  const hasFresh = fresh.length > 0
  hasFresh && (await saveTlesToCache(fresh))

  const result = cacheIsValid ? cached : hasFresh ? fresh : cached

  if (result === null) {
    throw new Error('Failed to obtain TLE data')
  }

  !cacheIsValid && !hasFresh && cached && logger.warn('Using stale cached TLEs as fallback')

  return result
}
