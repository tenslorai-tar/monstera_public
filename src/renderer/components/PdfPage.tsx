import { useEffect, useRef, useState } from 'react'
import { TextLayer } from 'pdfjs-dist'
import { usePdfStore, getOcgConfig } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { textCache } from '../utils/textCache'
import { hdRenderPage } from '../utils/pdfiumRender'
import type { SearchMatch } from '../store/usePdfStore'
import AnnotationOverlay from './AnnotationOverlay'
import ObjectEditOverlay from './ObjectEditOverlay'
import FormOverlay from './FormOverlay'
import OcrTextLayer from './OcrTextLayer'
import RulerOverlay from './RulerOverlay'
import LinkLayer from './LinkLayer'

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
  const layerRevision = usePdfStore(s => s.layerRevision)
  const { settings } = useSettingsStore()

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

      // Crisp text: paint the backing store ABOVE the displayed size, then keep the
      // canvas's CSS size at the logical page size so the browser downscales the
      // bitmap (antialiasing) and the text/annotation overlays still align 1:1.
      // density = devicePixelRatio × a supersample factor, so text sharpens even on
      // 1× monitors (where plain devicePixelRatio scaling changes nothing). Capped by
      // both a max multiplier and a max backing dimension to bound canvas memory.
      const dpr = Math.max(window.devicePixelRatio || 1, 1)
      const quality = Math.min(Math.max(settings.renderQuality || 3, 1), 5)
      let density = Math.min(Math.max(dpr, quality), 8192 / viewport.width, 8192 / viewport.height)
      density = Math.max(density, 1)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      // Canvas pixels: PDFium (opt-in, higher fidelity) or PDF.js. The text layer
      // below is always PDF.js, so selection/search stays intact either way.
      let painted = false
      if (settings.pdfiumRender) {
        try {
          const bytes = usePdfStore.getState().pdfBytes
          if (bytes) {
            const img = await hdRenderPage(bytes, pageNum - 1, scale * density)
            if (cancelled || gen !== renderGenRef.current) return
            if (img && img.width > 0 && img.data.byteLength === img.width * img.height * 4) {
              canvas.width = img.width
              canvas.height = img.height
              ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0)
              painted = true
            }
          }
        } catch { /* fall back to PDF.js below */ }
      }

      if (!painted) {
        const rvp = page.getViewport({ scale: scale * density })
        canvas.width = rvp.width
        canvas.height = rvp.height
        const ocgConfig = getOcgConfig()
        // annotationMode: 0 = DISABLE — our overlay handles annotation rendering
        await page.render({
          canvasContext: ctx,
          viewport: rvp,
          annotationMode: 0,
          ...(ocgConfig ? { optionalContentConfigPromise: Promise.resolve(ocgConfig) } : {}),
        }).promise
        if (cancelled || gen !== renderGenRef.current) return
      }

      textDiv.innerHTML = ''
      textDiv.style.width = `${viewport.width}px`
      textDiv.style.height = `${viewport.height}px`
      // pdf.js v4 positions every text span with percentages and sizes them with
      // calc(var(--scale-factor)*…). Without this custom property the text layer
      // collapses to width:0 and the spans land nowhere near the visible text —
      // which makes the page unselectable and breaks highlight/underline/strike.
      textDiv.style.setProperty('--scale-factor', String(scale))
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
  }, [inView, pdfDoc, pageNum, scale, layerRevision, settings.pdfiumRender, settings.renderQuality]) // eslint-disable-line react-hooks/exhaustive-deps

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
      style={{ width: pageWidth, height: pageHeight, transition: 'width 0.15s ease, height 0.15s ease' }}
      data-page={pageNum}
    >
      {inView ? (
        <>
          <canvas ref={canvasRef} className="pdf-page-canvas"
            style={settings.darkPageMode ? { filter: 'invert(1) hue-rotate(180deg)' } : undefined} />
          <div
            ref={textLayerRef}
            className={`text-layer${isMarkupTool ? ' markup-active' : ''}`}
            style={{ pointerEvents: textLayerPointerEvents }}
          />
          <OcrTextLayer
            pageNum={pageNum}
            pageW={pageW}
            pageH={pageH}
            scale={scale}
          />
          <AnnotationOverlay
            pageNum={pageNum}
            scale={scale}
            pageW={pageW}
            pageH={pageH}
          />
          <ObjectEditOverlay
            pageNum={pageNum}
            scale={scale}
            pageW={pageW}
            pageH={pageH}
          />
          <FormOverlay
            pageNum={pageNum}
            scale={scale}
            pageW={pageW}
            pageH={pageH}
          />
          <LinkLayer
            pageNum={pageNum}
            scale={scale}
            pageH={pageH}
          />
          {(settings.showRulers || settings.showGrid) && (
            <RulerOverlay
              scale={scale}
              pageWidth={pageW}
              pageHeight={pageH}
              showGrid={settings.showGrid}
            />
          )}
        </>
      ) : (
        <div className="pdf-page-placeholder" />
      )}
      <div className="pdf-page-number-badge">{pageNum}</div>
    </div>
  )
}
