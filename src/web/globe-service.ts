import { computeGroundTrack } from '../prediction/ground-track'
import { getSatelliteGeolocation } from '../prediction/orbit'
import { SATELLITES } from '../satellites/constants'
import { getTles } from '../satellites/tle'
import { stateManager } from '../state/state-manager'
import type { Coordinates, GlobeState, SatelliteGeolocation, TwoLineElement } from '../types'
import { logger } from '../utils/logger'

const POSITION_UPDATE_INTERVAL_MS = 3000
const GROUND_TRACK_UPDATE_INTERVAL_MS = 60000
const GROUND_TRACK_DURATION_MINUTES = 90
const GROUND_TRACK_STEP_SECONDS = 30

let positionInterval: Timer | null = null
let groundTrackInterval: Timer | null = null
let cachedTles: TwoLineElement[] = []
let cachedGroundTracks: GlobeState['groundTracks'] = []
let stationCoords: Coordinates | null = null

async function updateTles(): Promise<void> {
  try {
    cachedTles = await getTles(SATELLITES, 24)
  } catch (error) {
    logger.warn('Failed to update TLEs for globe service:', error)
  }
}

function computeCurrentPositions(): SatelliteGeolocation[] {
  const now = new Date()
  const positions: SatelliteGeolocation[] = []

  for (const satellite of SATELLITES) {
    const tle = cachedTles.find((t) => t.name === satellite.name)
    if (!tle) continue

    const position = getSatelliteGeolocation(tle, satellite, now)
    if (position) {
      positions.push(position)
    }
  }

  return positions
}

function updateGroundTracks(): void {
  const now = new Date()
  cachedGroundTracks = []

  for (const satellite of SATELLITES) {
    const tle = cachedTles.find((t) => t.name === satellite.name)
    if (!tle) continue

    const track = computeGroundTrack(
      tle,
      satellite,
      now,
      GROUND_TRACK_DURATION_MINUTES,
      GROUND_TRACK_STEP_SECONDS
    )
    cachedGroundTracks.push(track)
  }
}

function broadcastGlobeState(): void {
  if (!stationCoords) return

  const satellites = computeCurrentPositions()
  const globe: GlobeState = {
    satellites,
    groundTracks: cachedGroundTracks,
    station: {
      latitude: stationCoords.latitude,
      longitude: stationCoords.longitude,
    },
  }

  stateManager.emitGlobeState(globe)
}

export function getGlobeState(): GlobeState | null {
  if (!stationCoords) return null

  return {
    satellites: computeCurrentPositions(),
    groundTracks: cachedGroundTracks,
    station: {
      latitude: stationCoords.latitude,
      longitude: stationCoords.longitude,
    },
  }
}

export async function startGlobeService(station: Coordinates): Promise<void> {
  stationCoords = station

  await updateTles()
  updateGroundTracks()

  positionInterval = setInterval(() => {
    broadcastGlobeState()
  }, POSITION_UPDATE_INTERVAL_MS)

  groundTrackInterval = setInterval(() => {
    updateGroundTracks()
  }, GROUND_TRACK_UPDATE_INTERVAL_MS)

  broadcastGlobeState()
  logger.info('Globe service started')
}

export function stopGlobeService(): void {
  if (positionInterval) {
    clearInterval(positionInterval)
    positionInterval = null
  }
  if (groundTrackInterval) {
    clearInterval(groundTrackInterval)
    groundTrackInterval = null
  }
  logger.info('Globe service stopped')
}
