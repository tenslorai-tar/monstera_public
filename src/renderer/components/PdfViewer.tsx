import { useEffect, useRef, useCallback } from 'react'
import { usePdfStore, PAGE_GAP } from '../store/usePdfStore'
import PdfPage from './PdfPage'
import Sidebar from './Sidebar'
import AnnotationsPanel from './AnnotationsPanel'
import FormsPanel from './FormsPanel'
import BookmarksPanel from './BookmarksPanel'

export default function PdfViewer() {
  const numPages = usePdfStore(s => s.numPages)
  const pageSizes = usePdfStore(s => s.pageSizes)
  const scale = usePdfStore(s => s.scale)
  const setCurrentPage = usePdfStore(s => s.setCurrentPage)
  const setContainerSize = usePdfStore(s => s.setContainerSize)
  const setScrollToPage = usePdfStore(s => s.setScrollToPage)

  const annotationsPanelOpen = usePdfStore(s => s.annotationsPanelOpen)
  const formsPanelOpen = usePdfStore(s => s.formsPanelOpen)
  const bookmarksPanelOpen = usePdfStore(s => s.bookmarksPanelOpen)
  const scrollRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)

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

  // Ctrl+scroll to zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const setScale = usePdfStore.getState().setScale
    const current = usePdfStore.getState().scale
    const delta = e.deltaY < 0 ? 0.1 : -0.1
    const next = Math.min(5, Math.max(0.25, Math.round((current + delta) * 100) / 100))
    setScale(next)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  return (
    <div className="viewer-area" ref={viewerRef}>
      <Sidebar />
      <div
        className="pdf-scroll-container"
        ref={scrollRef}
        onScroll={handleScroll}
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
      {annotationsPanelOpen && <AnnotationsPanel />}
      {formsPanelOpen && <FormsPanel />}
      {bookmarksPanelOpen && <BookmarksPanel />}
    </div>
  )
}
