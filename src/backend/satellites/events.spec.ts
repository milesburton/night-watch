import {
  addEvent,
  clearEvents,
  getActiveEvent,
  getSstvStatus,
  getUpcomingEvents,
  isManualSstvEnabled,
  isSstvActive,
  removeEvent,
  setManualSstvEnabled,
} from '@backend/satellites/events'
import type { SSTVEvent } from '@backend/types'
import { afterEach, describe, expect, it } from 'vitest'

describe('SSTV events', () => {
  afterEach(() => {
    setManualSstvEnabled(false)
    clearEvents()
  })

  describe('manual mode', () => {
    it('should start with manual mode disabled', () => {
      expect(isManualSstvEnabled()).toBe(false)
    })

    it('should enable manual mode', () => {
      setManualSstvEnabled(true)
      expect(isManualSstvEnabled()).toBe(true)
    })

    it('should disable manual mode', () => {
      setManualSstvEnabled(true)
      setManualSstvEnabled(false)
      expect(isManualSstvEnabled()).toBe(false)
    })
  })

  describe('isSstvActive', () => {
    it('should return true when manual mode enabled', () => {
      setManualSstvEnabled(true)
      expect(isSstvActive()).toBe(true)
    })

    it('should return false when no active events and manual disabled', () => {
      expect(isSstvActive()).toBe(false)
    })

    it('should return true when active event exists', () => {
      const now = new Date()
      const event: SSTVEvent = {
        id: 'test-1',
        name: 'Test Event',
        startTime: new Date(now.getTime() - 60000),
        endTime: new Date(now.getTime() + 60000),
        modes: ['PD120'],
        active: true,
      }
      addEvent(event)
      expect(isSstvActive()).toBe(true)
    })
  })

  describe('event management', () => {
    it('should add events', () => {
      const now = new Date()
      const event: SSTVEvent = {
        id: 'test-1',
        name: 'Test Event',
        startTime: new Date(now.getTime() + 60000),
        endTime: new Date(now.getTime() + 120000),
        modes: ['PD120'],
        active: true,
      }
      addEvent(event)
      expect(getUpcomingEvents()).toHaveLength(1)
    })

    it('should remove events by id', () => {
      const now = new Date()
      const event: SSTVEvent = {
        id: 'test-1',
        name: 'Test Event',
        startTime: new Date(now.getTime() + 60000),
        endTime: new Date(now.getTime() + 120000),
        modes: ['PD120'],
        active: true,
      }
      addEvent(event)
      removeEvent('test-1')
      expect(getUpcomingEvents()).toHaveLength(0)
    })

    it('should sort events by start time', () => {
      const now = new Date()
      const event1: SSTVEvent = {
        id: 'test-1',
        name: 'Later Event',
        startTime: new Date(now.getTime() + 120000),
        endTime: new Date(now.getTime() + 180000),
        modes: ['PD120'],
        active: true,
      }
      const event2: SSTVEvent = {
        id: 'test-2',
        name: 'Earlier Event',
        startTime: new Date(now.getTime() + 60000),
        endTime: new Date(now.getTime() + 120000),
        modes: ['Robot36'],
        active: true,
      }
      addEvent(event1)
      addEvent(event2)
      const events = getUpcomingEvents()
      expect(events[0]?.id).toBe('test-2')
      expect(events[1]?.id).toBe('test-1')
    })
  })

  describe('getActiveEvent', () => {
    it('should return null when no active events', () => {
      expect(getActiveEvent()).toBeNull()
    })

    it('should return active event during its time window', () => {
      const now = new Date()
      const event: SSTVEvent = {
        id: 'active-1',
        name: 'Active Event',
        startTime: new Date(now.getTime() - 60000),
        endTime: new Date(now.getTime() + 60000),
        modes: ['PD120'],
        active: true,
      }
      addEvent(event)
      expect(getActiveEvent()?.id).toBe('active-1')
    })

    it('should not return inactive events', () => {
      const now = new Date()
      const event: SSTVEvent = {
        id: 'inactive-1',
        name: 'Inactive Event',
        startTime: new Date(now.getTime() - 60000),
        endTime: new Date(now.getTime() + 60000),
        modes: ['PD120'],
        active: false,
      }
      addEvent(event)
      expect(getActiveEvent()).toBeNull()
    })
  })

  describe('getSstvStatus', () => {
    it('should return complete status', () => {
      setManualSstvEnabled(true)
      const status = getSstvStatus()
      expect(status.manualEnabled).toBe(true)
      expect(status.activeEvent).toBeNull()
      expect(status.upcomingEvents).toEqual([])
    })
  })
})
