export interface Coordinates {
  latitude: number
  longitude: number
  altitude: number
}

export type SignalType = 'apt' | 'sstv' | 'lrpt'

export type DemodulationType = 'fm' | 'am' | 'ssb'

export interface SignalConfig {
  type: SignalType
  bandwidth: number
  sampleRate: number
  demodulation: DemodulationType
}

export interface SatelliteInfo {
  name: string
  noradId: number
  frequency: number
  signalType: SignalType
  signalConfig: SignalConfig
  enabled: boolean
  eventBased?: boolean
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

export interface SatelliteGeolocation {
  noradId: number
  name: string
  latitude: number
  longitude: number
  altitude: number
  signalType: SignalType
}

export interface GroundTrackPoint {
  lat: number
  lng: number
}

export interface GroundTrack {
  noradId: number
  name: string
  signalType: SignalType
  points: GroundTrackPoint[]
}

export interface GlobeState {
  satellites: SatelliteGeolocation[]
  groundTracks: GroundTrack[]
  station: {
    latitude: number
    longitude: number
  }
}

export interface SatellitePass {
  satellite: SatelliteInfo
  aos: Date
  los: Date
  maxElevation: number
  maxElevationTime: Date
  duration: number
}

export interface DopplerPoint {
  timestamp: Date
  frequency: number
  shift: number
}

export interface DopplerData {
  points: DopplerPoint[]
  maxShift: number
  minShift: number
}

export interface PassPrediction {
  pass: SatellitePass
  positions: SatellitePosition[]
  doppler?: DopplerData
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

/**
 * Service mode determines which components run:
 * - 'full': Everything on one machine (default, backwards compatible)
 * - 'sdr-relay': Only SDR relay server (runs on Pi with SDR hardware)
 * - 'server': API + Frontend + Scheduler (connects to remote SDR relay)
 */
export type ServiceMode = 'full' | 'sdr-relay' | 'server'

export interface ReceiverConfig {
  /** Service mode - determines which components to run */
  serviceMode: ServiceMode
  /** SDR relay configuration (for split deployment) */
  sdrRelay: {
    /** URL of remote SDR relay (when serviceMode='server') */
    url?: string
    /** Port for SDR relay server (when serviceMode='sdr-relay') */
    port: number
    /** Host for SDR relay server (when serviceMode='sdr-relay') */
    host: string
  }
  station: Coordinates
  sdr: {
    gain: number
    sampleRate: number
    ppmCorrection: number
  }
  recording: {
    minElevation: number
    minSignalStrength: number
    skipSignalCheck: boolean
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
  issSstvEnabled: boolean
}

// System state types for web dashboard
export type SystemStatus = 'idle' | 'waiting' | 'capturing' | 'decoding' | 'scanning'

export interface SystemState {
  status: SystemStatus
  currentPass: SatellitePass | null
  nextPass: SatellitePass | null
  upcomingPasses: SatellitePass[]
  captureProgress: number
  captureElapsed: number
  captureTotal: number
  lastUpdate: Date
  // 2M SSTV scanning state
  scanningFrequency?: number
  scanningFrequencyName?: string
}

export type StateEvent =
  | { type: 'status_change'; status: SystemStatus }
  | { type: 'pass_start'; pass: SatellitePass }
  | { type: 'pass_complete'; result: CaptureResult }
  | { type: 'capture_progress'; progress: number; elapsed: number; total: number }
  | { type: 'passes_updated'; passes: SatellitePass[] }
  | { type: 'satellite_positions'; globe: GlobeState }
  | { type: 'scanning_frequency'; frequency: number; name: string }

export interface CaptureHistoryEntry {
  id: number
  passId: string
  satelliteName: string
  satelliteNoradId: number
  frequency: number
  signalType: SignalType
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

export interface SSTVEvent {
  id: string
  name: string
  startTime: Date
  endTime: Date
  modes: string[]
  active: boolean
}

export interface SSTVStatus {
  enabled: boolean
  manualEnabled: boolean
  groundScanEnabled: boolean
  status: 'idle' | 'capturing' | 'scanning'
  activeEvent: SSTVEvent | null
  upcomingEvents: SSTVEvent[]
}
