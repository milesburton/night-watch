import type { SystemStatus } from '@/types'
import { useEffect } from 'react'

/**
 * Dynamic favicon that changes color based on system status
 */
export function useFavicon(status: SystemStatus) {
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear
    ctx.clearRect(0, 0, 64, 64)

    // Determine color based on status
    let color: string
    let pulseEffect = false

    switch (status) {
      case 'recording':
      case 'scanning':
        color = '#22c55e' // green - active
        pulseEffect = true
        break
      case 'decoding':
        color = '#3b82f6' // blue - processing
        break
      case 'waiting':
        color = '#f59e0b' // amber - waiting
        break
      case 'idle':
      default:
        color = '#64748b' // gray - idle
        break
    }

    // Draw circular radar/dish icon
    const centerX = 32
    const centerY = 32
    const radius = 24

    // Outer ring (dish)
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()

    // Inner concentric circles (signal waves)
    ctx.lineWidth = 2
    for (let r = 8; r <= 16; r += 4) {
      ctx.beginPath()
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Center dot
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2)
    ctx.fill()

    // Add glow effect for active states
    if (pulseEffect) {
      ctx.shadowBlur = 10
      ctx.shadowColor = color
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius + 4, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Update favicon
    const dataURL = canvas.toDataURL()
    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")

    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }

    link.href = dataURL
  }, [status])
}
