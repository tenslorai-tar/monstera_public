import { create } from 'zustand'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { textCache, clearTextCache, loadAllPageText, loadPageText, normalizeForSearch } from '../utils/textCache'
import { clearAllSearchRanges } from '../utils/searchHighlights'
import type { Annotation, AnnotationTool, StampName } from '../types/annotations'
import { writeAnnotationsToPdf, readAnnotationsFromPdf } from '../utils/annotationPdfLib'
import { newId } from '../utils/annotationUtils'
import type { FormField, FormCreationTool } from '../types/forms'
import { readFormFieldsFromPdf, writeFormToBytes, flattenFormToBytes } from '../utils/formPdfLib'
import type { OcrWord } from '../utils/ocrUtils'
import type { BookmarkItem } from '../types/bookmarks'

// Guards against overlapping saves (e.g. autosave firing while a previous save
// is still baking a large PDF). Concurrent callers await the same in-flight save.
let saveInFlight: Promise<void> | null = null

// Shift every geometry field of an annotation by (dx, dy) PDF points, in place.
// Used for paste/duplicate offset so the copy doesn't sit exactly on the original.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shiftAnnotation(a: any, dx: number, dy: number): void {
  switch (a.type) {
    case 'rectangle': case 'ellipse': case 'line': case 'arrow': case 'redact': case 'link':
      a.x1 += dx; a.y1 += dy; a.x2 += dx; a.y2 += dy; break
    case 'highlight': case 'underline': case 'strikethrough':
      a.quads = a.quads.map((q: number[]) =>
        [q[0]+dx, q[1]+dy, q[2]+dx, q[3]+dy, q[4]+dx, q[5]+dy, q[6]+dx, q[7]+dy]); break
    case 'ink':
      a.paths = a.paths.map((p: Array<[number, number]>) => p.map(([x, y]) => [x+dx, y+dy])); break
    case 'polygon': case 'polyline': case 'cloud':
    case 'measure-distance': case 'measure-area': case 'measure-perimeter':
      a.points = a.points.map(([x, y]: [number, number]) => [x+dx, y+dy]); break
    case 'callout':
      a.x += dx; a.y += dy; a.tipX += dx; a.tipY += dy; break
    default:
      a.x += dx; a.y += dy
  }
}

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

import '../utils/pdfjsWorker'

export interface PageSize { width: number; height: number }

// A single undo/redo step. Captures the raw PDF bytes AND the overlay state
// (annotations, form fields) so that adding/moving/deleting an annotation is
// undoable, not just content-stream edits.
export interface EditSnapshot {
  bytes: Uint8Array
  annotations: Annotation[]
  formFields: FormField[]
}

export interface SearchMatch { pageNum: number; matchStart: number; matchLen: number }

const WORD_CHAR = /[\p{L}\p{N}_]/u
function isWholeWordMatch(text: string, start: number, len: number): boolean {
  const before = start > 0 ? text[start - 1] : ''
  const after = start + len < text.length ? text[start + len] : ''
  return !(before && WORD_CHAR.test(before)) && !(after && WORD_CHAR.test(after))
}

// Background text-extraction generation token: bumping it cancels any
// in-flight indexing loop from a previous document state.
let textIndexGen = 0

export type ZoomMode = 'custom' | 'fit-width' | 'fit-page'

export const PAGE_GAP = 16
const CANVAS_PADDING = 48
// Undo is tiered: overlay-only steps (annotation/form changes) share the same
// byte buffer by reference and are nearly free, so the stack can be deep.
// Steps that changed the document bytes each retain a full buffer — cap how
// many distinct buffers stay alive so huge scans can't pin gigabytes.
const MAX_UNDO = 50
const MAX_BYTE_SNAPSHOTS = 10

