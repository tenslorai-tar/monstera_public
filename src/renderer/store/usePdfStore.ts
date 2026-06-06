import { create } from 'zustand'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { textCache, clearTextCache, loadAllPageText } from '../utils/textCache'
import type { Annotation, AnnotationTool, StampName } from '../types/annotations'
import { writeAnnotationsToPdf, readAnnotationsFromPdf } from '../utils/annotationPdfLib'
import type { FormField, FormCreationTool } from '../types/forms'
import { readFormFieldsFromPdf, writeFormToBytes, flattenFormToBytes } from '../utils/formPdfLib'
import type { OcrWord } from '../utils/ocrUtils'
import type { BookmarkItem } from '../types/bookmarks'

export interface LayerItem {
  id: string
  name: string
  visible: boolean
}

export interface NamedDest {
  name: string
  pageNum: number
}

// OCG config is not Zustand-serializable — store as a module-level ref
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ocgConfig: any = null
export function getOcgConfig() { return _ocgConfig }

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

export interface PageSize { width: number; height: number }

export interface SearchMatch { pageNum: number; matchStart: number; matchLen: number }

export type ZoomMode = 'custom' | 'fit-width' | 'fit-page'

export const PAGE_GAP = 16
const CANVAS_PADDING = 48
const MAX_UNDO = 10

function computeFitScale(
  mode: ZoomMode, pageSizes: PageSize[], containerWidth: number, containerHeight: number
): number {
  if (mode === 'custom' || pageSizes.length === 0) return 1
  const pw = pageSizes[0].width, ph = pageSizes[0].height
  if (mode === 'fit-width') return (containerWidth - CANVAS_PADDING) / pw
  return Math.min((containerWidth - CANVAS_PADDING) / pw, (containerHeight - CANVAS_PADDING) / ph)
}

async function buildPdfDoc(bytes: Uint8Array, password?: string) {
  return new Promise<{ pdfDoc: PDFDocumentProxy; numPages: number; pageSizes: PageSize[] }>(
    (resolve, reject) => {
      const task = pdfjsLib.getDocument({
        data: bytes.slice(0),
        password: password ?? '',
      })
      task.onPassword = (_updatePwd: (p: string) => void, reason: number) => {
        if (password && reason === 2) {
          reject(Object.assign(new Error('Wrong password'), { code: 'WrongPassword' }))
        } else {
          reject(Object.assign(new Error('Password required'), { code: 'NeedsPassword' }))
        }
      }
      task.promise.then(async pdfDoc => {
        const numPages = pdfDoc.numPages
        const pageSizes = await Promise.all(
          Array.from({ length: numPages }, (_, i) =>
            pdfDoc.getPage(i + 1).then(p => {
              const vp = p.getViewport({ scale: 1 })
              return { width: vp.width, height: vp.height }
            })
          )
        )
        resolve({ pdfDoc, numPages, pageSizes })
      }).catch(reject)
    }
  )
}

interface PdfStore {
  // ── Document ────────────────────────────────────────────────────────────────
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

  // ── View ────────────────────────────────────────────────────────────────────
  scale: number
  zoomMode: ZoomMode
  containerWidth: number
  containerHeight: number
  currentPage: number
  sidebarOpen: boolean

  // ── Search ──────────────────────────────────────────────────────────────────
  searchOpen: boolean
  searchQuery: string
  searchMatches: SearchMatch[]
  activeMatchIndex: number

  scrollToPage: (pageNum: number) => void
  setScrollToPage: (fn: (pageNum: number) => void) => void

  // ── Annotations ─────────────────────────────────────────────────────────────
  annotations: Annotation[]
  activeTool: AnnotationTool | null
  panMode: boolean
  selectedAnnotationId: string | null
  toolColor: string
  toolOpacity: number
  toolLineWidth: number
  toolFontSize: number
  stampName: StampName
  customStampDataUrl: string | null
  annotationsPanelOpen: boolean
  openStickyNoteId: string | null
  redactBlurred: boolean

