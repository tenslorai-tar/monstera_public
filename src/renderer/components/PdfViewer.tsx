import { useEffect, useRef, useCallback, useState } from 'react'
import { Pause, FastForward } from 'lucide-react'
import { usePdfStore, PAGE_GAP } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import PdfPage from './PdfPage'
import Sidebar from './Sidebar'
import AnnotationsPanel from './AnnotationsPanel'
import FormsPanel from './FormsPanel'
import BookmarksPanel from './BookmarksPanel'
import LinksPanel from './LinksPanel'
import LayersPanel from './LayersPanel'
import NamedDestsPanel from './NamedDestsPanel'

export default function PdfViewer() {
  const numPages = usePdfStore(s => s.numPages)
  const pageSizes = usePdfStore(s => s.pageSizes)
  const scale = usePdfStore(s => s.scale)
  const activeTool = usePdfStore(s => s.activeTool)
  const panMode = usePdfStore(s => s.panMode)
  const setCurrentPage = usePdfStore(s => s.setCurrentPage)
  const setContainerSize = usePdfStore(s => s.setContainerSize)
  const setScrollToPage = usePdfStore(s => s.setScrollToPage)

  const annotationsPanelOpen = usePdfStore(s => s.annotationsPanelOpen)
  const formsPanelOpen = usePdfStore(s => s.formsPanelOpen)
  const bookmarksPanelOpen = usePdfStore(s => s.bookmarksPanelOpen)
  const linksPanelOpen = usePdfStore(s => s.linksPanelOpen)
  const layersPanelOpen = usePdfStore(s => s.layersPanelOpen)
  const namedDestsPanelOpen = usePdfStore(s => s.namedDestsPanelOpen)
  const scrollRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)

  const { settings } = useSettingsStore()
  const [isAutoscrolling, setIsAutoscrolling] = useState(false)
  const autoscrollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Track container size for fit-width / fit-page zoom modes
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize(entry.contentRect.width, entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [setContainerSize])

  // Expose scrollToPage — calculates y offset from page sizes + scale
  const buildScrollFn = useCallback(() => {
    return (pageNum: number) => {
      const el = scrollRef.current
      if (!el || pageSizes.length === 0) return
      const PADDING = 24
      let y = PADDING
      for (let i = 1; i < pageNum; i++) {
        y += (pageSizes[i - 1]?.height ?? 792) * scale + PAGE_GAP
      }
      el.scrollTo({ top: y, behavior: 'smooth' })
    }
  }, [pageSizes, scale])

  useEffect(() => {
    setScrollToPage(buildScrollFn())
  }, [buildScrollFn, setScrollToPage])

  // Current page detection from scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || pageSizes.length === 0) return
    const scrollTop = el.scrollTop
    const PADDING = 24
    let y = PADDING
    for (let i = 0; i < pageSizes.length; i++) {
      const h = (pageSizes[i]?.height ?? 792) * scale
      if (scrollTop < y + h * 0.6) {
        setCurrentPage(i + 1)
        return
      }
      y += h + PAGE_GAP
    }
    setCurrentPage(pageSizes.length)
  }, [pageSizes, scale, setCurrentPage])

  // Ctrl+scroll to zoom, anchored at the cursor: the content point under the
  // pointer stays under the pointer instead of the viewport jumping.
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const { scale: current, setScale } = usePdfStore.getState()
    const delta = e.deltaY < 0 ? 0.1 : -0.1
    const next = Math.min(5, Math.max(0.25, Math.round((current + delta) * 100) / 100))
    if (next === current) return
    const rect = el.getBoundingClientRect()
    const PADDING = 24 // fixed top padding does not scale with content
    const vx = e.clientX - rect.left
    const vy = e.clientY - rect.top
    const cx = el.scrollLeft + vx
    const cy = el.scrollTop + vy
    const ratio = next / current
    setScale(next)
    requestAnimationFrame(() => {
      el.scrollLeft = cx * ratio - vx
      el.scrollTop = (cy - PADDING) * ratio + PADDING - vy
    })
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // Autoscroll
  useEffect(() => {
    if (autoscrollRef.current) clearInterval(autoscrollRef.current)
    if (!isAutoscrolling || settings.autoscrollSpeed <= 0) return
    const px = settings.autoscrollSpeed * 1.5
    autoscrollRef.current = setInterval(() => {
      const el = scrollRef.current
      if (!el) return
      if (el.scrollTop >= el.scrollHeight - el.clientHeight) {
        setIsAutoscrolling(false)
      } else {
        el.scrollTop += px
      }
    }, 16)
    return () => { if (autoscrollRef.current) clearInterval(autoscrollRef.current) }
  }, [isAutoscrolling, settings.autoscrollSpeed])

  const canAutoscroll = settings.autoscrollSpeed > 0

  // Hand tool: grab-drag to pan the document. Active only when no annotation
  // tool is selected and pan mode is on (Text tool turns pan off for selection).
  const handActive = panMode && activeTool === null
  // Text-select mode (left palette "Text"): no tool + pan off → I-beam, selectable text.
  const textSelectActive = !panMode && activeTool === null
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  const onPanDown = useCallback((e: React.MouseEvent) => {
    if (!handActive || e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    panRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
  }, [handActive])

  useEffect(() => {
    if (!handActive) return
    const onMove = (e: MouseEvent) => {
      const p = panRef.current, el = scrollRef.current
      if (!p || !el) return
      el.scrollLeft = p.left - (e.clientX - p.x)
      el.scrollTop = p.top - (e.clientY - p.y)
    }
    const onUp = () => { panRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [handActive])

  return (
    <div className="viewer-area" ref={viewerRef}>
      <Sidebar />
      <div
        className={`pdf-scroll-container${handActive ? ' pdf-pan-mode' : ''}${textSelectActive ? ' pdf-text-mode' : ''}`}
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseDown={onPanDown}
      >
        <div className="pdf-pages-stack">
          {Array.from({ length: numPages }, (_, i) => (
            <PdfPage
              key={i + 1}
              pageNum={i + 1}
              scrollRoot={scrollRef.current}
            />
          ))}
        </div>
      </div>

      {/* Autoscroll floating button */}
      {canAutoscroll && (
        <button
          onClick={() => setIsAutoscrolling(v => !v)}
          title={isAutoscrolling ? 'Stop autoscroll' : `Start autoscroll (speed ${settings.autoscrollSpeed})`}
          style={{
            position: 'absolute', bottom: 12, right: 12, zIndex: 20,
            width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)',
            background: isAutoscrolling ? 'rgba(74,158,255,0.25)' : 'var(--bg-secondary)',
            color: isAutoscrolling ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {isAutoscrolling ? <Pause size={16} /> : <FastForward size={16} />}
        </button>
      )}

      {annotationsPanelOpen && <AnnotationsPanel />}
      {formsPanelOpen && <FormsPanel />}
      {bookmarksPanelOpen && <BookmarksPanel />}
      {linksPanelOpen && <LinksPanel />}
      {layersPanelOpen && <LayersPanel />}
      {namedDestsPanelOpen && <NamedDestsPanel />}
    </div>
  )
}
