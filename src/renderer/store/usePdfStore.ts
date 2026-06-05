import { create } from 'zustand'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { textCache, clearTextCache, loadAllPageText } from '../utils/textCache'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

export interface PageSize {
  width: number
  height: number
}

export interface SearchMatch {
  pageNum: number
  matchStart: number
  matchLen: number
}

export type ZoomMode = 'custom' | 'fit-width' | 'fit-page'

const PAGE_GAP = 16
const CANVAS_PADDING = 48

function computeFitScale(
  mode: ZoomMode,
  pageSizes: PageSize[],
  containerWidth: number,
  containerHeight: number
): number {
  if (mode === 'custom' || pageSizes.length === 0) return 1
  const pw = pageSizes[0].width
  const ph = pageSizes[0].height
  if (mode === 'fit-width') return (containerWidth - CANVAS_PADDING) / pw
  return Math.min(
    (containerWidth - CANVAS_PADDING) / pw,
    (containerHeight - CANVAS_PADDING) / ph
  )
}

interface PdfStore {
  pdfDoc: PDFDocumentProxy | null
  numPages: number
  filePath: string
  fileName: string
  pageSizes: PageSize[]

  scale: number
  zoomMode: ZoomMode
  containerWidth: number
  containerHeight: number
  currentPage: number

  sidebarOpen: boolean

  searchOpen: boolean
  searchQuery: string
  searchMatches: SearchMatch[]
  activeMatchIndex: number

  scrollToPage: (pageNum: number) => void
  setScrollToPage: (fn: (pageNum: number) => void) => void

  loadPdf: (bytes: ArrayBuffer, filePath: string, fileName: string) => Promise<void>
  setScale: (scale: number) => void
  setZoomMode: (mode: ZoomMode) => void
  setContainerSize: (width: number, height: number) => void
  setCurrentPage: (page: number) => void
  toggleSidebar: () => void
  setSearchOpen: (open: boolean) => void
  runSearch: (query: string) => void
  setActiveMatch: (index: number) => void
  nextMatch: () => void
  prevMatch: () => void
}

export const usePdfStore = create<PdfStore>((set, get) => ({
  pdfDoc: null,
  numPages: 0,
  filePath: '',
  fileName: '',
  pageSizes: [],

  scale: 1.5,
  zoomMode: 'custom',
  containerWidth: 0,
  containerHeight: 0,
  currentPage: 1,

  sidebarOpen: true,

  searchOpen: false,
  searchQuery: '',
  searchMatches: [],
  activeMatchIndex: -1,

  scrollToPage: () => {},
  setScrollToPage: (fn) => set({ scrollToPage: fn }),

  loadPdf: async (bytes, filePath, fileName) => {
    clearTextCache()
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) })
    const pdfDoc = await loadingTask.promise
    const numPages = pdfDoc.numPages

    const pageSizes = await Promise.all(
      Array.from({ length: numPages }, (_, i) =>
        pdfDoc.getPage(i + 1).then(p => {
          const vp = p.getViewport({ scale: 1 })
          return { width: vp.width, height: vp.height }
        })
      )
    )

    const { containerWidth, containerHeight, zoomMode } = get()
    const scale = zoomMode === 'custom'
      ? get().scale
      : computeFitScale(zoomMode, pageSizes, containerWidth, containerHeight)

    set({
      pdfDoc,
      numPages,
      filePath,
      fileName,
      pageSizes,
      scale,
      currentPage: 1,
      searchOpen: false,
      searchQuery: '',
      searchMatches: [],
      activeMatchIndex: -1,
    })

    // Load all text content in the background for search
    loadAllPageText(pdfDoc).catch(() => {})
  },

  setScale: (scale) => set({ scale, zoomMode: 'custom' }),

  setZoomMode: (mode) => {
    const { pageSizes, containerWidth, containerHeight } = get()
    const newScale = computeFitScale(mode, pageSizes, containerWidth, containerHeight)
    set({ zoomMode: mode, scale: mode === 'custom' ? get().scale : newScale })
  },

  setContainerSize: (width, height) => {
    const { zoomMode, pageSizes } = get()
    const updates: Partial<PdfStore> = { containerWidth: width, containerHeight: height }
    if (zoomMode !== 'custom' && pageSizes.length > 0) {
      updates.scale = computeFitScale(zoomMode, pageSizes, width, height)
    }
    set(updates)
  },

  setCurrentPage: (page) => set({ currentPage: page }),

  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  setSearchOpen: (open) => {
    set({ searchOpen: open })
    if (!open) set({ searchQuery: '', searchMatches: [], activeMatchIndex: -1 })
  },

  runSearch: (query) => {
    if (!query.trim()) {
      set({ searchQuery: query, searchMatches: [], activeMatchIndex: -1 })
      return
    }
    const { numPages, scrollToPage } = get()
    const lower = query.toLowerCase()
    const matches: SearchMatch[] = []

    for (let p = 1; p <= numPages; p++) {
      const cache = textCache.get(p)
      if (!cache) continue
      const text = cache.text.toLowerCase()
      let pos = 0
      while (true) {
        const idx = text.indexOf(lower, pos)
        if (idx === -1) break
        matches.push({ pageNum: p, matchStart: idx, matchLen: query.length })
        pos = idx + 1
      }
    }

    const firstPageNum = matches[0]?.pageNum
    set({ searchQuery: query, searchMatches: matches, activeMatchIndex: matches.length > 0 ? 0 : -1 })
    if (firstPageNum != null) scrollToPage(firstPageNum)
  },

  setActiveMatch: (index) => {
    const { searchMatches, scrollToPage } = get()
    if (index < 0 || index >= searchMatches.length) return
    set({ activeMatchIndex: index })
    scrollToPage(searchMatches[index].pageNum)
  },

  nextMatch: () => {
    const { searchMatches, activeMatchIndex } = get()
    if (searchMatches.length === 0) return
    get().setActiveMatch((activeMatchIndex + 1) % searchMatches.length)
  },

  prevMatch: () => {
    const { searchMatches, activeMatchIndex } = get()
    if (searchMatches.length === 0) return
    get().setActiveMatch((activeMatchIndex - 1 + searchMatches.length) % searchMatches.length)
  },
}))

export { PAGE_GAP }
