import { Tooltip } from '@/components/Tooltip'
import { useApi } from '@/hooks/useApi'
import type { CaptureRecord } from '@/types'
import { useEffect, useState } from 'react'

type Tab = 'good' | 'all'

function getSignalQuality(signal?: number | null): {
  label: string
  color: string
  description: string
} {
  if (signal === null || signal === undefined) {
    return { label: 'Unknown', color: 'bg-text-muted', description: 'Signal strength not recorded' }
  }
  if (signal >= -20) {
    return { label: 'Excellent', color: 'bg-success', description: 'Very strong signal' }
  }
  if (signal >= -25) {
    return { label: 'Good', color: 'bg-accent', description: 'Good signal quality' }
  }
  if (signal >= -30) {
    return { label: 'Fair', color: 'bg-warning', description: 'Usable signal, may have artifacts' }
  }
  return { label: 'Weak', color: 'bg-error', description: 'Poor signal quality, likely degraded' }
}

function getElevationQuality(elevation: number): {
  label: string
  description: string
} {
  if (elevation >= 60) {
    return { label: 'Excellent pass', description: `${elevation.toFixed(1)}° - Nearly overhead` }
  }
  if (elevation >= 40) {
    return { label: 'Good pass', description: `${elevation.toFixed(1)}° - High elevation` }
  }
  if (elevation >= 25) {
    return { label: 'Fair pass', description: `${elevation.toFixed(1)}° - Moderate elevation` }
  }
  return { label: 'Low pass', description: `${elevation.toFixed(1)}° - Near horizon` }
}

function CaptureCard({
  capture,
  onSelect,
}: {
  capture: CaptureRecord
  onSelect: (path: string) => void
}) {
  const hasImage = capture.imagePaths && capture.imagePaths.length > 0
  const isGoodDecode = capture.success && hasImage

  return (
    <button
      type="button"
      className="group relative aspect-square bg-bg-secondary rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-accent transition-all"
      onClick={() => hasImage && onSelect(capture.imagePaths[0])}
      disabled={!hasImage}
    >
      {hasImage ? (
        <img
          src={`/api/images/${encodeURIComponent(capture.imagePaths[0].split('/').pop() || '')}`}
          alt={`${capture.satellite} capture`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-muted">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>No Image Available</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="text-xs font-medium text-white truncate">{capture.satellite}</p>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-xs text-white/70">
            {new Date(capture.timestamp).toLocaleDateString()}{' '}
            {new Date(capture.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          {isGoodDecode && (
            <Tooltip
              content={`${getSignalQuality(capture.maxSignalStrength).description} • ${
                getElevationQuality(capture.maxElevation).description
              }`}
              position="top"
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  getSignalQuality(capture.maxSignalStrength).color
                }`}
              />
            </Tooltip>
          )}
        </div>
      </div>

      {!capture.success && (
        <Tooltip
          content={
            capture.errorMessage || 'Capture failed - check signal strength and antenna positioning'
          }
          position="top"
        >
          <div className="absolute top-2 right-2">
            <span className="px-1.5 py-0.5 bg-error/80 text-white text-xs rounded cursor-help">
              Failed
            </span>
          </div>
        </Tooltip>
      )}

      {capture.success && !hasImage && (
        <Tooltip content="Capture succeeded but produced no decodable image" position="top">
          <div className="absolute top-2 right-2">
            <span className="px-1.5 py-0.5 bg-warning/80 text-white text-xs rounded cursor-help">
              No image
            </span>
          </div>
        </Tooltip>
      )}
    </button>
  )
}

export function CaptureGallery() {
  const { getCaptures } = useApi()
  const [captures, setCaptures] = useState<CaptureRecord[]>([])
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('good')

  useEffect(() => {
    const fetchCaptures = async () => {
      try {
        const data = await getCaptures(50)
        setCaptures(data)
      } catch (error) {
        console.error('Failed to fetch captures:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchCaptures()
    const interval = setInterval(fetchCaptures, 30000)
    return () => clearInterval(interval)
  }, [getCaptures])

  const goodCaptures = captures.filter((c) => c.success && c.imagePaths && c.imagePaths.length > 0)
  const displayed = tab === 'good' ? goodCaptures : captures

  if (loading) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Captures</h2>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card" data-testid="capture-gallery">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Captures</h2>
          <div className="flex items-center gap-1 text-xs bg-bg-tertiary rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setTab('good')}
              className={`px-2.5 py-1 rounded transition-colors ${
                tab === 'good'
                  ? 'bg-bg-secondary text-text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Good decodes
              {goodCaptures.length > 0 && (
                <span className="ml-1.5 text-accent font-mono">{goodCaptures.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                tab === 'all'
                  ? 'bg-bg-secondary text-text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              All
              <span className="ml-1.5 text-text-muted font-mono">{captures.length}</span>
            </button>
          </div>
        </div>

        {displayed.length === 0 ? (
          <p className="text-text-secondary text-center py-8">
            {tab === 'good' ? 'No successful decodes yet' : 'No captures yet'}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {displayed.map((capture) => (
              <CaptureCard key={capture.id} capture={capture} onSelect={setSelectedImage} />
            ))}
          </div>
        )}
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSelectedImage(null)
          }}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setSelectedImage(null)}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Close Image</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <img
            src={`/api/images/${encodeURIComponent(selectedImage.split('/').pop() || '')}`}
            alt="Full size capture"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
