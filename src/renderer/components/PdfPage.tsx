import { useEffect, useRef, useState } from 'react'
import { TextLayer } from 'pdfjs-dist'
import { usePdfStore } from '../store/usePdfStore'
import { textCache } from '../utils/textCache'
import type { SearchMatch } from '../store/usePdfStore'
import AnnotationOverlay from './AnnotationOverlay'

interface Props {
  pageNum: number
  scrollRoot: HTMLElement | null
}

function applyHighlights(
  textLayerEl: HTMLElement,
  pageMatches: SearchMatch[],
  activeMatch: SearchMatch | null
) {
  const spans = Array.from(textLayerEl.querySelectorAll<HTMLElement>('span'))
  spans.forEach(s => s.classList.remove('search-match', 'search-match-active'))
  if (pageMatches.length === 0) return
  const cache = textCache.get(pageMatches[0]?.pageNum ?? -1)
  if (!cache) return
  const { itemOffsets, itemLengths } = cache
  for (const match of pageMatches) {
    const isActive = match === activeMatch
    const matchEnd = match.matchStart + match.matchLen
    for (let i = 0; i < itemOffsets.length; i++) {
      const iStart = itemOffsets[i], iEnd = iStart + itemLengths[i]
      if (iStart < matchEnd && iEnd > match.matchStart && i < spans.length)
        spans[i].classList.add(isActive ? 'search-match-active' : 'search-match')
    }
  }
}

export default function PdfPage({ pageNum, scrollRoot }: Props) {
  const pdfDoc = usePdfStore(s => s.pdfDoc)
  const scale = usePdfStore(s => s.scale)
  const pageSizes = usePdfStore(s => s.pageSizes)
  const searchMatches = usePdfStore(s => s.searchMatches)
  const activeMatchIndex = usePdfStore(s => s.activeMatchIndex)
  const activeTool = usePdfStore(s => s.activeTool)

  const [inView, setInView] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const renderGenRef = useRef(0)

  const pageSize = pageSizes[pageNum - 1]
  const pageW = pageSize?.width ?? 612
  const pageH = pageSize?.height ?? 792
  const pageWidth = pageW * scale
  const pageHeight = pageH * scale

  // Text layer pointer-events: allow selection for markup tools, passthrough otherwise
  const isMarkupTool = activeTool === 'highlight' || activeTool === 'underline' || activeTool === 'strikethrough'
  const textLayerPointerEvents = isMarkupTool ? 'auto' : (activeTool ? 'none' : 'auto')

  useEffect(() => {
    const el = wrapperRef.current
    if (!el || !scrollRoot) return
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { root: scrollRoot, rootMargin: '400px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [scrollRoot])

  useEffect(() => {
    if (!inView || !pdfDoc) return
    const canvas = canvasRef.current
    const textDiv = textLayerRef.current
    if (!canvas || !textDiv) return

    const gen = ++renderGenRef.current
    let cancelled = false

    ;(async () => {
      const page = await pdfDoc.getPage(pageNum)
      if (cancelled || gen !== renderGenRef.current) return

      const viewport = page.getViewport({ scale })
      const ctx = canvas.getContext('2d')!
      canvas.width = viewport.width
      canvas.height = viewport.height

      // annotationMode: 0 = DISABLE — our overlay handles annotation rendering
      await page.render({ canvasContext: ctx, viewport, annotationMode: 0 }).promise
      if (cancelled || gen !== renderGenRef.current) return

      textDiv.innerHTML = ''
      textDiv.style.width = `${viewport.width}px`
      textDiv.style.height = `${viewport.height}px`
      const textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textDiv,
        viewport,
      })
      await textLayer.render()
      if (cancelled || gen !== renderGenRef.current) { textLayer.cancel(); return }

      const pageMatches = searchMatches.filter(m => m.pageNum === pageNum)
      const activeMatch = activeMatchIndex >= 0 ? searchMatches[activeMatchIndex] : null
      const activeOnPage = activeMatch?.pageNum === pageNum ? activeMatch : null
      applyHighlights(textDiv, pageMatches, activeOnPage)
    })()

    return () => { cancelled = true }
  }, [inView, pdfDoc, pageNum, scale]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const textDiv = textLayerRef.current
    if (!textDiv || textDiv.children.length === 0) return
    const pageMatches = searchMatches.filter(m => m.pageNum === pageNum)
    const activeMatch = activeMatchIndex >= 0 ? searchMatches[activeMatchIndex] : null
    const activeOnPage = activeMatch?.pageNum === pageNum ? activeMatch : null
    applyHighlights(textDiv, pageMatches, activeOnPage)
  }, [searchMatches, activeMatchIndex, pageNum])

  return (
    <div
      ref={wrapperRef}
      className="pdf-page-wrapper"
      style={{ width: pageWidth, height: pageHeight }}
      data-page={pageNum}
    >
      {inView ? (
        <>
          <canvas ref={canvasRef} className="pdf-page-canvas" />
          <div
            ref={textLayerRef}
            className="text-layer"
            style={{ pointerEvents: textLayerPointerEvents }}
          />
          <AnnotationOverlay
            pageNum={pageNum}
            scale={scale}
            pageW={pageW}
            pageH={pageH}
          />
        </>
      ) : (
        <div className="pdf-page-placeholder" />
      )}
      <div className="pdf-page-number-badge">{pageNum}</div>
    </div>
  )
}
