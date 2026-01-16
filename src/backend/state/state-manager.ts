import { EventEmitter } from 'node:events'
import type {
  CaptureResult,
  GlobeState,
  SatellitePass,
  StateEvent,
  SystemState,
  SystemStatus,
} from '@backend/types'

export class StateManager extends EventEmitter {
  private state: SystemState = {
    status: 'idle',
    currentPass: null,
    nextPass: null,
    upcomingPasses: [],
    captureProgress: 0,
    captureElapsed: 0,
    captureTotal: 0,
    lastUpdate: new Date(),
    scanningFrequency: undefined,
    scanningFrequencyName: undefined,
  }

  getState(): SystemState {
    return { ...this.state }
  }

  setStatus(status: SystemStatus): void {
    this.state.status = status
    this.state.lastUpdate = new Date()
    // Clear scanning state when not scanning
    if (status !== 'scanning') {
      this.state.scanningFrequency = undefined
      this.state.scanningFrequencyName = undefined
    }
    this.emitEvent({ type: 'status_change', status })
  }

  setScanningFrequency(frequency: number, name: string): void {
    this.state.scanningFrequency = frequency
    this.state.scanningFrequencyName = name
    this.state.lastUpdate = new Date()
    this.emitEvent({ type: 'scanning_frequency', frequency, name })
  }

  startPass(pass: SatellitePass): void {
    this.state.currentPass = pass
    this.state.status = 'capturing'
    this.state.captureProgress = 0
    this.state.captureElapsed = 0
    this.state.captureTotal = Math.ceil(pass.duration)
    this.state.lastUpdate = new Date()
    this.emitEvent({ type: 'pass_start', pass })
  }

  updateProgress(progress: number, elapsed: number, total: number): void {
    this.state.captureProgress = progress
    this.state.captureElapsed = elapsed
    this.state.captureTotal = total
    this.state.lastUpdate = new Date()
    this.emitEvent({ type: 'capture_progress', progress, elapsed, total })
  }

  completePass(result: CaptureResult): void {
    this.state.currentPass = null
    this.state.status = 'idle'
    this.state.captureProgress = 0
    this.state.captureElapsed = 0
    this.state.captureTotal = 0
    this.state.lastUpdate = new Date()

    // Remove completed pass from upcoming passes
    this.state.upcomingPasses = this.state.upcomingPasses.filter(
      (p) =>
        !(
          p.satellite.noradId === result.satellite.noradId &&
          p.aos.getTime() === result.startTime.getTime()
        )
    )
    this.state.nextPass = this.state.upcomingPasses[0] || null

    this.emitEvent({ type: 'pass_complete', result })
  }

  updatePasses(passes: SatellitePass[]): void {
    this.state.upcomingPasses = passes
    this.state.nextPass = passes[0] || null
    this.state.lastUpdate = new Date()
    this.emitEvent({ type: 'passes_updated', passes })
  }

  emitGlobeState(globe: GlobeState): void {
    this.emitEvent({ type: 'satellite_positions', globe })
  }

  private emitEvent(event: StateEvent): void {
    this.emit('state', event)
  }
}

// Singleton instance for cross-module access
export const stateManager = new StateManager()
