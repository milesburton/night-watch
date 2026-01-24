export type SystemStatus = 'idle' | 'waiting' | 'recording' | 'decoding' | 'scanning'

export interface SatelliteInfo {
  name: string
  noradId: number
  frequency: number
  signalType: 'apt' | 'sstv'
}

export interface SatellitePass {
  satellite: SatelliteInfo
  aos: Date | string
  los: Date | string
  maxElevation: number
  duration: number
}

export interface SatelliteGeolocation {
  name: string
  latitude: number
  longitude: number
  altitude: number
  signalType: 'apt' | 'sstv'
}

export interface GroundTrack {
  name: string
  signalType: 'apt' | 'sstv'
  points: Array<{ lat: number; lng: number }>
}

export interface GlobeState {
  satellites: SatelliteGeolocation[]
  groundTracks: GroundTrack[]
  station: {
    latitude: number
    longitude: number
  }
}

export interface DopplerState {
  current: number
  min: number
  max: number
}

export interface SystemState {
  status: SystemStatus
  statusMessage?: string
  currentPass: SatellitePass | null
  nextPass: SatellitePass | null
  upcomingPasses: SatellitePass[]
  captureProgress: number
  captureElapsed: number
  captureTotal: number
  lastUpdate: string
  sdrConnected?: boolean
  doppler?: DopplerState
  // 2M SSTV scanning state
  scanningFrequency?: number
  scanningFrequencyName?: string
}

export interface SstvStatus {
  enabled: boolean
  manualEnabled: boolean
  groundScanEnabled: boolean
  status: 'idle' | 'capturing' | 'scanning'
  activeEvent: unknown | null
  upcomingEvents: unknown[]
  lastCapture?: string
}

export interface CaptureRecord {
  id: number
  satellite: string
  satelliteName: string
  signalType: string
  startTime: string
  timestamp: string
  durationSeconds: number
  maxElevation: number
  success: boolean
  errorMessage: string | null
  imagePath?: string
  imagePaths: string[]
}

export interface CaptureSummary {
  total: number
  successful: number
  failed: number
}

export interface VersionInfo {
  version: string
  commit: string
  buildTime: string | null
}

export interface StationConfig {
  station: {
    latitude: number
    longitude: number
    altitude: number
  }
  sdr: {
    gain: number
    ppmCorrection: number
    sampleRate: number
  }
  recording: {
    minElevation: number
    minSignalStrength: number
  }
}

export interface DopplerData {
  points: Array<{ time: string; shift: number }>
  maxShift: number
  minShift: number
}

export interface CaptureProgress {
  percentage: number
  elapsed: number
  total: number
}

export interface WsState {
  connected: boolean
  error: string | null
  reconnectAttempts: number
}

// FFT data from SDR
export interface FFTData {
  timestamp: number
  centerFreq: number
  bins: number[]
  minPower: number
  maxPower: number
}

export interface FFTConfig {
  frequency: number
  bandwidth: number
  binSize: number
  gain: number
  interval: number
}

export interface FFTState {
  running: boolean
  config: FFTConfig | null
  error?: string | null
}

// WebSocket message types
export type WSMessage =
  | { type: 'init'; state: SystemState; globe?: GlobeState; fft?: FFTState }
  | { type: 'status_change'; status: SystemStatus; message?: string }
  | { type: 'capture_progress'; progress: number; elapsed: number; total: number }
  | { type: 'pass_start'; pass: SatellitePass; doppler?: DopplerData }
  | { type: 'pass_complete'; result: CaptureRecord }
  | { type: 'passes_updated'; passes: SatellitePass[] }
  | { type: 'sstv_status'; status: SstvStatus }
  | { type: 'satellite_positions'; globe: GlobeState }
  | { type: 'scanning_frequency'; frequency: number; name: string }
  | { type: 'fft_data'; data: FFTData }
  | { type: 'fft_subscribed'; running: boolean; config: FFTConfig | null; error?: string | null }
  | { type: 'fft_unsubscribed' }
  | { type: 'fft_error'; error: string }