  // ── Forms ────────────────────────────────────────────────────────────────────
  formFields: FormField[]
  formMode: boolean
  formCreationTool: FormCreationTool | null
  formsPanelOpen: boolean

  // ── Bookmarks ────────────────────────────────────────────────────────────────
  bookmarks: BookmarkItem[]
  bookmarksPanelOpen: boolean

  // ── Layers (Optional Content Groups) ─────────────────────────────────────────
  layers: LayerItem[]
  layersPanelOpen: boolean
  layerRevision: number   // increments on toggle to trigger page re-renders

  // ── Named Destinations ────────────────────────────────────────────────────────
  namedDests: NamedDest[]
  namedDestsPanelOpen: boolean

  // ── Links Panel ──────────────────────────────────────────────────────────────
  linksPanelOpen: boolean

  // ── OCR ──────────────────────────────────────────────────────────────────────
  ocrData: Map<number, OcrWord[]>

  // ── Security ─────────────────────────────────────────────────────────────────
  encryptionSettings: { userPassword: string; ownerPassword: string; permissions: number } | null

  // ── Actions ─────────────────────────────────────────────────────────────────
  loadPdf: (bytes: ArrayBuffer, filePath: string, fileName: string, password?: string) => Promise<void>
  reloadWithBytes: (bytes: Uint8Array) => Promise<void>
  getBakedBytes: () => Promise<Uint8Array>

  applyEdit: (newBytes: Uint8Array) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  save: () => Promise<void>
  saveAs: () => Promise<void>

  setSelectedPages: (pages: Set<number>) => void
  togglePageSelection: (pageNum: number) => void
  clearSelection: () => void

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

  setActiveTool: (tool: AnnotationTool | null) => void
  setPanMode: (v: boolean) => void
  addAnnotation: (ann: Annotation) => void
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void
  deleteAnnotation: (id: string) => void
  setSelectedAnnotation: (id: string | null) => void
  setToolColor: (c: string) => void
  setToolOpacity: (o: number) => void
  setToolLineWidth: (w: number) => void
  setToolFontSize: (s: number) => void
  setStampName: (n: StampName) => void
  setCustomStampDataUrl: (url: string | null) => void
  toggleAnnotationsPanel: () => void
  setOpenStickyNote: (id: string | null) => void
  setRedactBlurred: (v: boolean) => void

  // ── Bookmark actions ─────────────────────────────────────────────────────────
  addBookmark: (pageNum: number, title: string) => void
  deleteBookmark: (id: string) => void
  renameBookmark: (id: string, title: string) => void
  setBookmarks: (items: BookmarkItem[]) => void
  toggleBookmarksPanel: () => void

  // ── Layer actions ─────────────────────────────────────────────────────────────
  setLayers: (layers: LayerItem[]) => void
  toggleLayerVisibility: (id: string) => void
  toggleLayersPanel: () => void

  // ── Named destination actions ─────────────────────────────────────────────────
  setNamedDests: (dests: NamedDest[]) => void
  toggleNamedDestsPanel: () => void

  // ── Links panel action ────────────────────────────────────────────────────────
  toggleLinksPanel: () => void

  // ── OCR actions ──────────────────────────────────────────────────────────────
  setOcrData: (pageNum: number, words: OcrWord[]) => void
  clearOcrData: () => void

  // ── Security actions ─────────────────────────────────────────────────────────
  setEncryptionSettings: (s: { userPassword: string; ownerPassword: string; permissions: number } | null) => void
  applyRedactions: () => Promise<void>

  // ── Form actions ─────────────────────────────────────────────────────────────
  setFormMode: (mode: boolean) => void
  setFormCreationTool: (tool: FormCreationTool | null) => void
  addFormField: (field: FormField) => void
  updateFormField: (id: string, patch: Partial<FormField>) => void
  deleteFormField: (id: string) => void
  setRadioSelected: (groupName: string, exportValue: string) => void
  toggleFormsPanel: () => void
  flattenForm: () => Promise<void>
  identifyForms: () => Promise<number>
  resetFormFields: () => void
  exportFormData: () => string

