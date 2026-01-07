import type { SSTVEvent, SSTVStatus } from '../types'
import { logger } from '../utils/logger'

let activeEvents: SSTVEvent[] = []
let manualSstvEnabled = false

export function setManualSstvEnabled(enabled: boolean): void {
  manualSstvEnabled = enabled
  logger.info(`ISS SSTV manual mode: ${enabled ? 'enabled' : 'disabled'}`)
}

export function isManualSstvEnabled(): boolean {
  return manualSstvEnabled
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
    manualEnabled: manualSstvEnabled,
    activeEvent: getActiveEvent(),
    upcomingEvents: getUpcomingEvents(),
  }
}
