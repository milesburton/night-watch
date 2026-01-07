import { resolve } from 'node:path'
import type { ServerWebSocket } from 'bun'
import { getDatabase } from '../db/database'
import { stateManager } from '../state/state-manager'
import type { StateEvent } from '../types'

const clients = new Set<ServerWebSocket<unknown>>()

export function startWebServer(port: number, host: string, imagesDir: string) {
  const staticDir = resolve(import.meta.dir, 'static')
  const resolvedImagesDir = resolve(imagesDir)

  const server = Bun.serve({
    port,
    hostname: host,

    fetch(req, server) {
      const url = new URL(req.url)

      // WebSocket upgrade
      if (url.pathname === '/ws') {
        if (server.upgrade(req)) {
          return undefined
        }
        return new Response('WebSocket upgrade failed', { status: 400 })
      }

      // Static files
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return serveStatic(staticDir, 'index.html', 'text/html')
      }

      if (url.pathname === '/styles.css') {
        return serveStatic(staticDir, 'styles.css', 'text/css')
      }

      if (url.pathname === '/app.js') {
        return serveStatic(staticDir, 'app.js', 'application/javascript')
      }

      // Image serving
      if (url.pathname.startsWith('/images/')) {
        const filename = url.pathname.slice(8)
        return serveImage(resolvedImagesDir, filename)
      }

      // API routes
      if (url.pathname === '/api/status') {
        return jsonResponse(stateManager.getState())
      }

      if (url.pathname === '/api/passes') {
        return jsonResponse(stateManager.getState().upcomingPasses)
      }

      if (url.pathname === '/api/captures') {
        const limit = Number(url.searchParams.get('limit')) || 50
        const offset = Number(url.searchParams.get('offset')) || 0
        try {
          const db = getDatabase()
          return jsonResponse(db.getRecentCaptures(limit, offset))
        } catch {
          return jsonResponse([])
        }
      }

      if (url.pathname === '/api/summary') {
        try {
          const db = getDatabase()
          return jsonResponse(db.getCaptureSummary())
        } catch {
          return jsonResponse({ total: 0, successful: 0, failed: 0 })
        }
      }

      return new Response('Not Found', { status: 404 })
    },

    websocket: {
      open(ws) {
        clients.add(ws)
        // Send current state on connection
        ws.send(
          JSON.stringify({
            type: 'init',
            state: stateManager.getState(),
          })
        )
      },

      close(ws) {
        clients.delete(ws)
      },

      message(_ws, _message) {
        // Handle ping/pong or commands if needed
      },
    },
  })

  // Subscribe to state changes and broadcast to all clients
  stateManager.on('state', (event: StateEvent) => {
    const message = JSON.stringify(event)
    for (const client of clients) {
      try {
        client.send(message)
      } catch {
        clients.delete(client)
      }
    }
  })

  return server
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

async function serveStatic(dir: string, filename: string, contentType: string): Promise<Response> {
  const file = Bun.file(`${dir}/${filename}`)
  if (await file.exists()) {
    return new Response(file, {
      headers: { 'Content-Type': contentType },
    })
  }
  return new Response('Not Found', { status: 404 })
}

async function serveImage(imagesDir: string, filename: string): Promise<Response> {
  // Prevent directory traversal
  if (filename.includes('..')) {
    return new Response('Forbidden', { status: 403 })
  }

  const file = Bun.file(`${imagesDir}/${filename}`)
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  }
  return new Response('Not Found', { status: 404 })
}
