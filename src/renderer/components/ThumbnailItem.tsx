import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props {
  pageNum: number
  scrollRoot: HTMLElement | null
  isActive: boolean
  onClick: () => void
}

const THUMB_WIDTH = 120

export default function ThumbnailItem({ pageNum, scrollRoot, isActive, onClick }: Props) {
  const pdfDoc = usePdfStore(s => s.pdfDoc)
  const pageSizes = usePdfStore(s => s.pageSizes)

  const [inView, setInView] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderedRef = useRef(false)

  const pageSize = pageSizes[pageNum - 1]
  const thumbScale = pageSize ? THUMB_WIDTH / pageSize.width : 0.2
  const thumbHeight = pageSize ? Math.round(pageSize.height * thumbScale) : 160

  useEffect(() => {
    const el = wrapperRef.current
    if (!el || !scrollRoot) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true) },
      { root: scrollRoot, rootMargin: '300px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [scrollRoot])

  useEffect(() => {
    if (!inView || !pdfDoc || renderedRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    renderedRef.current = true

    ;(async () => {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: thumbScale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise
    })()
  }, [inView, pdfDoc, pageNum, thumbScale])

  return (
    <div
      ref={wrapperRef}
      className={`thumbnail-item${isActive ? ' thumbnail-active' : ''}`}
      onClick={onClick}
      title={`Page ${pageNum}`}
    >
      <div className="thumbnail-canvas-wrapper" style={{ height: thumbHeight }}>
        {inView ? (
          <canvas ref={canvasRef} className="thumbnail-canvas" />
        ) : (
          <div className="thumbnail-placeholder" style={{ height: thumbHeight }} />
        )}
      </div>
      <span className="thumbnail-label">{pageNum}</span>
    </div>
  )
}