// Trim a snapshot stack: at most MAX_UNDO entries, and only the newest
// MAX_BYTE_SNAPSHOTS distinct byte buffers (older entries are dropped).
function trimUndoStack(stack: EditSnapshot[]): EditSnapshot[] {
  const out = stack.slice(-MAX_UNDO)
  const seen = new Set<Uint8Array>()
  for (let i = out.length - 1; i >= 0; i--) {
    seen.add(out[i].bytes)
    if (seen.size > MAX_BYTE_SNAPSHOTS) return out.slice(i + 1)
  }
  return out
}

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

  undoStack: EditSnapshot[]
  redoStack: EditSnapshot[]

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
  searchCaseSensitive: boolean
  searchWholeWord: boolean
  searchRegex: boolean
  searchRegexError: string
  searchIndexing: boolean
  setSearchOptions: (patch: Partial<Pick<PdfStore, 'searchCaseSensitive' | 'searchWholeWord' | 'searchRegex'>>) => void
  startTextIndexing: (doc: PDFDocumentProxy) => void

  scrollToPage: (pageNum: number) => void
  setScrollToPage: (fn: (pageNum: number) => void) => void

  // ── Navigation history (previous/next view, like Acrobat's green arrows) ─────
  navBack: number[]
  navForward: number[]
  jumpToPage: (pageNum: number) => void
  goBack: () => void
  goForward: () => void

  // ── Annotations ─────────────────────────────────────────────────────────────
  annotations: Annotation[]
  activeTool: AnnotationTool | null
  panMode: boolean
  selectedAnnotationId: string | null
  annotationClipboard: Annotation | null
  toolColor: string
  toolOpacity: number
  toolLineWidth: number
  toolFontSize: number
  toolFont: string
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
  applyContentEdit: (newBytes: Uint8Array, pageNum: number) => Promise<void>
  pushUndo: () => void
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
  copyAnnotation: (id: string) => void
  pasteAnnotation: (pageNum?: number) => void
  duplicateAnnotation: (id: string) => void
  bringAnnotationToFront: (id: string) => void
  sendAnnotationToBack: (id: string) => void
  setToolColor: (c: string) => void
  setToolOpacity: (o: number) => void
  setToolLineWidth: (w: number) => void
  setToolFontSize: (s: number) => void
  setToolFont: (f: string) => void
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
  sidebarOpen: false,
  searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
  searchCaseSensitive: false, searchWholeWord: false, searchRegex: false,
  searchRegexError: '', searchIndexing: false,
  setSearchOptions: (patch) => {
    set(patch)
    const q = get().searchQuery
    if (q.trim()) get().runSearch(q)
  },
  // Extract page text in the background for search. A new call (new document
  // state) cancels the previous loop; when done, an open query re-runs so the
  // user gets complete results instead of silently partial ones.
  startTextIndexing: (doc) => {
    const gen = ++textIndexGen
    set({ searchIndexing: true })
    loadAllPageText(doc, () => gen !== textIndexGen)
      .catch(() => {})
      .finally(() => {
        if (gen !== textIndexGen) return
        set({ searchIndexing: false })
        const q = get().searchQuery
        if (q.trim() && get().searchOpen) get().runSearch(q)
      })
  },
  scrollToPage: () => {},
  setScrollToPage: (fn) => set({ scrollToPage: fn }),

  // ── Navigation history ───────────────────────────────────────────────────
  navBack: [],
  navForward: [],
  jumpToPage: (pageNum) => {
    const { numPages, currentPage, scrollToPage, navBack } = get()
    if (numPages === 0) return
    const target = Math.max(1, Math.min(numPages, Math.round(pageNum)))
    if (target === currentPage) { scrollToPage(target); return }
    // Record where we were so Back returns there; dedupe consecutive origins.
    const last = navBack[navBack.length - 1]
    const nextBack = (last === currentPage ? navBack : [...navBack, currentPage]).slice(-50)
    set({ navBack: nextBack, navForward: [] })
    scrollToPage(target)
  },
  goBack: () => {
    const { navBack, currentPage, scrollToPage } = get()
    if (navBack.length === 0) return
    const target = navBack[navBack.length - 1]
    set({ navBack: navBack.slice(0, -1), navForward: [currentPage, ...get().navForward].slice(0, 50) })
    scrollToPage(target)
  },
  goForward: () => {
    const { navForward, currentPage, scrollToPage } = get()
    if (navForward.length === 0) return
    const target = navForward[0]
    set({ navForward: navForward.slice(1), navBack: [...get().navBack, currentPage].slice(-50) })
    scrollToPage(target)
  },

  // ── Annotation defaults ──────────────────────────────────────────────────
  annotations: [],
  activeTool: null,
  panMode: false, // default to text-select mode so text is selectable out of the box
  selectedAnnotationId: null,
  annotationClipboard: null,
  toolColor: '#ffcc00',
  toolOpacity: 0.7,
  toolLineWidth: 2,
  toolFontSize: 12,
  toolFont: 'Helvetica',
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
      scale, currentPage: 1, navBack: [], navForward: [],
      searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
      selectedAnnotationId: null, openStickyNoteId: null, activeTool: null,
      formMode: false, formCreationTool: null, encryptionSettings: null,
      ocrData: new Map(), bookmarks: [], bookmarksPanelOpen: false,
      layers: [], namedDests: [], layerRevision: 0,
    })
    get().startTextIndexing(pdfDoc)
    // Load bookmarks (outline) from PDF in background
    if (uint8.length > 0) {
      window.electronAPI.mupdfGetOutline(uint8.buffer as ArrayBuffer)
        .then(items => set({ bookmarks: items }))
        .catch(() => {})
    }
    // Load layers (OCG) from PDF.js
    pdfDoc.getOptionalContentConfig().then(ocgConfig => {
      _ocgConfig = ocgConfig
      const layerItems: LayerItem[] = []
      // pdf.js v6: OptionalContentConfig is iterable over [id, group] pairs
      for (const [id, group] of (ocgConfig as Iterable<[string, { name?: string; visible?: boolean }]>)) {
        layerItems.push({ id, name: group?.name ?? id, visible: group?.visible !== false })
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
      navBack: [], navForward: [],
      selectedPages: new Set(),
      searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
      selectedAnnotationId: null, openStickyNoteId: null,
    })
    get().startTextIndexing(pdfDoc)
  },

  getBakedBytes: async () => {
    const { pdfBytes, annotations, formFields } = get()
    if (!pdfBytes) throw new Error('No document loaded')
    let bytes = pdfBytes
    const hasMarkup = annotations.some(a => a.type !== 'placed-image' && a.type !== 'text-edit')
    if (annotations.length > 0) bytes = await writeAnnotationsToPdf(bytes, annotations)
    if (formFields.length > 0) bytes = await writeFormToBytes(bytes, formFields)
    // pdf-lib writes bare annotation dicts; let MuPDF synthesize the /AP
    // appearance streams so the markup renders in every viewer.
    if (hasMarkup) {
      try {
        bytes = new Uint8Array(await window.electronAPI.mupdfSynthesizeAppearances(bytes.slice().buffer as ArrayBuffer))
      } catch { /* keep un-synthesized bytes rather than failing the save */ }
    }
    return bytes
  },

  // ── Edit ─────────────────────────────────────────────────────────────────

  // Capture the current document + overlay state as one undo step. Called before
  // any mutation that should be undoable (annotation add/move/delete, content edit).
  pushUndo: () => {
    const { pdfBytes, annotations, formFields, undoStack } = get()
    if (!pdfBytes) return
    const snap: EditSnapshot = { bytes: pdfBytes, annotations, formFields }
    set({ undoStack: trimUndoStack([...undoStack, snap]), redoStack: [] })
  },

  applyEdit: async (newBytes) => {
    get().pushUndo()
    set({ isDirty: true })
    await get().reloadWithBytes(newBytes)
  },

  // Incremental edit for content-only changes (e.g. PDFium in-place text edits).
  // Unlike applyEdit→reloadWithBytes this preserves zoom, scroll, current page,
  // selection and search, only re-extracting the edited page's text, and keeps
  // the existing overlay annotations untouched.
  applyContentEdit: async (newBytes, pageNum) => {
    get().pushUndo()
    const { currentPage } = get()
    const { pdfDoc, numPages, pageSizes } = await buildPdfDoc(newBytes)
    set({
      pdfDoc, pdfBytes: newBytes, numPages, pageSizes,
      isDirty: true,
      currentPage: Math.min(currentPage, numPages),
      // search highlights would point at stale offsets on the edited page
      searchMatches: [], activeMatchIndex: -1,
    })
    if (pageNum >= 1 && pageNum <= numPages) {
      textCache.delete(pageNum)
      loadPageText(pdfDoc, pageNum).catch(() => {})
    }
  },

  undo: async () => {
    const { undoStack, redoStack, pdfBytes, annotations, formFields, currentPage } = get()
    if (undoStack.length === 0 || !pdfBytes) return
    const prev = undoStack[undoStack.length - 1]
    const cur: EditSnapshot = { bytes: pdfBytes, annotations, formFields }
    const newUndo = undoStack.slice(0, -1)

    // Fast path: the step only touched the overlay (same byte buffer) — no
    // document re-parse, no text re-extraction, view state untouched.
    if (prev.bytes === pdfBytes) {
      set({
        annotations: prev.annotations, formFields: prev.formFields,
        undoStack: newUndo, redoStack: trimUndoStack([...redoStack, cur]),
        isDirty: newUndo.length > 0,
        selectedAnnotationId: null, openStickyNoteId: null,
      })
      return
    }

    const { pdfDoc, numPages, pageSizes } = await buildPdfDoc(prev.bytes)
    clearTextCache()
    set({
      pdfDoc, pdfBytes: prev.bytes, numPages, pageSizes,
      annotations: prev.annotations, formFields: prev.formFields,
      undoStack: newUndo, redoStack: trimUndoStack([...redoStack, cur]),
      isDirty: newUndo.length > 0,
      currentPage: Math.min(currentPage, numPages),
      selectedAnnotationId: null, openStickyNoteId: null,
      searchMatches: [], activeMatchIndex: -1,
    })
    get().startTextIndexing(pdfDoc)
  },

  redo: async () => {
    const { redoStack, undoStack, pdfBytes, annotations, formFields, currentPage } = get()
    if (redoStack.length === 0 || !pdfBytes) return
    const next = redoStack[redoStack.length - 1]
    const cur: EditSnapshot = { bytes: pdfBytes, annotations, formFields }

    if (next.bytes === pdfBytes) {
      set({
        annotations: next.annotations, formFields: next.formFields,
        undoStack: trimUndoStack([...undoStack, cur]), redoStack: redoStack.slice(0, -1),
        isDirty: true,
        selectedAnnotationId: null, openStickyNoteId: null,
      })
      return
    }

    const { pdfDoc, numPages, pageSizes } = await buildPdfDoc(next.bytes)
    clearTextCache()
    set({
      pdfDoc, pdfBytes: next.bytes, numPages, pageSizes,
      annotations: next.annotations, formFields: next.formFields,
      undoStack: trimUndoStack([...undoStack, cur]), redoStack: redoStack.slice(0, -1),
      isDirty: true,
      currentPage: Math.min(currentPage, numPages),
      selectedAnnotationId: null, openStickyNoteId: null,
      searchMatches: [], activeMatchIndex: -1,
    })
    get().startTextIndexing(pdfDoc)
  },

  save: async () => {
    // Re-entrancy guard: if a save is already running, await it instead of
    // launching a second concurrent write to the same file.
    if (saveInFlight) return saveInFlight
    saveInFlight = (async () => {
      const { filePath, pdfBytes, annotations, formFields, encryptionSettings, bookmarks, getBakedBytes } = get()
      if (!pdfBytes || !filePath) return
      let baked = await getBakedBytes()
      baked = new Uint8Array(await window.electronAPI.mupdfWriteOutline(baked.buffer as ArrayBuffer, bookmarks))
      if (encryptionSettings) {
        baked = new Uint8Array(await window.electronAPI.mupdfEncrypt(baked.buffer as ArrayBuffer, encryptionSettings))
      }
      await window.electronAPI.writeFile(filePath, baked.slice(0).buffer)
      const hasNew = formFields.some(f => f.isNew)
      // placed-image and text-edit bake into the content stream — reload so they
      // render natively (and aren't re-baked on the next save) instead of staying
      // as overlay annotations on top of the original bytes.
      const hasBakedContent = annotations.some(a => a.type === 'placed-image' || a.type === 'text-edit')
      if (hasNew || hasBakedContent) await get().reloadWithBytes(baked)
      else set({ isDirty: false })
    })()
    try { await saveInFlight } finally { saveInFlight = null }
  },

  saveAs: async () => {
    const { fileName, pdfBytes, annotations, formFields, encryptionSettings, bookmarks, getBakedBytes } = get()
    if (!pdfBytes) return
    const newPath = await window.electronAPI.saveFileDialog(fileName || 'document.pdf')
    if (!newPath) return
    let baked = await getBakedBytes()
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
    if (!query.trim()) {
      set({ searchQuery: query, searchMatches: [], activeMatchIndex: -1, searchRegexError: '' })
      return
    }
    const { numPages, scrollToPage, searchCaseSensitive, searchWholeWord, searchRegex } = get()
    const matches: SearchMatch[] = []
    let regexError = ''

    if (searchRegex) {
      const flags = searchCaseSensitive ? 'g' : 'gi'
      let re: RegExp | null = null
      try { re = new RegExp(query, flags + 'u') } catch {
        try { re = new RegExp(query, flags) } catch (e) {
          regexError = e instanceof Error ? e.message : 'Invalid pattern'
        }
      }
      if (re) {
        for (let p = 1; p <= numPages; p++) {
          const cache = textCache.get(p)
          if (!cache) continue
          re.lastIndex = 0
          let m: RegExpExecArray | null
          while ((m = re.exec(cache.text)) !== null) {
            if (m[0].length === 0) { re.lastIndex++; continue }
            if (!searchWholeWord || isWholeWordMatch(cache.text, m.index, m[0].length))
              matches.push({ pageNum: p, matchStart: m.index, matchLen: m[0].length })
          }
        }
      }
    } else if (searchCaseSensitive) {
      for (let p = 1; p <= numPages; p++) {
        const cache = textCache.get(p)
        if (!cache) continue
        let pos = 0
        while (true) {
          const idx = cache.text.indexOf(query, pos)
          if (idx === -1) break
          if (!searchWholeWord || isWholeWordMatch(cache.text, idx, query.length))
            matches.push({ pageNum: p, matchStart: idx, matchLen: query.length })
          pos = idx + 1
        }
      }
    } else {
      // Normalized search: case-folded, accent-insensitive, ligature-aware.
      // Matches are found in normalized space and mapped back to raw offsets.
      const qNorm = normalizeForSearch(query).norm
      if (qNorm) {
        for (let p = 1; p <= numPages; p++) {
          const cache = textCache.get(p)
          if (!cache) continue
          let pos = 0
          while (true) {
            const idx = cache.norm.indexOf(qNorm, pos)
            if (idx === -1) break
            const rawStart = cache.normToRaw[idx]
            const rawEnd = cache.normToRaw[idx + qNorm.length - 1] + 1
            if (!searchWholeWord || isWholeWordMatch(cache.text, rawStart, rawEnd - rawStart))
              matches.push({ pageNum: p, matchStart: rawStart, matchLen: rawEnd - rawStart })
            pos = idx + 1
          }
        }
      }
    }

    const firstPageNum = matches[0]?.pageNum
    set({
      searchQuery: query, searchMatches: matches,
      activeMatchIndex: matches.length > 0 ? 0 : -1,
      searchRegexError: regexError,
    })
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
  addAnnotation: (ann) => {
    get().pushUndo()
    set(s => ({ annotations: [...s.annotations, ann], isDirty: true }))
  },
  // Note: updateAnnotation does NOT snapshot undo — it fires per-keystroke and
  // per-mouse-move during text entry and dragging. Callers that begin a discrete
  // interaction (a move/resize drag) call pushUndo() once up front instead.
  updateAnnotation: (id, patch) => set(s => ({
    annotations: s.annotations.map(a => a.id === id ? { ...a, ...patch } as Annotation : a),
    isDirty: true,
  })),
  deleteAnnotation: (id) => {
    get().pushUndo()
    set(s => ({
      annotations: s.annotations.filter(a => a.id !== id),
      selectedAnnotationId: s.selectedAnnotationId === id ? null : s.selectedAnnotationId,
      isDirty: true,
    }))
  },
  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),

  copyAnnotation: (id) => {
    const a = get().annotations.find(x => x.id === id)
    if (a) set({ annotationClipboard: JSON.parse(JSON.stringify(a)) })
  },
  pasteAnnotation: (pageNum) => {
    const clip = get().annotationClipboard
    if (!clip) return
    const clone = JSON.parse(JSON.stringify(clip)) as Annotation
    clone.id = newId()
    clone.createdAt = Date.now()
    clone.pageNum = pageNum ?? clip.pageNum
    shiftAnnotation(clone, 14, -14) // small offset so the paste is visibly distinct
    get().pushUndo()
    set(s => ({ annotations: [...s.annotations, clone], selectedAnnotationId: clone.id, isDirty: true }))
  },
  duplicateAnnotation: (id) => {
    const a = get().annotations.find(x => x.id === id)
    if (!a) return
    const clone = JSON.parse(JSON.stringify(a)) as Annotation
    clone.id = newId()
    clone.createdAt = Date.now()
    shiftAnnotation(clone, 14, -14)
    get().pushUndo()
    set(s => ({ annotations: [...s.annotations, clone], selectedAnnotationId: clone.id, isDirty: true }))
  },
  bringAnnotationToFront: (id) => {
    const a = get().annotations.find(x => x.id === id)
    if (!a) return
    get().pushUndo()
    set(s => ({ annotations: [...s.annotations.filter(x => x.id !== id), a], isDirty: true }))
  },
  sendAnnotationToBack: (id) => {
    const a = get().annotations.find(x => x.id === id)
    if (!a) return
    get().pushUndo()
    set(s => ({ annotations: [a, ...s.annotations.filter(x => x.id !== id)], isDirty: true }))
  },

  setToolColor: (c) => set({ toolColor: c }),
  setToolOpacity: (o) => set({ toolOpacity: o }),
  setToolLineWidth: (w) => set({ toolLineWidth: w }),
  setToolFontSize: (s) => set({ toolFontSize: s }),
  setToolFont: (f) => set({ toolFont: f }),
  setStampName: (n) => set({ stampName: n }),
  setCustomStampDataUrl: (url) => set({ customStampDataUrl: url }),
  toggleAnnotationsPanel: () => set(s => ({ annotationsPanelOpen: !s.annotationsPanelOpen })),
  setOpenStickyNote: (id) => set({ openStickyNoteId: id }),
  setRedactBlurred: (v) => set({ redactBlurred: v }),

  // ── Security actions ──────────────────────────────────────────────────────
  setEncryptionSettings: (s) => set({ encryptionSettings: s, isDirty: true }),
  applyRedactions: async () => {
    const { annotations, formFields, pdfBytes, applyEdit } = get()
    if (!pdfBytes) return
    const redactAnns = annotations.filter(a => a.type === 'redact') as import('../types/annotations').RedactAnn[]
    if (redactAnns.length === 0) return
    const blurredAnns = redactAnns.filter(a => a.blurred)

    // Bake every overlay EXCEPT the redaction marks themselves — MuPDF applies
    // those for real below. Baking keeps the other annotations alive across the
    // applyEdit() reload, which re-imports annotations from the new bytes.
    let baked = pdfBytes
    const keep = annotations.filter(a => a.type !== 'redact')
    if (keep.length > 0) baked = await writeAnnotationsToPdf(baked, keep)
    if (formFields.length > 0) baked = await writeFormToBytes(baked, formFields)

    // Capture blurred previews BEFORE the content underneath is destroyed.
    // The blur is cosmetic only: the actual content is removed by MuPDF just
    // like a solid redaction, so nothing recoverable remains in the file.
    const blurOverlays: import('../types/annotations').PlacedImageAnn[] = []
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
          await pdfPage.render({ canvas, viewport }).promise
          pageCache.set(a.pageNum, { canvas, pageH: viewport.height / BLUR_SCALE, scale: BLUR_SCALE })
        }
        const { canvas, pageH, scale } = pageCache.get(a.pageNum)!

        const x1 = Math.min(a.x1, a.x2); const x2 = Math.max(a.x1, a.x2)
        const y1 = Math.min(a.y1, a.y2); const y2 = Math.max(a.y1, a.y2)
        const sx = Math.round(x1 * scale)
        const sy = Math.round((pageH - y2) * scale)
        const cw = Math.round((x2 - x1) * scale)
        const ch = Math.round((y2 - y1) * scale)
        if (cw < 2 || ch < 2) continue

        const cropCanvas = document.createElement('canvas')
        cropCanvas.width = cw; cropCanvas.height = ch
        const ctx = cropCanvas.getContext('2d')!
        ctx.drawImage(canvas, sx, sy, cw, ch, 0, 0, cw, ch)

        const blurCanvas = document.createElement('canvas')
        blurCanvas.width = cw; blurCanvas.height = ch
        const bctx = blurCanvas.getContext('2d')!
        bctx.filter = 'blur(10px)'
        bctx.drawImage(cropCanvas, 0, 0)

        blurOverlays.push({
          id: `blurred-${a.id}`, pageNum: a.pageNum, type: 'placed-image',
          x: x1, y: y1, width: x2 - x1, height: y2 - y1,
          dataUrl: blurCanvas.toDataURL('image/png'),
          color: '#000000', opacity: 1, createdAt: Date.now(),
        } as import('../types/annotations').PlacedImageAnn)
      }
      pdfDoc.loadingTask.destroy().catch(() => {})
    }

    // Permanently remove the content under EVERY marked area (solid and
    // blurred) via MuPDF — solid marks get a black box, blurred ones don't.
    const areas = redactAnns.map(a => ({
      pageNum: a.pageNum, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, blurred: !!a.blurred,
    }))
    const result = await window.electronAPI.mupdfApplyRedactions(baked.slice().buffer as ArrayBuffer, areas)
    await applyEdit(new Uint8Array(result))
    if (blurOverlays.length > 0) {
      set(s => ({ annotations: [...s.annotations, ...blurOverlays], isDirty: true }))
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
    get().startTextIndexing(pdfDoc)
  },

  // ── Document lifecycle ────────────────────────────────────────────────────────
  closePdf: () => {
    clearTextCache()
    clearAllSearchRanges()
    textIndexGen++  // cancel any in-flight background text indexing
    _ocgConfig = null
    set({
      pdfDoc: null, pdfBytes: null, numPages: 0, filePath: '', fileName: '',
      pageSizes: [], isDirty: false, undoStack: [], redoStack: [],
      selectedPages: new Set(), currentPage: 1, navBack: [], navForward: [],
      searchOpen: false, searchQuery: '', searchMatches: [], activeMatchIndex: -1,
      searchRegexError: '', searchIndexing: false,
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
