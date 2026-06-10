import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props {
  pageNum: number
  pageIndex: number
  scrollRoot: HTMLElement | null
  isActive: boolean
  isSelected: boolean
  isDragOver: boolean
  onClick: () => void
  onToggleSelect: () => void
  onContextMenu: (e: React.MouseEvent, pageNum: number) => void
  onDragStart: (pageIndex: number) => void
  onDragOver: (pageIndex: number) => void
  onDrop: (toIndex: number) => void
  onDragEnd: () => void
}

const THUMB_WIDTH = 120

export default function ThumbnailItem({
  pageNum, pageIndex, scrollRoot,
  isActive, isSelected, isDragOver,
  onClick, onToggleSelect, onContextMenu,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: Props) {
  const pdfDoc = usePdfStore(s => s.pdfDoc)
  const pageSizes = usePdfStore(s => s.pageSizes)

  const [inView, setInView] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderedScaleRef = useRef<number | null>(null)

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
    if (!inView || !pdfDoc) return
    if (renderedScaleRef.current === thumbScale) return
    const canvas = canvasRef.current
    if (!canvas) return
    renderedScaleRef.current = thumbScale

    ;(async () => {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: thumbScale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise
    })()
  }, [inView, pdfDoc, pageNum, thumbScale])

  // Re-render thumbnail when pdfDoc changes (after an edit)
  useEffect(() => {
    renderedScaleRef.current = null
  }, [pdfDoc])

  const classes = [
    'thumbnail-item',
    isActive ? 'thumbnail-active' : '',
    isSelected ? 'thumbnail-selected' : '',
    isDragOver ? 'thumbnail-drag-over' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={wrapperRef}
      className={classes}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(pageIndex) }}
      onDragOver={e => { e.preventDefault(); onDragOver(pageIndex) }}
      onDrop={e => { e.preventDefault(); onDrop(pageIndex) }}
      onDragEnd={onDragEnd}
      onContextMenu={e => onContextMenu(e, pageNum)}
      title={`Page ${pageNum}`}
    >
      <input
        type="checkbox"
        className="thumbnail-checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        onClick={e => e.stopPropagation()}
        title="Select page"
      />
      <div
        className="thumbnail-canvas-wrapper"
        style={{ height: thumbHeight }}
        onClick={onClick}
      >
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
