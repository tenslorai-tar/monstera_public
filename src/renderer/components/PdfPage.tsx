import { useEffect, useRef, useState } from 'react'
import { TextLayer } from 'pdfjs-dist'
import { usePdfStore, getOcgConfig } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { textCache } from '../utils/textCache'
import { hdRenderPage } from '../utils/pdfiumRender'
import {
  highlightApiAvailable, buildMatchRanges,
  setPageSearchRanges, clearPageSearchRanges,
} from '../utils/searchHighlights'
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
  pageNum: number,
  pageMatches: SearchMatch[],
  activeMatch: SearchMatch | null
) {
  const spans = Array.from(textLayerEl.querySelectorAll<HTMLElement>('span'))
  const cache = textCache.get(pageNum)

  // Preferred path: CSS Custom Highlight API marks the exact matched
  // characters, not whole spans.
  if (highlightApiAvailable) {
    if (!cache || pageMatches.length === 0) { clearPageSearchRanges(pageNum); return }
    const { ranges, active } = buildMatchRanges(
      spans, cache.itemOffsets, cache.itemLengths, pageMatches, activeMatch)
    setPageSearchRanges(pageNum, ranges, active)
    return
  }

  // Fallback: whole-span class highlighting.
  spans.forEach(s => s.classList.remove('search-match', 'search-match-active'))
  if (!cache || pageMatches.length === 0) return
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

  // Zoom is two-tier: the wrapper, overlays, text layer and the existing
  // canvas bitmap track `scale` instantly (cheap CSS), while the expensive
  // PDF re-render happens at `renderScale`, which follows after a short
  // debounce — so Ctrl+wheel feels immediate and crispness lands when the
  // user pauses.
  const [renderScale, setRenderScale] = useState(scale)
  useEffect(() => {
    if (renderScale === scale) return
    const t = setTimeout(() => setRenderScale(scale), 150)
    return () => clearTimeout(t)
  }, [scale, renderScale])

  const pageSize = pageSizes[pageNum - 1]
  const pageW = pageSize?.width ?? 612
  const pageH = pageSize?.height ?? 792
  const pageWidth = pageW * scale
  const pageHeight = pageH * scale

  // Instant zoom feedback: stretch the current bitmap and re-position the
  // text layer (pdf.js spans scale via --scale-factor) without re-rendering.
  useEffect(() => {
    const canvas = canvasRef.current
    const textDiv = textLayerRef.current
    if (canvas) {
      canvas.style.width = `${pageW * scale}px`
      canvas.style.height = `${pageH * scale}px`
    }
    if (textDiv) {
      textDiv.style.width = `${pageW * scale}px`
      textDiv.style.height = `${pageH * scale}px`
      textDiv.style.setProperty('--scale-factor', String(scale))
    }
  }, [scale, pageW, pageH])

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

      const viewport = page.getViewport({ scale: renderScale })
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

      // Canvas pixels: PDFium (opt-in, higher fidelity) or PDF.js. The text layer
      // below is always PDF.js, so selection/search stays intact either way.
      let painted = false
      if (settings.pdfiumRender) {
        try {
          const bytes = usePdfStore.getState().pdfBytes
          if (bytes) {
            const img = await hdRenderPage(bytes, pageNum - 1, renderScale * density)
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
        const rvp = page.getViewport({ scale: renderScale * density })
        canvas.width = rvp.width
        canvas.height = rvp.height
        const ocgConfig = getOcgConfig()
        // annotationMode: 0 = DISABLE — our overlay handles annotation rendering
        await page.render({
          canvas,
          viewport: rvp,
          annotationMode: 0,
          ...(ocgConfig ? { optionalContentConfigPromise: Promise.resolve(ocgConfig) } : {}),
        }).promise
        if (cancelled || gen !== renderGenRef.current) return
      }

      // CSS sizing tracks the LIVE scale (the user may have zoomed again while
      // this render was in flight) — the bitmap just stretches until the next
      // debounced render lands.
      const liveScale = usePdfStore.getState().scale
      canvas.style.width = `${pageW * liveScale}px`
      canvas.style.height = `${pageH * liveScale}px`

      textDiv.innerHTML = ''
      textDiv.style.width = `${pageW * liveScale}px`
      textDiv.style.height = `${pageH * liveScale}px`
      // pdf.js positions every text span with percentages and sizes them with
      // calc(var(--scale-factor)*…). Without this custom property the text layer
      // collapses to width:0 and the spans land nowhere near the visible text —
      // which makes the page unselectable and breaks highlight/underline/strike.
      textDiv.style.setProperty('--scale-factor', String(liveScale))
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
      applyHighlights(textDiv, pageNum, pageMatches, activeOnPage)
    })()

    return () => { cancelled = true }
  }, [inView, pdfDoc, pageNum, renderScale, layerRevision, settings.pdfiumRender, settings.renderQuality]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const textDiv = textLayerRef.current
    if (!textDiv || textDiv.children.length === 0) return
    const pageMatches = searchMatches.filter(m => m.pageNum === pageNum)
    const activeMatch = activeMatchIndex >= 0 ? searchMatches[activeMatchIndex] : null
    const activeOnPage = activeMatch?.pageNum === pageNum ? activeMatch : null
    applyHighlights(textDiv, pageNum, pageMatches, activeOnPage)
  }, [searchMatches, activeMatchIndex, pageNum])

  // Drop this page's highlight ranges when it unmounts or leaves the viewport
  // (its DOM nodes are gone, so the Ranges would be dead anyway).
  useEffect(() => {
    if (!inView) clearPageSearchRanges(pageNum)
    return () => clearPageSearchRanges(pageNum)
  }, [inView, pageNum])

  return (
    <div
      ref={wrapperRef}
      className="pdf-page-wrapper"
      style={{ width: pageWidth, height: pageHeight }}
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
