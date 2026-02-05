import type { SSTVEvent, SSTVStatus } from '@backend/types'
import { stopSstvScanner } from '../capture/sstv-scanner'
import { logger } from '../utils/logger'

let activeEvents: SSTVEvent[] = []
let manualSstvEnabled = false
let groundSstvScanEnabled = false // Disabled by default - use API to enable

export function setManualSstvEnabled(enabled: boolean): void {
  manualSstvEnabled = enabled
  logger.info(`ISS SSTV manual mode: ${enabled ? 'enabled' : 'disabled'}`)
}

export function isManualSstvEnabled(): boolean {
  return manualSstvEnabled
}

export function setGroundSstvScanEnabled(enabled: boolean): void {
  groundSstvScanEnabled = enabled
  if (!enabled) {
    stopSstvScanner()
  }
  logger.info(`2M ground SSTV scanning: ${enabled ? 'enabled' : 'disabled'}`)
}

export function isGroundSstvScanEnabled(): boolean {
  return groundSstvScanEnabled
}

export function addEvent(event: SSTVEvent): void {
  activeEvents.push(event)
  activeEvents.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
}

export function removeEvent(eventId: string): void {
  activeEvents = activeEvents.filter((e) => e.id !== eventId)
}

export function clearEvents(): void {
  activeEvents = []
}

export function getActiveEvent(): SSTVEvent | null {
  const now = new Date()
  return activeEvents.find((e) => e.active && now >= e.startTime && now <= e.endTime) || null
}

export function getUpcomingEvents(limit = 10): SSTVEvent[] {
  const now = new Date()
  return activeEvents.filter((e) => e.endTime > now).slice(0, limit)
}

export function isSstvActive(): boolean {
  return manualSstvEnabled || getActiveEvent() !== null
}

export function getSstvStatus(): SSTVStatus {
  return {
    enabled: isSstvActive(),
    manualEnabled: manualSstvEnabled,
    groundScanEnabled: groundSstvScanEnabled,
    status: 'idle', // Will be overridden by state manager status if scanning/capturing
    activeEvent: getActiveEvent(),
    upcomingEvents: getUpcomingEvents(),
  }
}
