import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

interface PdfCanvasProps {
  pdfBytes: ArrayBuffer
}

export default function PdfCanvas({ pdfBytes }: PdfCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const renderPage = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) })
        const pdf = await loadingTask.promise
        if (cancelled) return

        const page = await pdf.getPage(1)
        if (cancelled) return

        const canvas = canvasRef.current
        if (!canvas) return

        const viewport = page.getViewport({ scale: 1.5 })
        const context = canvas.getContext('2d')!
        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({ canvasContext: context, viewport }).promise
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render PDF')
          setLoading(false)
        }
      }
    }

    renderPage()
    return () => { cancelled = true }
  }, [pdfBytes])

  if (error) return <div className="pdf-error">Error: {error}</div>

  return (
    <div className="pdf-canvas-wrapper">
      {loading && <div className="pdf-loading">Rendering…</div>}
      <canvas ref={canvasRef} className="pdf-canvas" style={{ opacity: loading ? 0 : 1 }} />
    </div>
  )
}
