export interface Coordinates {
  latitude: number
  longitude: number
  altitude: number
}

export interface SatelliteInfo {
  name: string
  noradId: number
  frequency: number
}

export interface TwoLineElement {
  name: string
  line1: string
  line2: string
}

export interface SatellitePosition {
  azimuth: number
  elevation: number
  rangeSat: number
  timestamp: Date
}

export interface SatellitePass {
  satellite: SatelliteInfo
  aos: Date
  los: Date
  maxElevation: number
  maxElevationTime: Date
  duration: number
}

export interface PassPrediction {
  pass: SatellitePass
  positions: SatellitePosition[]
}

export interface CaptureResult {
  satellite: SatelliteInfo
  recordingPath: string
  imagePaths: string[]
  startTime: Date
  endTime: Date
  maxSignalStrength: number
  success: boolean
  error?: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface ReceiverConfig {
  station: Coordinates
  sdr: {
    gain: number
    sampleRate: number
    ppmCorrection: number
  }
  recording: {
    minElevation: number
    minSignalStrength: number
    recordingsDir: string
    imagesDir: string
  }
  tle: {
    updateIntervalHours: number
  }
  web: {
    port: number
    host: string
  }
  database: {
    path: string
  }
  logLevel: LogLevel
}

// System state types for web dashboard
export type SystemStatus = 'idle' | 'waiting' | 'capturing' | 'decoding'

export interface SystemState {
  status: SystemStatus
  currentPass: SatellitePass | null
  nextPass: SatellitePass | null
  upcomingPasses: SatellitePass[]
  captureProgress: number
  captureElapsed: number
  captureTotal: number
  lastUpdate: Date
}

export type StateEvent =
  | { type: 'status_change'; status: SystemStatus }
  | { type: 'pass_start'; pass: SatellitePass }
  | { type: 'pass_complete'; result: CaptureResult }
  | { type: 'capture_progress'; progress: number; elapsed: number; total: number }
  | { type: 'passes_updated'; passes: SatellitePass[] }

export interface CaptureHistoryEntry {
  id: number
  passId: string
  satelliteName: string
  satelliteNoradId: number
  frequency: number
  aosTime: string
  losTime: string
  maxElevation: number
  durationSeconds: number
  recordingPath: string | null
  startTime: string
  endTime: string | null
  maxSignalStrength: number | null
  success: boolean
  errorMessage: string | null
  createdAt: string
  imagePaths: string[]
}
