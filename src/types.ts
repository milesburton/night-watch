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
  logLevel: LogLevel
}
