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

export const PAGE_GAP = 16
const CANVAS_PADDING = 48
const MAX_UNDO = 10

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

async function buildPdfDoc(bytes: Uint8Array) {
  const pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise
  const numPages = pdfDoc.numPages
  const pageSizes = await Promise.all(
    Array.from({ length: numPages }, (_, i) =>
      pdfDoc.getPage(i + 1).then(p => {
        const vp = p.getViewport({ scale: 1 })
        return { width: vp.width, height: vp.height }
      })
    )
  )
  return { pdfDoc, numPages, pageSizes }
}

interface PdfStore {
  pdfDoc: PDFDocumentProxy | null
  pdfBytes: Uint8Array | null
  numPages: number
  filePath: string
  fileName: string
  pageSizes: PageSize[]
  isDirty: boolean

  undoStack: Uint8Array[]
  redoStack: Uint8Array[]

  selectedPages: Set<number>

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

  // Loaders
  loadPdf: (bytes: ArrayBuffer, filePath: string, fileName: string) => Promise<void>
  reloadWithBytes: (bytes: Uint8Array) => Promise<void>

  // Edit
  applyEdit: (newBytes: Uint8Array) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  save: () => Promise<void>
  saveAs: () => Promise<void>

  // Selection
  setSelectedPages: (pages: Set<number>) => void
  togglePageSelection: (pageNum: number) => void
  clearSelection: () => void

  // View
  setScale: (scale: number) => void
  setZoomMode: (mode: ZoomMode) => void
  setContainerSize: (width: number, height: number) => void
  setCurrentPage: (page: number) => void
  toggleSidebar: () => void

  // Search
  setSearchOpen: (open: boolean) => void
  runSearch: (query: string) => void
  setActiveMatch: (index: number) => void
  nextMatch: () => void
  prevMatch: () => void
}

export const usePdfStore = create<PdfStore>((set, get) => ({
  pdfDoc: null,
  pdfBytes: null,
  numPages: 0,
  filePath: '',
  fileName: '',
  pageSizes: [],
  isDirty: false,

  undoStack: [],
  redoStack: [],

  selectedPages: new Set(),

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

  // ── Loaders ──────────────────────────────────────────────────────────────

  loadPdf: async (bytes, filePath, fileName) => {
    clearTextCache()
    const uint8 = new Uint8Array(bytes)
    const { pdfDoc, numPages, pageSizes } = await buildPdfDoc(uint8)
    const { containerWidth, containerHeight, zoomMode } = get()
    const scale = zoomMode === 'custom'
      ? get().scale
      : computeFitScale(zoomMode, pageSizes, containerWidth, containerHeight)
    set({
      pdfDoc, pdfBytes: uint8, numPages, filePath, fileName, pageSizes,
      isDirty: false, undoStack: [], redoStack: [], selectedPages: new Set(),
      scale, currentPage: 1,
      searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
    })
    loadAllPageText(pdfDoc).catch(() => {})
  },

  reloadWithBytes: async (bytes) => {
    clearTextCache()
    const { pdfDoc, numPages, pageSizes } = await buildPdfDoc(bytes)
    const { filePath, fileName, scale, zoomMode, sidebarOpen, currentPage, containerWidth, containerHeight } = get()
    const newScale = zoomMode === 'custom'
      ? scale
      : computeFitScale(zoomMode, pageSizes, containerWidth, containerHeight)
    set({
      pdfDoc, pdfBytes: bytes, numPages, pageSizes,
      filePath, fileName, scale: newScale, zoomMode, sidebarOpen,
      currentPage: Math.min(currentPage, numPages),
      selectedPages: new Set(),
      searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
    })
    loadAllPageText(pdfDoc).catch(() => {})
  },

  // ── Edit ─────────────────────────────────────────────────────────────────

  applyEdit: async (newBytes) => {
    const { pdfBytes, undoStack } = get()
    const newUndo = pdfBytes
      ? [...undoStack.slice(-(MAX_UNDO - 1)), pdfBytes]
      : undoStack
    set({ undoStack: newUndo, redoStack: [], isDirty: true })
    await get().reloadWithBytes(newBytes)
  },

  undo: async () => {
    const { undoStack, pdfBytes, redoStack } = get()
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    const newRedo = pdfBytes ? [...redoStack.slice(-MAX_UNDO), pdfBytes] : redoStack
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: newRedo,
      isDirty: undoStack.length > 1,
    })
    await get().reloadWithBytes(prev)
  },

  redo: async () => {
    const { redoStack, pdfBytes, undoStack } = get()
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    const newUndo = pdfBytes ? [...undoStack.slice(-MAX_UNDO), pdfBytes] : undoStack
    set({
      undoStack: newUndo,
      redoStack: redoStack.slice(0, -1),
      isDirty: true,
    })
    await get().reloadWithBytes(next)
  },

  save: async () => {
    const { filePath, pdfBytes } = get()
    if (!pdfBytes || !filePath) return
    const clean = pdfBytes.slice(0)
    await window.electronAPI.writeFile(filePath, clean.buffer)
    set({ isDirty: false })
  },

  saveAs: async () => {
    const { fileName, pdfBytes } = get()
    if (!pdfBytes) return
    const newPath = await window.electronAPI.saveFileDialog(fileName || 'document.pdf')
    if (!newPath) return
    const clean = pdfBytes.slice(0)
    await window.electronAPI.writeFile(newPath, clean.buffer)
    const newName = newPath.split(/[\\/]/).pop() ?? newPath
    set({ filePath: newPath, fileName: newName, isDirty: false })
  },

  // ── Selection ────────────────────────────────────────────────────────────

  setSelectedPages: (pages) => set({ selectedPages: pages }),

  togglePageSelection: (pageNum) => {
    const prev = get().selectedPages
    const next = new Set(prev)
    if (next.has(pageNum)) next.delete(pageNum)
    else next.add(pageNum)
    set({ selectedPages: next })
  },

  clearSelection: () => set({ selectedPages: new Set() }),

  // ── View ─────────────────────────────────────────────────────────────────

  setScale: (scale) => set({ scale, zoomMode: 'custom' }),

  setZoomMode: (mode) => {
    const { pageSizes, containerWidth, containerHeight } = get()
    const newScale = computeFitScale(mode, pageSizes, containerWidth, containerHeight)
    set({ zoomMode: mode, scale: mode === 'custom' ? get().scale : newScale })
  },

  setContainerSize: (width, height) => {
    const { zoomMode, pageSizes } = get()
    const updates: Partial<PdfStore> = { containerWidth: width, containerHeight: height }
    if (zoomMode !== 'custom' && pageSizes.length > 0)
      updates.scale = computeFitScale(zoomMode, pageSizes, width, height)
    set(updates)
  },

  setCurrentPage: (page) => set({ currentPage: page }),

  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  // ── Search ───────────────────────────────────────────────────────────────

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
