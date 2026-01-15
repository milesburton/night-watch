import { useApi } from '@/hooks/useApi'
import type { CaptureRecord } from '@/types'
import { useEffect, useState } from 'react'

export function CaptureGallery() {
  const { getCaptures } = useApi()
  const [captures, setCaptures] = useState<CaptureRecord[]>([])
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCaptures = async () => {
      try {
        const data = await getCaptures(12)
        setCaptures(data)
      } catch (error) {
        console.error('Failed to fetch captures:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchCaptures()

    // Refresh every 30 seconds
    const interval = setInterval(fetchCaptures, 30000)
    return () => clearInterval(interval)
  }, [getCaptures])

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

  if (captures.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Captures</h2>
        <p className="text-text-secondary text-center py-8">No captures yet</p>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Captures</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {captures.map((capture) => (
            <div
              key={capture.id}
              className="group relative aspect-square bg-bg-secondary rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-accent transition-all"
              onClick={() => capture.imagePath && setSelectedImage(capture.imagePath)}
            >
              {capture.imagePath ? (
                <img
                  src={`/api/images/${encodeURIComponent(capture.imagePath.split('/').pop() || '')}`}
                  alt={`${capture.satellite} capture`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-muted">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                <p className="text-xs text-white/70">
                  {new Date(capture.timestamp).toLocaleDateString()}
                </p>
              </div>
              {!capture.success && (
                <div className="absolute top-2 right-2">
                  <span className="px-1.5 py-0.5 bg-error/80 text-white text-xs rounded">
                    Failed
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setSelectedImage(null)}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          />
        </div>
      )}
    </>
  )
}
