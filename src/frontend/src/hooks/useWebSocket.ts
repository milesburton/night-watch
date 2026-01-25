import type {
  CaptureProgress,
  FFTData,
  FFTState,
  GlobeState,
  SatellitePass,
  SstvStatus,
  SystemState,
  WSMessage,
  WsState,
} from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'

interface UseWebSocketOptions {
  onMessage?: (message: WSMessage) => void
  onFFTData?: (data: FFTData) => void
  reconnectDelay?: number
  maxReconnectAttempts?: number
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { onMessage, onFFTData, reconnectDelay = 1000, maxReconnectAttempts = 20 } = options

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)

  const [wsState, setWsState] = useState<WsState>({
    connected: false,
    error: null,
    reconnectAttempts: 0,
  })

  const [systemState, setSystemState] = useState<SystemState | null>(null)
  const [globeState, setGlobeState] = useState<GlobeState | null>(null)
  const [sstvStatus, setSstvStatus] = useState<SstvStatus | null>(null)
  const [passes, setPasses] = useState<SatellitePass[]>([])
  const [progress, setProgress] = useState<CaptureProgress | null>(null)
  const [fftState, setFftState] = useState<FFTState>({ running: false, config: null })

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0
      setWsState({
        connected: true,
        error: null,
        reconnectAttempts: 0,
      })
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSMessage

        // Message received successfully

        // Handle message based on type
        switch (data.type) {
          case 'init':
            setSystemState(data.state)
            if (data.globe) setGlobeState(data.globe)
            if (data.state.upcomingPasses) setPasses(data.state.upcomingPasses)
            if (data.fft) setFftState(data.fft)
            break
          case 'status_change':
            setSystemState((prev) =>
              prev
                ? {
                    ...prev,
                    status: data.status,
                    statusMessage: data.message,
                  }
                : null
            )
            break
          case 'capture_progress':
            setProgress({
              percentage: data.progress,
              elapsed: data.elapsed,
              total: data.total,
            })
            break
          case 'pass_start':
            setSystemState((prev) =>
              prev
                ? {
                    ...prev,
                    currentPass: data.pass,
                    status: 'recording',
                  }
                : null
            )
            break
          case 'pass_complete':
            setSystemState((prev) =>
              prev
                ? {
                    ...prev,
                    currentPass: null,
                    status: 'idle',
                  }
                : null
            )
            setProgress(null)
            break
          case 'passes_updated':
            setPasses(data.passes)
            setSystemState((prev) =>
              prev
                ? {
                    ...prev,
                    upcomingPasses: data.passes,
                    nextPass: data.passes[0] || null,
                  }
                : null
            )
            break
          case 'sstv_status':
            setSstvStatus(data.status)
            break
          case 'satellite_positions':
            setGlobeState(data.globe)
            break
          case 'scanning_frequency':
            setSystemState((prev) =>
              prev
                ? {
                    ...prev,
                    scanningFrequency: data.frequency,
                    scanningFrequencyName: data.name,
                  }
                : null
            )
            break
          case 'fft_data':
            // Clear any stale error when data starts flowing
            setFftState((prev) => (prev.error ? { ...prev, running: true, error: null } : prev))
            onFFTData?.(data.data)
            break
          case 'fft_history':
            if (Array.isArray(data.data)) {
              for (const frame of data.data) {
                onFFTData?.(frame)
              }
            }
            break
          case 'fft_subscribed':
            setFftState({ running: data.running, config: data.config, error: data.error ?? null })
            break
          case 'fft_unsubscribed':
            setFftState({ running: false, config: null, error: null })
            break
          case 'fft_error':
            setFftState((prev) => ({ ...prev, running: false, error: data.error }))
            break
        }

        onMessage?.(data)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    ws.onclose = () => {
      setWsState((prev) => ({ ...prev, connected: false, error: null }))
      wsRef.current = null

      // Attempt reconnection
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++
        setWsState((prev) => ({
          ...prev,
          reconnectAttempts: reconnectAttemptsRef.current,
        }))

        const delay = reconnectDelay * Math.min(reconnectAttemptsRef.current, 10)
        setTimeout(connect, delay)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setWsState((prev) => ({ ...prev, error: 'Connection error' }))
    }
  }, [onMessage, onFFTData, reconnectDelay, maxReconnectAttempts])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  const sendMessage = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  const subscribeFFT = useCallback(
    (frequency?: number) => {
      sendMessage({ type: 'fft_subscribe', frequency })
    },
    [sendMessage]
  )

  const unsubscribeFFT = useCallback(() => {
    sendMessage({ type: 'fft_unsubscribe' })
  }, [sendMessage])

  const setFFTFrequency = useCallback(
    (frequency: number) => {
      sendMessage({ type: 'fft_set_frequency', frequency })
    },
    [sendMessage]
  )

  return {
    wsState,
    systemState,
    globeState,
    sstvStatus,
    passes,
    progress,
    fftState,
    sendMessage,
    subscribeFFT,
    unsubscribeFFT,
    setFFTFrequency,
  }
}