  flattenAnnotations: () => Promise<void>
  closePdf: () => void
  clearAnnotations: () => void
}

export const usePdfStore = create<PdfStore>((set, get) => ({
  pdfDoc: null, pdfBytes: null, numPages: 0, filePath: '', fileName: '',
  pageSizes: [], isDirty: false,
  undoStack: [], redoStack: [],
  selectedPages: new Set(),
  scale: 1.5, zoomMode: 'custom', containerWidth: 0, containerHeight: 0, currentPage: 1,
  sidebarOpen: true,
  searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
  scrollToPage: () => {},
  setScrollToPage: (fn) => set({ scrollToPage: fn }),

  // ── Annotation defaults ──────────────────────────────────────────────────
  annotations: [],
  activeTool: null,
  panMode: true,
  selectedAnnotationId: null,
  toolColor: '#ffcc00',
  toolOpacity: 0.7,
  toolLineWidth: 2,
  toolFontSize: 12,
  stampName: 'Approved',
  customStampDataUrl: null,
  annotationsPanelOpen: false,
  openStickyNoteId: null,
  redactBlurred: false,

  // ── Form defaults ────────────────────────────────────────────────────────
  formFields: [],
  formMode: false,
  formCreationTool: null,
  formsPanelOpen: false,

  // ── Bookmark defaults ────────────────────────────────────────────────────
  bookmarks: [],
  bookmarksPanelOpen: false,

  // ── Layer defaults ───────────────────────────────────────────────────────
  layers: [],
  layersPanelOpen: false,
  layerRevision: 0,

  // ── Named destination defaults ───────────────────────────────────────────
  namedDests: [],
  namedDestsPanelOpen: false,

  // ── Links panel default ──────────────────────────────────────────────────
  linksPanelOpen: false,

  // ── OCR defaults ─────────────────────────────────────────────────────────
  ocrData: new Map(),

  // ── Security defaults ────────────────────────────────────────────────────
  encryptionSettings: null,

  // ── Loaders ──────────────────────────────────────────────────────────────

  loadPdf: async (bytes, filePath, fileName, password?) => {
    clearTextCache()
    const uint8 = new Uint8Array(bytes)
    const { pdfDoc, numPages, pageSizes } = await buildPdfDoc(uint8, password)
    const { containerWidth, containerHeight, zoomMode } = get()
    const scale = zoomMode === 'custom'
      ? get().scale
      : computeFitScale(zoomMode, pageSizes, containerWidth, containerHeight)
    let annotations: Annotation[] = []
    let formFields: FormField[] = []
    try { annotations = await readAnnotationsFromPdf(pdfDoc, numPages) } catch {}
    try { formFields = await readFormFieldsFromPdf(pdfDoc, numPages) } catch {}
    set({
      pdfDoc, pdfBytes: uint8, numPages, filePath, fileName, pageSizes, annotations, formFields,
      isDirty: false, undoStack: [], redoStack: [], selectedPages: new Set(),
      scale, currentPage: 1,
      searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
      selectedAnnotationId: null, openStickyNoteId: null, activeTool: null,
      formMode: false, formCreationTool: null, encryptionSettings: null,
      ocrData: new Map(), bookmarks: [], bookmarksPanelOpen: false,
      layers: [], namedDests: [], layerRevision: 0,
    })
    loadAllPageText(pdfDoc).catch(() => {})
    // Load bookmarks (outline) from PDF in background
    if (uint8.length > 0) {
      window.electronAPI.mupdfGetOutline(uint8.buffer as ArrayBuffer)
        .then(items => set({ bookmarks: items }))
        .catch(() => {})
    }
    // Load layers (OCG) from PDF.js
    pdfDoc.getOptionalContentConfig().then(ocgConfig => {
      _ocgConfig = ocgConfig
      const groups = ocgConfig?.getGroups?.() ?? null
      const layerItems: LayerItem[] = []
      if (groups) {
        for (const [id, group] of (groups as Map<string, {name: string; visible?: boolean}>).entries()) {
          layerItems.push({ id, name: group.name ?? id, visible: group.visible !== false })
        }
      }
      set({ layers: layerItems })
    }).catch(() => { _ocgConfig = null })
    // Load named destinations from PDF.js
    pdfDoc.getDestinations().then(async (dests) => {
      const namedItems: NamedDest[] = []
      for (const [name, dest] of Object.entries(dests)) {
        try {
          const destArray = Array.isArray(dest) ? dest : null
          if (destArray && destArray[0] && typeof destArray[0] === 'object') {
            const pageIdx = await pdfDoc.getPageIndex(destArray[0] as Parameters<typeof pdfDoc.getPageIndex>[0])
            namedItems.push({ name, pageNum: pageIdx + 1 })
          }
        } catch { /* skip unresolvable */ }
      }
      set({ namedDests: namedItems })
    }).catch(() => {})
  },

  reloadWithBytes: async (bytes) => {
    clearTextCache()
    const { pdfDoc, numPages, pageSizes } = await buildPdfDoc(bytes)
    const { filePath, fileName, scale, zoomMode, sidebarOpen, currentPage,
            containerWidth, containerHeight, annotationsPanelOpen, formsPanelOpen } = get()
    const newScale = zoomMode === 'custom'
      ? scale
      : computeFitScale(zoomMode, pageSizes, containerWidth, containerHeight)
    let annotations: Annotation[] = []
    let formFields: FormField[] = []
    try { annotations = await readAnnotationsFromPdf(pdfDoc, numPages) } catch {}
    try { formFields = await readFormFieldsFromPdf(pdfDoc, numPages) } catch {}
    set({
      pdfDoc, pdfBytes: bytes, numPages, pageSizes, annotations, formFields,
      filePath, fileName, scale: newScale, zoomMode, sidebarOpen, annotationsPanelOpen, formsPanelOpen,
      currentPage: Math.min(currentPage, numPages),
      selectedPages: new Set(),
      searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
      selectedAnnotationId: null, openStickyNoteId: null,
    })
    loadAllPageText(pdfDoc).catch(() => {})
  },

  getBakedBytes: async () => {
    const { pdfBytes, annotations, formFields } = get()
    if (!pdfBytes) throw new Error('No document loaded')
    let bytes = pdfBytes
    if (annotations.length > 0) bytes = await writeAnnotationsToPdf(bytes, annotations)
    if (formFields.length > 0) bytes = await writeFormToBytes(bytes, formFields)
    return bytes
  },

  // ── Edit ─────────────────────────────────────────────────────────────────

  applyEdit: async (newBytes) => {
    const { pdfBytes, annotations, formFields, undoStack } = get()
    let undoBytes: Uint8Array | null = pdfBytes
    if (pdfBytes) {
      try {
        if (annotations.length > 0) undoBytes = await writeAnnotationsToPdf(pdfBytes, annotations)
        if (formFields.length > 0) undoBytes = await writeFormToBytes(undoBytes ?? pdfBytes, formFields)
      } catch {}
    }
    const newUndo = undoBytes
      ? [...undoStack.slice(-(MAX_UNDO - 1)), undoBytes]
      : undoStack
    set({ undoStack: newUndo, redoStack: [], isDirty: true })
    await get().reloadWithBytes(newBytes)
  },

  undo: async () => {
    const { undoStack, pdfBytes, annotations, redoStack } = get()
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    let redoBytes = pdfBytes
    if (pdfBytes && annotations.length > 0) {
      try { redoBytes = await writeAnnotationsToPdf(pdfBytes, annotations) } catch {}
    }
    const newRedo = redoBytes ? [...redoStack.slice(-MAX_UNDO), redoBytes] : redoStack
    set({ undoStack: undoStack.slice(0, -1), redoStack: newRedo, isDirty: undoStack.length > 1 })
    await get().reloadWithBytes(prev)
  },

  redo: async () => {
    const { redoStack, pdfBytes, annotations, undoStack } = get()
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    let undoBytes = pdfBytes
    if (pdfBytes && annotations.length > 0) {
      try { undoBytes = await writeAnnotationsToPdf(pdfBytes, annotations) } catch {}
    }
    const newUndo = undoBytes ? [...undoStack.slice(-MAX_UNDO), undoBytes] : undoStack
    set({ undoStack: newUndo, redoStack: redoStack.slice(0, -1), isDirty: true })
    await get().reloadWithBytes(next)
  },

  save: async () => {
    const { filePath, pdfBytes, annotations, formFields, encryptionSettings, bookmarks } = get()
    if (!pdfBytes || !filePath) return
    let baked = pdfBytes
    if (annotations.length > 0) baked = await writeAnnotationsToPdf(baked, annotations)
    if (formFields.length > 0) baked = await writeFormToBytes(baked, formFields)
    baked = new Uint8Array(await window.electronAPI.mupdfWriteOutline(baked.buffer as ArrayBuffer, bookmarks))
    if (encryptionSettings) {
      baked = new Uint8Array(await window.electronAPI.mupdfEncrypt(baked.buffer as ArrayBuffer, encryptionSettings))
    }
    await window.electronAPI.writeFile(filePath, baked.slice(0).buffer)
    const hasNew = formFields.some(f => f.isNew)
    const hasPlacedImages = annotations.some(a => a.type === 'placed-image')
    if (hasNew || hasPlacedImages) await get().reloadWithBytes(baked)
    else set({ isDirty: false })
  },

  saveAs: async () => {
    const { fileName, pdfBytes, annotations, formFields, encryptionSettings, bookmarks } = get()
    if (!pdfBytes) return
    const newPath = await window.electronAPI.saveFileDialog(fileName || 'document.pdf')
    if (!newPath) return
    let baked = pdfBytes
    if (annotations.length > 0) baked = await writeAnnotationsToPdf(baked, annotations)
    if (formFields.length > 0) baked = await writeFormToBytes(baked, formFields)
    baked = new Uint8Array(await window.electronAPI.mupdfWriteOutline(baked.buffer as ArrayBuffer, bookmarks))
    if (encryptionSettings) {
      baked = new Uint8Array(await window.electronAPI.mupdfEncrypt(baked.buffer as ArrayBuffer, encryptionSettings))
    }
    await window.electronAPI.writeFile(newPath, baked.slice(0).buffer)
    const newName = newPath.split(/[\\/]/).pop() ?? newPath
    const hasNew = formFields.some(f => f.isNew)
    const hasPlacedImages = annotations.some(a => a.type === 'placed-image')
    if (hasNew || hasPlacedImages) {
      set({ filePath: newPath, fileName: newName })
      await get().reloadWithBytes(baked)
    } else {
      set({ filePath: newPath, fileName: newName, isDirty: false })
    }
  },

  // ── Selection ────────────────────────────────────────────────────────────

  setSelectedPages: (pages) => set({ selectedPages: pages }),
  togglePageSelection: (pageNum) => {
    const prev = get().selectedPages
    const next = new Set(prev)
    if (next.has(pageNum)) next.delete(pageNum); else next.add(pageNum)
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
    if (!query.trim()) { set({ searchQuery: query, searchMatches: [], activeMatchIndex: -1 }); return }
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

  // ── Annotations ──────────────────────────────────────────────────────────

  setActiveTool: (tool) => set({ activeTool: tool, selectedAnnotationId: null }),
  setPanMode: (v) => set({ panMode: v }),
  addAnnotation: (ann) => set(s => ({ annotations: [...s.annotations, ann], isDirty: true })),
  updateAnnotation: (id, patch) => set(s => ({
    annotations: s.annotations.map(a => a.id === id ? { ...a, ...patch } as Annotation : a),
    isDirty: true,
  })),
  deleteAnnotation: (id) => set(s => ({
    annotations: s.annotations.filter(a => a.id !== id),
    selectedAnnotationId: s.selectedAnnotationId === id ? null : s.selectedAnnotationId,
    isDirty: true,
  })),
  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),
  setToolColor: (c) => set({ toolColor: c }),
  setToolOpacity: (o) => set({ toolOpacity: o }),
  setToolLineWidth: (w) => set({ toolLineWidth: w }),
  setToolFontSize: (s) => set({ toolFontSize: s }),
  setStampName: (n) => set({ stampName: n }),
  setCustomStampDataUrl: (url) => set({ customStampDataUrl: url }),
  toggleAnnotationsPanel: () => set(s => ({ annotationsPanelOpen: !s.annotationsPanelOpen })),
  setOpenStickyNote: (id) => set({ openStickyNoteId: id }),
  setRedactBlurred: (v) => set({ redactBlurred: v }),

  // ── Security actions ──────────────────────────────────────────────────────
  setEncryptionSettings: (s) => set({ encryptionSettings: s, isDirty: true }),
  applyRedactions: async () => {
    const { annotations, getBakedBytes, applyEdit, addAnnotation, deleteAnnotation } = get()
    const redactAnns = annotations.filter(a => a.type === 'redact') as import('../types/annotations').RedactAnn[]
    if (redactAnns.length === 0) return

    const solidAnns   = redactAnns.filter(a => !a.blurred)
    const blurredAnns = redactAnns.filter(a => a.blurred)

    let baked = await getBakedBytes()

    // Apply blurred redactions: render page via PDF.js, crop region, blur, overlay as placed-image
    if (blurredAnns.length > 0) {
      const pdfDoc = await pdfjsLib.getDocument({ data: baked.slice() }).promise
      const pageCache: Map<number, { canvas: HTMLCanvasElement; pageH: number; scale: number }> = new Map()
      const BLUR_SCALE = 2.5

      for (const a of blurredAnns) {
        if (!pageCache.has(a.pageNum)) {
          const pdfPage = await pdfDoc.getPage(a.pageNum)
          const viewport = pdfPage.getViewport({ scale: BLUR_SCALE })
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          const ctx = canvas.getContext('2d')!
          await pdfPage.render({ canvasContext: ctx, viewport }).promise
          pageCache.set(a.pageNum, { canvas, pageH: viewport.height / BLUR_SCALE, scale: BLUR_SCALE })
        }
        const { canvas, pageH, scale } = pageCache.get(a.pageNum)!

        const x1 = Math.min(a.x1, a.x2); const x2 = Math.max(a.x1, a.x2)
        const y1 = Math.min(a.y1, a.y2); const y2 = Math.max(a.y1, a.y2)
        const sx = Math.round(x1 * scale)
        const sy = Math.round((pageH - y2) * scale)
        const cw = Math.round((x2 - x1) * scale)
        const ch = Math.round((y2 - y1) * scale)
        if (cw < 2 || ch < 2) { deleteAnnotation(a.id); continue }

        const cropCanvas = document.createElement('canvas')
        cropCanvas.width = cw; cropCanvas.height = ch
        const ctx = cropCanvas.getContext('2d')!
        ctx.drawImage(canvas, sx, sy, cw, ch, 0, 0, cw, ch)

        const blurCanvas = document.createElement('canvas')
        blurCanvas.width = cw; blurCanvas.height = ch
        const bctx = blurCanvas.getContext('2d')!
        bctx.filter = 'blur(10px)'
        bctx.drawImage(cropCanvas, 0, 0)

        addAnnotation({
          id: `blurred-${a.id}`, pageNum: a.pageNum, type: 'placed-image',
          x: x1, y: y1, width: x2 - x1, height: y2 - y1,
          dataUrl: blurCanvas.toDataURL('image/png'),
          color: '#000000', opacity: 1, createdAt: Date.now(),
        } as import('../types/annotations').PlacedImageAnn)
        deleteAnnotation(a.id)
      }
    }

    // Apply solid redactions permanently via MuPDF (true content removal)
    if (solidAnns.length > 0) {
      baked = await getBakedBytes()
      const areas = solidAnns.map(a => ({
        pageNum: a.pageNum, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2,
      }))
      const result = await window.electronAPI.mupdfApplyRedactions(baked.buffer as ArrayBuffer, areas)
      await applyEdit(new Uint8Array(result))
      for (const a of solidAnns) deleteAnnotation(a.id)
    }
  },

  // ── Form actions ──────────────────────────────────────────────────────────
  setFormMode: (mode) => set({ formMode: mode, formCreationTool: null }),
  setFormCreationTool: (tool) => set({ formCreationTool: tool }),
  addFormField: (field) => set(s => ({ formFields: [...s.formFields, field], isDirty: true })),
  updateFormField: (id, patch) => set(s => ({
    formFields: s.formFields.map(f => f.id === id ? { ...f, ...patch } as FormField : f),
    isDirty: true,
  })),
  deleteFormField: (id) => set(s => ({
    formFields: s.formFields.filter(f => f.id !== id),
    isDirty: true,
  })),
  setRadioSelected: (groupName, exportValue) => set(s => ({
    formFields: s.formFields.map(f =>
      f.type === 'radio' && f.groupName === groupName
        ? { ...f, selected: f.exportValue === exportValue }
        : f
    ),
    isDirty: true,
  })),
  toggleFormsPanel: () => set(s => ({ formsPanelOpen: !s.formsPanelOpen })),
  flattenForm: async () => {
    const { getBakedBytes, applyEdit } = get()
    const baked = await getBakedBytes()
    const flattened = await flattenFormToBytes(baked)
    await applyEdit(flattened)
  },

  identifyForms: async () => {
    const { pdfBytes } = get()
    if (!pdfBytes) return 0
    const detected = await window.electronAPI.formsIdentify(pdfBytes.buffer as ArrayBuffer)
    let added = 0
    for (const d of detected) {
      const id = Math.random().toString(36).slice(2)
      const fieldName = `${d.fieldType}_${d.label.replace(/\W+/g, '_').slice(0, 20)}_${id.slice(0, 4)}`
      const base = { id, pageNum: d.pageNum, rect: d.rect, readOnly: false, isNew: true, fieldName }
      if (d.fieldType === 'date') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get().addFormField({ ...base, type: 'date', value: '', format: 'YYYY-MM-DD' } as any)
      } else if (d.fieldType === 'checkbox') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get().addFormField({ ...base, type: 'checkbox', checked: false, exportValue: 'Yes' } as any)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get().addFormField({ ...base, type: 'text', value: '', multiline: false } as any)
      }
      added++
    }
    if (added > 0) set({ formMode: true, formsPanelOpen: true })
    return added
  },

  resetFormFields: () => set(s => ({
    formFields: s.formFields.map(f => {
      if (f.type === 'text' || f.type === 'date') return { ...f, value: '' }
      if (f.type === 'checkbox') return { ...f, checked: false }
      if (f.type === 'radio') return { ...f, selected: false }
      if (f.type === 'dropdown' || f.type === 'listbox') return { ...f, selectedOptions: [] }
      return f
    }),
    isDirty: true,
  })),

  exportFormData: () => {
    const { formFields } = get()
    const data: Record<string, unknown> = {}
    for (const f of formFields) {
      if (f.type === 'text' || f.type === 'date') data[f.fieldName] = (f as any).value ?? ''
      else if (f.type === 'checkbox') data[f.fieldName] = (f as any).checked ?? false
      else if (f.type === 'radio') data[f.fieldName] = (f as any).selected ? (f as any).exportValue : null
      else if (f.type === 'dropdown' || f.type === 'listbox') data[f.fieldName] = (f as any).selectedOptions ?? []
    }
    return JSON.stringify(data, null, 2)
  },

  // ── Bookmark actions ──────────────────────────────────────────────────────────
  addBookmark: (pageNum, title) => set(s => ({
    bookmarks: [...s.bookmarks, { id: Math.random().toString(36).slice(2), title, pageNum }],
    isDirty: true,
  })),
  deleteBookmark: (id) => set(s => ({
    bookmarks: s.bookmarks.filter(b => b.id !== id),
    isDirty: true,
  })),
  renameBookmark: (id, title) => set(s => ({
    bookmarks: s.bookmarks.map(b => b.id === id ? { ...b, title } : b),
    isDirty: true,
  })),
  setBookmarks: (items) => set({ bookmarks: items, isDirty: true }),
  toggleBookmarksPanel: () => set(s => ({ bookmarksPanelOpen: !s.bookmarksPanelOpen })),

  // ── Layer actions ─────────────────────────────────────────────────────────────
  setLayers: (layers) => set({ layers }),
  toggleLayerVisibility: (id) => {
    const { layers, layerRevision } = get()
    const layer = layers.find(l => l.id === id)
    if (!layer) return
    const newVisible = !layer.visible
    if (_ocgConfig) {
      try { _ocgConfig.setVisibility(id, newVisible) } catch {}
    }
    set({
      layers: layers.map(l => l.id === id ? { ...l, visible: newVisible } : l),
      layerRevision: layerRevision + 1,
    })
  },
  toggleLayersPanel: () => set(s => ({ layersPanelOpen: !s.layersPanelOpen })),

  // ── Named destination actions ──────────────────────────────────────────────────
  setNamedDests: (dests) => set({ namedDests: dests }),
  toggleNamedDestsPanel: () => set(s => ({ namedDestsPanelOpen: !s.namedDestsPanelOpen })),

  // ── Links panel action ─────────────────────────────────────────────────────────
  toggleLinksPanel: () => set(s => ({ linksPanelOpen: !s.linksPanelOpen })),

  // ── OCR actions ──────────────────────────────────────────────────────────────
  setOcrData: (pageNum, words) => set(s => ({
    ocrData: new Map(s.ocrData).set(pageNum, words),
  })),
  clearOcrData: () => set({ ocrData: new Map() }),

  // ── Flatten annotations: bake to PDF bytes, clear in-memory list ────────────
  flattenAnnotations: async () => {
    const { getBakedBytes, formFields } = get()
    const baked = await getBakedBytes()
    // Reload with baked bytes but clear annotations so overlay is empty
    // (annotations are now embedded as PDF annotation objects in baked)
    const { pdfDoc, numPages, pageSizes } = await buildPdfDoc(baked)
    const { filePath, fileName, scale, zoomMode, sidebarOpen, currentPage,
            annotationsPanelOpen, formsPanelOpen } = get()
    clearTextCache()
    set({
      pdfDoc, pdfBytes: baked, numPages, pageSizes, annotations: [],
      formFields, filePath, fileName, scale, zoomMode, sidebarOpen,
      annotationsPanelOpen, formsPanelOpen,
      currentPage: Math.min(currentPage, numPages),
      selectedPages: new Set(), isDirty: true,
      searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
      selectedAnnotationId: null, openStickyNoteId: null,
    })
    loadAllPageText(pdfDoc).catch(() => {})
  },

  // ── Document lifecycle ────────────────────────────────────────────────────────
  closePdf: () => {
    clearTextCache()
    _ocgConfig = null
    set({
      pdfDoc: null, pdfBytes: null, numPages: 0, filePath: '', fileName: '',
      pageSizes: [], isDirty: false, undoStack: [], redoStack: [],
      selectedPages: new Set(), currentPage: 1,
      searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
      annotations: [], activeTool: null, selectedAnnotationId: null, openStickyNoteId: null,
      formFields: [], formMode: false, formCreationTool: null, formsPanelOpen: false,
      bookmarks: [], bookmarksPanelOpen: false, annotationsPanelOpen: false,
      layers: [], layersPanelOpen: false, layerRevision: 0,
      namedDests: [], namedDestsPanelOpen: false, linksPanelOpen: false,
      encryptionSettings: null, ocrData: new Map(),
    })
  },

  clearAnnotations: () => set({ annotations: [] }),
}))
