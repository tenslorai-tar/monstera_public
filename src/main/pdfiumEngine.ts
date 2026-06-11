/**
 * PDFium engine — true in-place PDF editing via FFI (koffi).
 *
 * MuPDF/pdf-lib/PDF.js cannot edit existing text objects in a page's content
 * stream. PDFium can: FPDFText_SetText replaces a text object's string while
 * reusing its original embedded font, size and position. This module wraps the
 * subset of the PDFium C API needed for in-place text editing.
 */
import path from 'path'
import fs from 'fs'
import koffi from 'koffi'
import fontkit from '@pdf-lib/fontkit'

const PDFOBJ_TEXT = 1
const PDFOBJ_FORM = 5  // FPDF_PAGEOBJ_FORM — a nested content group (Form XObject)

export function getPdfiumPath(): string {
  // koffi.load() calls the OS loader (LoadLibrary/dlopen) directly. Unlike
  // Electron's patched fs and child_process, that loader is NOT asar-aware, so it
  // CANNOT load a DLL from a path inside app.asar — even though fs.existsSync
  // happily resolves that in-asar path for an unpacked file via Electron's shim.
  // We must therefore hand it a real on-disk path and never an app.asar path.
  const sep = path.sep
  const rel = path.join(__dirname, '../../assets/bin/pdfium.dll')
  const candidates = [
    // Packaged: extraResources copy — guaranteed a real file outside the archive.
    process.resourcesPath ? path.join(process.resourcesPath, 'app', 'assets', 'bin', 'pdfium.dll') : '',
    // Packaged: the asarUnpack location (real file on disk).
    rel.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`),
    // Dev: assets/bin sits beside the source, no asar involved.
    rel,
  ]
  for (const c of candidates) {
    if (!c || c.includes(`app.asar${sep}`)) continue  // never hand an in-asar path to the loader
    if (fs.existsSync(c)) return c
  }
  return ''
}

type Lib = {
  LoadMemDocument: (data: Buffer, size: number, password: string | null) => unknown
  GetPageCount: (doc: unknown) => number
  LoadPage: (doc: unknown, index: number) => unknown
  ClosePage: (page: unknown) => void
  CloseDocument: (doc: unknown) => void
  CountObjects: (page: unknown) => number
  GetObject: (page: unknown, index: number) => unknown
  FormCountObjects: (form: unknown) => number
  FormGetObject: (form: unknown, index: number) => unknown
  GetType: (obj: unknown) => number
  GetBounds: (obj: unknown, l: number[], b: number[], r: number[], t: number[]) => number
  GetFontSize: (obj: unknown, size: number[]) => number
  GetFillColor: (obj: unknown, r: number[], g: number[], b: number[], a: number[]) => number
  GetFont: (obj: unknown) => unknown
  GetFontData: (font: unknown, buffer: Buffer | null, buflen: number, out: number[]) => number
  GetBaseFontName: (font: unknown, buffer: Buffer | null, buflen: number) => number
  GetMatrix: (obj: unknown, m: Record<string, number>) => number
  TextLoadPage: (page: unknown) => unknown
  TextClosePage: (tp: unknown) => void
  GetText: (obj: unknown, tp: unknown, buf: Buffer | null, len: number) => number
  SetText: (obj: unknown, text: Buffer) => number
  RemoveObject: (page: unknown, obj: unknown) => number
  DestroyObject: (obj: unknown) => void
  InsertObject: (page: unknown, obj: unknown) => void
  CreateTextObj: (doc: unknown, font: unknown, size: number) => unknown
  LoadFontData: (doc: unknown, data: Buffer, size: number, fontType: number, cid: number) => unknown
  LoadStandardFont: (doc: unknown, name: string) => unknown
  FontClose: (font: unknown) => void
  Transform: (obj: unknown, a: number, b: number, c: number, d: number, e: number, f: number) => void
  SetFillColor: (obj: unknown, r: number, g: number, b: number, a: number) => number
  GenerateContent: (page: unknown) => number
  SaveAsCopy: (doc: unknown, fw: unknown, flags: number) => number
  WriteBlockProto: ReturnType<typeof koffi.proto>
  // Rendering
  GetPageWidth: (page: unknown) => number
  GetPageHeight: (page: unknown) => number
  BitmapCreate: (w: number, h: number, alpha: number) => unknown
  BitmapFillRect: (bmp: unknown, l: number, t: number, w: number, h: number, color: number) => number
  RenderPageBitmap: (bmp: unknown, page: unknown, sx: number, sy: number, w: number, h: number, rotate: number, flags: number) => void
  BitmapGetBuffer: (bmp: unknown) => unknown
  BitmapGetStride: (bmp: unknown) => number
  BitmapDestroy: (bmp: unknown) => void
}

let lib: Lib | null = null
let initialised = false

function load(): Lib {
  if (lib) return lib
  const dll = getPdfiumPath()
  if (!dll) throw new Error('pdfium.dll not found in assets/bin')
  const m = koffi.load(dll)
  const WriteBlockProto = koffi.proto('int WriteBlock(void* pThis, void* pData, unsigned long size)')
  koffi.struct('FPDF_FILEWRITE', { version: 'int', WriteBlock: koffi.pointer(WriteBlockProto) })
  koffi.struct('FS_MATRIX', { a: 'float', b: 'float', c: 'float', d: 'float', e: 'float', f: 'float' })
  koffi.struct('FPDF_LIBRARY_CONFIG', {
    version: 'int',
    m_pUserFontPaths: koffi.pointer(koffi.pointer('char')), // const char** — NULL-terminated dir list
    m_pIsolate: 'void *',
    m_v8EmbedderSlot: 'uint32_t',
  })
  lib = {
    LoadMemDocument: m.func('void* FPDF_LoadMemDocument(void* data, int size, const char* password)') as Lib['LoadMemDocument'],
    GetPageCount:    m.func('int FPDF_GetPageCount(void* doc)') as Lib['GetPageCount'],
    LoadPage:        m.func('void* FPDF_LoadPage(void* doc, int index)') as Lib['LoadPage'],
    ClosePage:       m.func('void FPDF_ClosePage(void* page)') as Lib['ClosePage'],
    CloseDocument:   m.func('void FPDF_CloseDocument(void* doc)') as Lib['CloseDocument'],
    CountObjects:    m.func('int FPDFPage_CountObjects(void* page)') as Lib['CountObjects'],
    GetObject:       m.func('void* FPDFPage_GetObject(void* page, int index)') as Lib['GetObject'],
    FormCountObjects: m.func('int FPDFFormObj_CountObjects(void* form)') as Lib['FormCountObjects'],
    FormGetObject:   m.func('void* FPDFFormObj_GetObject(void* form, unsigned long index)') as Lib['FormGetObject'],
    GetType:         m.func('int FPDFPageObj_GetType(void* obj)') as Lib['GetType'],
    GetBounds:       m.func('int FPDFPageObj_GetBounds(void* obj, _Out_ float* l, _Out_ float* b, _Out_ float* r, _Out_ float* t)') as Lib['GetBounds'],
    GetFontSize:     m.func('int FPDFTextObj_GetFontSize(void* obj, _Out_ float* size)') as Lib['GetFontSize'],
    GetFillColor:    m.func('int FPDFPageObj_GetFillColor(void* obj, _Out_ uint* r, _Out_ uint* g, _Out_ uint* b, _Out_ uint* a)') as Lib['GetFillColor'],
    GetFont:         m.func('void* FPDFTextObj_GetFont(void* obj)') as Lib['GetFont'],
    GetFontData:     m.func('int FPDFFont_GetFontData(void* font, void* buffer, size_t buflen, _Out_ size_t* out)') as Lib['GetFontData'],
    GetBaseFontName: m.func('unsigned long FPDFFont_GetBaseFontName(void* font, _Out_ char* buffer, unsigned long buflen)') as Lib['GetBaseFontName'],
    GetMatrix:       m.func('int FPDFPageObj_GetMatrix(void* obj, _Out_ FS_MATRIX* matrix)') as Lib['GetMatrix'],
    TextLoadPage:    m.func('void* FPDFText_LoadPage(void* page)') as Lib['TextLoadPage'],
    TextClosePage:   m.func('void FPDFText_ClosePage(void* tp)') as Lib['TextClosePage'],
    GetText:         m.func('unsigned long FPDFTextObj_GetText(void* obj, void* tp, _Out_ void* buf, unsigned long len)') as Lib['GetText'],
    SetText:         m.func('int FPDFText_SetText(void* obj, const char16_t* text)') as Lib['SetText'],
    RemoveObject:    m.func('int FPDFPage_RemoveObject(void* page, void* obj)') as Lib['RemoveObject'],
    DestroyObject:   m.func('void FPDFPageObj_Destroy(void* obj)') as Lib['DestroyObject'],
    InsertObject:    m.func('void FPDFPage_InsertObject(void* page, void* page_object)') as Lib['InsertObject'],
    CreateTextObj:   m.func('void* FPDFPageObj_CreateTextObj(void* document, void* font, float font_size)') as Lib['CreateTextObj'],
    LoadFontData:    m.func('void* FPDFText_LoadFont(void* document, const uint8_t* data, uint32_t size, int font_type, int cid)') as Lib['LoadFontData'],
    LoadStandardFont: m.func('void* FPDFText_LoadStandardFont(void* document, const char* font)') as Lib['LoadStandardFont'],
    FontClose:       m.func('void FPDFFont_Close(void* font)') as Lib['FontClose'],
    Transform:       m.func('void FPDFPageObj_Transform(void* obj, double a, double b, double c, double d, double e, double f)') as Lib['Transform'],
    SetFillColor:    m.func('int FPDFPageObj_SetFillColor(void* obj, uint r, uint g, uint b, uint a)') as Lib['SetFillColor'],
    GenerateContent: m.func('int FPDFPage_GenerateContent(void* page)') as Lib['GenerateContent'],
    SaveAsCopy:      m.func('int FPDF_SaveAsCopy(void* doc, FPDF_FILEWRITE* fw, unsigned long flags)') as Lib['SaveAsCopy'],
    GetPageWidth:    m.func('double FPDF_GetPageWidth(void* page)') as Lib['GetPageWidth'],
    GetPageHeight:   m.func('double FPDF_GetPageHeight(void* page)') as Lib['GetPageHeight'],
    BitmapCreate:    m.func('void* FPDFBitmap_Create(int w, int h, int alpha)') as Lib['BitmapCreate'],
    BitmapFillRect:  m.func('int FPDFBitmap_FillRect(void* bmp, int l, int t, int w, int h, uint32_t color)') as Lib['BitmapFillRect'],
    RenderPageBitmap: m.func('void FPDF_RenderPageBitmap(void* bmp, void* page, int sx, int sy, int w, int h, int rotate, int flags)') as Lib['RenderPageBitmap'],
    BitmapGetBuffer: m.func('void* FPDFBitmap_GetBuffer(void* bmp)') as Lib['BitmapGetBuffer'],
    BitmapGetStride: m.func('int FPDFBitmap_GetStride(void* bmp)') as Lib['BitmapGetStride'],
    BitmapDestroy:   m.func('void FPDFBitmap_Destroy(void* bmp)') as Lib['BitmapDestroy'],
    WriteBlockProto,
  }
  if (!initialised) { initPdfium(m); initialised = true }
  return lib
}

// Initialise PDFium. We prefer FPDF_InitLibraryWithConfig with the OS font
// directory in m_pUserFontPaths so PDFium has the full set of installed fonts to
// substitute from for NON-embedded fonts. Embedded fonts are reused directly and
// are unaffected either way. If building/calling the config path fails for any
// reason, we fall back to the plain FPDF_InitLibrary so initialisation — and thus
// the whole engine — can never regress. (The config call, if it throws, throws
// during koffi argument marshalling, i.e. BEFORE any native init runs, so the
// fallback can't double-initialise.)
function initPdfium(m: ReturnType<typeof koffi.load>): void {
  try {
    const fontDir = process.platform === 'win32'
      ? path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
      : ''
    if (fontDir && fs.existsSync(fontDir)) {
      const InitWithConfig = m.func('void FPDF_InitLibraryWithConfig(FPDF_LIBRARY_CONFIG* config)') as (cfg: unknown) => void
      InitWithConfig({
        version: 2,
        m_pUserFontPaths: [fontDir, null], // NULL-terminated
        m_pIsolate: null,
        m_v8EmbedderSlot: 0,
      })
      return
    }
  } catch { /* fall back to the plain init below */ }
  const FPDF_InitLibrary = m.func('void FPDF_InitLibrary()') as () => void
  FPDF_InitLibrary()
}

export function isAvailable(): boolean {
  if (!getPdfiumPath()) return false
  try { load(); return true } catch { return false }
}

export interface EditRect { x1: number; y1: number; x2: number; y2: number }

interface Match { obj: unknown; l: number; b: number; t: number; cur: string; fontSize: number; nested: boolean; pm: Mat }

// ── Nested-object traversal ──────────────────────────────────────────────────
// PDFium's editor APIs (CountObjects/GetObject) only enumerate TOP-LEVEL page
// objects. Text wrapped in a Form XObject — how Office/InDesign routinely emit
// tables — is therefore invisible to click-to-edit, so the tool silently drops to
// the cover-and-replace fallback (and a generic font). Descending into form
// groups, with each glyph box mapped back into page space, lets that text be
// edited truly in place with its own font preserved.

type Mat = [number, number, number, number, number, number]
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

function applyPt(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

// Compose so a point in the child's space maps to page space: page = parent(form(p)).
function composeMat(parent: Mat, form: Mat): Mat {
  return [
    parent[0] * form[0] + parent[2] * form[1],
    parent[1] * form[0] + parent[3] * form[1],
    parent[0] * form[2] + parent[2] * form[3],
    parent[1] * form[2] + parent[3] * form[3],
    parent[0] * form[4] + parent[2] * form[5] + parent[4],
    parent[1] * form[4] + parent[3] * form[5] + parent[5],
  ]
}

// nested = true when the object lives inside a Form XObject. pm is the accumulated
// page-space transform of its container, used to map the glyph baseline to page
// space (PDFium can find — but not save edits to — text inside a form, so nested
// hits are handled by cover-and-replace in the document's real font).
interface TextNode { obj: unknown; l: number; b: number; r: number; t: number; nested: boolean; pm: Mat }

// Gather every text object on a page, descending into Form XObjects, with each
// object's bounds mapped into PAGE space (top-level text uses the identity matrix,
// so it's unchanged from the original flat scan).
function collectTextNodes(L: Lib, container: unknown, isPage: boolean, parent: Mat, out: TextNode[], depth = 0): void {
  if (depth > 12) return // guard against pathological nesting
  const count = isPage ? L.CountObjects(container) : L.FormCountObjects(container)
  for (let i = 0; i < count; i++) {
    const obj = isPage ? L.GetObject(container, i) : L.FormGetObject(container, i)
    const type = L.GetType(obj)
    if (type === PDFOBJ_TEXT) {
      const l = [0], b = [0], r = [0], t = [0]
      if (!L.GetBounds(obj, l, b, r, t)) continue
      const c1 = applyPt(parent, l[0], b[0]), c2 = applyPt(parent, r[0], b[0])
      const c3 = applyPt(parent, r[0], t[0]), c4 = applyPt(parent, l[0], t[0])
      out.push({
        obj,
        l: Math.min(c1[0], c2[0], c3[0], c4[0]), r: Math.max(c1[0], c2[0], c3[0], c4[0]),
        b: Math.min(c1[1], c2[1], c3[1], c4[1]), t: Math.max(c1[1], c2[1], c3[1], c4[1]),
        nested: depth > 0, pm: parent,
      })
    } else if (type === PDFOBJ_FORM) {
      const fm = readMatrix(L, obj) as Mat
      collectTextNodes(L, obj, false, composeMat(parent, fm), out, depth + 1)
    }
  }
}

// Text objects intersecting `rect`, ordered in reading order. Shared by editing
// and prefill so what the user sees is exactly what gets replaced.
function findMatches(L: Lib, page: unknown, tp: unknown, rect: EditRect): Match[] {
  const minX = Math.min(rect.x1, rect.x2), maxX = Math.max(rect.x1, rect.x2)
  const minY = Math.min(rect.y1, rect.y2), maxY = Math.max(rect.y1, rect.y2)
  const nodes: TextNode[] = []
  collectTextNodes(L, page, true, IDENTITY, nodes)
  const matches: Match[] = []
  for (const nd of nodes) {
    const ox = Math.min(nd.r, maxX) - Math.max(nd.l, minX)
    const oy = Math.min(nd.t, maxY) - Math.max(nd.b, minY)
    if (ox > 0.5 && oy > (nd.t - nd.b) * 0.25) {
      const len = L.GetText(nd.obj, tp, null, 0)
      const buf = Buffer.alloc(len)
      L.GetText(nd.obj, tp, buf, len)
      const fs = [0]; L.GetFontSize(nd.obj, fs)
      const cur = buf.toString('utf16le').replace(/ /g, '').replace(/ +$/, '')
      matches.push({ obj: nd.obj, l: nd.l, b: nd.b, t: nd.t, cur, fontSize: fs[0], nested: nd.nested, pm: nd.pm })
    }
  }
  matches.sort((a, c) => (Math.abs(a.b - c.b) > 3 ? c.t - a.t : a.l - c.l))
  return matches
}

export interface RegionTextHit {
  found: boolean
  text: string
  fontSize: number
  color: string
  matrix: number[]
  fontData: Buffer
  fontLoadable: boolean
  nested: boolean
  fontName: string
}

/**
 * Read the exact text + font size PDFium will replace inside `rect`, plus the
 * original font program / fill colour / baseline of the first object so the
 * cover-and-replace overlay can redraw in the document's own font.
 */
export function getTextInRegion(
  bytes: Buffer, pageIndex: number, rect: EditRect,
): RegionTextHit {
  const L = load()
  const none: RegionTextHit = { found: false, text: '', fontSize: 0, color: '#000000', matrix: [1, 0, 0, 1, 0, 0], fontData: Buffer.alloc(0), fontLoadable: false, nested: false, fontName: '' }
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  try {
    const page = L.LoadPage(doc, pageIndex)
    const tp = L.TextLoadPage(page)
    const matches = findMatches(L, page, tp, rect)
    if (matches.length === 0) { L.TextClosePage(tp); L.ClosePage(page); return none }
    const first = matches[0].obj
    const font = extractFont(L, first)
    // Compose the object's own matrix with its container transform so the baseline
    // (matrix[4],[5]) is in PAGE space even for text nested in a form group.
    const matrix = composeMat(matches[0].pm, readMatrix(L, first) as Mat)
    const rr = [0], gg = [0], bb = [0], aa = [0]; L.GetFillColor(first, rr, gg, bb, aa)
    const hex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
    L.TextClosePage(tp)
    L.ClosePage(page)
    return {
      found: true,
      text: matches.map(m => m.cur).join(' ').replace(/\s+/g, ' ').trim(),
      fontSize: matches[0].fontSize,
      color: `#${hex(rr[0])}${hex(gg[0])}${hex(bb[0])}`,
      matrix,
      fontData: font.data, fontLoadable: font.loadable,
      nested: matches[0].nested,
      fontName: font.name,
    }
  } finally {
    L.CloseDocument(doc)
  }
}

export interface TextObjectHit {
  found: boolean
  text: string
  fontSize: number
  color: string
  x1: number; y1: number; x2: number; y2: number
  // Text-space → page-space matrix [a,b,c,d,e,f]; (e,f) is the glyph-origin
  // baseline, which the cover-and-replace overlay uses to place the new text
  // exactly where the original sat (the bbox alone can't give the baseline).
  matrix: number[]
  fontData: Buffer
  fontLoadable: boolean
  // True when the text lives inside a Form XObject. PDFium can't save edits made
  // there, so the renderer redraws via cover-and-replace using fontData/matrix
  // (the document's real font + page-space baseline) instead of true in-place.
  nested: boolean
  fontName: string  // PostScript base name, e.g. "Aptos Narrow,Bold"
}

const FONT_CAP = 4 * 1024 * 1024

// Read a page object's transform matrix; identity if PDFium can't supply one.
function readMatrix(L: Lib, obj: unknown): number[] {
  const m: Record<string, number> = {}
  try {
    if (L.GetMatrix(obj, m)) return [m.a ?? 1, m.b ?? 0, m.c ?? 0, m.d ?? 1, m.e ?? 0, m.f ?? 0]
  } catch { /* fall through to identity */ }
  return [1, 0, 0, 1, 0, 0]
}

// Extract the embedded font program for a text object so the caret editor can
// render in the exact page font. Only sfnt/woff fonts are browser-loadable.
// Also returns the PostScript base name (e.g. "Aptos Narrow,Bold") so the renderer
// can substitute an installed system font when the embedded one can't be reused.
function extractFont(L: Lib, obj: unknown): { data: Buffer; loadable: boolean; name: string } {
  try {
    const font = L.GetFont(obj)
    if (!font) return { data: Buffer.alloc(0), loadable: false, name: '' }
    let name = ''
    try {
      const nb = Buffer.alloc(128)
      const nl = L.GetBaseFontName(font, nb, 128)
      if (nl > 0) name = nb.toString('utf8', 0, Math.min(nb.length, Math.max(0, nl - 1))).replace(/\0+$/, '')
    } catch { /* name optional */ }
    const sz = [0]
    L.GetFontData(font, null, 0, sz)
    const size = sz[0]
    if (!size || size > FONT_CAP) return { data: Buffer.alloc(0), loadable: false, name }
    const buf = Buffer.alloc(size)
    const got = [0]
    if (!L.GetFontData(font, buf, size, got) || got[0] < 4) return { data: Buffer.alloc(0), loadable: false, name }
    const magic = buf.readUInt32BE(0)
    const loadable = magic === 0x00010000 || magic === 0x4f54544f /* OTTO */
      || magic === 0x74727565 /* true */ || magic === 0x74746366 /* ttcf */
      || magic === 0x774f4646 /* wOFF */ || magic === 0x774f4632 /* wOF2 */
    return { data: buf, loadable, name }
  } catch {
    return { data: Buffer.alloc(0), loadable: false, name: '' }
  }
}

/**
 * The single text object whose bounds contain (or are nearest to) the point
 * (x, y) in PDF points — for click-to-edit. Returns its full text, font size,
 * fill colour and bounds so the editor can sit exactly over the real text.
 */
export function getTextObjectAt(
  bytes: Buffer, pageIndex: number, x: number, y: number,
): TextObjectHit {
  const L = load()
  const none: TextObjectHit = { found: false, text: '', fontSize: 0, color: '#000000', x1: 0, y1: 0, x2: 0, y2: 0, matrix: [1, 0, 0, 1, 0, 0], fontData: Buffer.alloc(0), fontLoadable: false, nested: false, fontName: '' }
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) return none
  try {
    const page = L.LoadPage(doc, pageIndex)
    const tp = L.TextLoadPage(page)
    const nodes: TextNode[] = []
    collectTextNodes(L, page, true, IDENTITY, nodes)
    let best: unknown = null
    let bestNode: TextNode | null = null
    let bb = [0, 0, 0, 0]
    let bestArea = Infinity
    for (const nd of nodes) {
      // small tolerance so clicks just outside the glyph box still land
      if (x >= nd.l - 2 && x <= nd.r + 2 && y >= nd.b - 1 && y <= nd.t + 1) {
        const area = (nd.r - nd.l) * (nd.t - nd.b)
        if (area < bestArea) { best = nd.obj; bestNode = nd; bb = [nd.l, nd.b, nd.r, nd.t]; bestArea = area }
      }
    }
    if (!best || !bestNode) { L.TextClosePage(tp); L.ClosePage(page); return none }
    const len = L.GetText(best, tp, null, 0)
    const buf = Buffer.alloc(len)
    L.GetText(best, tp, buf, len)
    const fs = [0]; L.GetFontSize(best, fs)
    const rr = [0], gg = [0], bbl = [0], aa = [0]; L.GetFillColor(best, rr, gg, bbl, aa)
    const hex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
    const font = extractFont(L, best)
    const matrix = composeMat(bestNode.pm, readMatrix(L, best) as Mat)
    L.TextClosePage(tp)
    L.ClosePage(page)
    return {
      found: true,
      text: buf.toString('utf16le').replace(/ /g, '').replace(/ +$/, ''),
      fontSize: fs[0],
      color: `#${hex(rr[0])}${hex(gg[0])}${hex(bbl[0])}`,
      x1: bb[0], y1: bb[1], x2: bb[2], y2: bb[3],
      matrix,
      fontData: font.data, fontLoadable: font.loadable,
      nested: bestNode.nested,
      fontName: font.name,
    }
  } finally {
    L.CloseDocument(doc)
  }
}

/**
 * Replace the text of the text object(s) inside `rect` (PDF points, y-up) on
 * page `pageIndex` with `newText`, keeping the original font/size. Returns the
 * edited PDF bytes. Throws if no editable text object overlaps the region.
 */
export function editTextInRegion(
  bytes: Buffer, pageIndex: number, rect: EditRect, newText: string,
): Buffer {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  try {
    const page = L.LoadPage(doc, pageIndex)
    if (!page) throw new Error('PDFium could not load the page')
    const tp = L.TextLoadPage(page)
    const matches = findMatches(L, page, tp, rect)
    if (matches.length === 0) throw new Error('No editable text found in the selected area')
    const wide = Buffer.from(newText + '\u0000', 'utf16le')
    if (!L.SetText(matches[0].obj, wide)) throw new Error('PDFium failed to set text')
    for (let i = 1; i < matches.length; i++) {
      if (L.RemoveObject(page, matches[i].obj)) L.DestroyObject(matches[i].obj)
    }
    L.GenerateContent(page)

    const chunks: Buffer[] = []
    const cb = koffi.register(
      (_pThis: unknown, pData: unknown, size: number) => {
        chunks.push(Buffer.from(koffi.decode(pData, koffi.array('uint8_t', size)) as number[]))
        return 1
      },
      koffi.pointer(L.WriteBlockProto),
    )
    const fw = { version: 1, WriteBlock: cb }
    const ok = L.SaveAsCopy(doc, fw, 1) // incremental: keep original objects/fonts intact
    koffi.unregister(cb)
    L.TextClosePage(tp)
    L.ClosePage(page)
    if (!ok) throw new Error('PDFium failed to save the document')
    return Buffer.concat(chunks)
  } finally {
    L.CloseDocument(doc)
  }
}

/**
 * Edit the single text object at point (x, y) in place, keeping its original
 * font/size/colour (FPDFText_SetText reuses the object's own font). Unlike
 * editTextInRegion this never removes neighbouring objects — it's the click-to-
 * edit path, where only the clicked run should change. Incremental save keeps
 * every other object (and its embedded font) byte-for-byte intact.
 */
export function editTextObjectAt(
  bytes: Buffer, pageIndex: number, x: number, y: number, newText: string,
): Buffer {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  try {
    const page = L.LoadPage(doc, pageIndex)
    if (!page) throw new Error('PDFium could not load the page')
    const nodes: TextNode[] = []
    collectTextNodes(L, page, true, IDENTITY, nodes)
    let best: unknown = null
    let bestArea = Infinity
    for (const nd of nodes) {
      if (x >= nd.l - 2 && x <= nd.r + 2 && y >= nd.b - 1 && y <= nd.t + 1) {
        const area = (nd.r - nd.l) * (nd.t - nd.b)
        if (area < bestArea) { best = nd.obj; bestArea = area }
      }
    }
    if (!best) throw new Error('No editable text found at that point')
    if (!L.SetText(best, Buffer.from(newText + ' ', 'utf16le'))) throw new Error('PDFium failed to set text')
    L.GenerateContent(page)
    const out = saveDoc(L, doc)
    L.ClosePage(page)
    return out
  } finally {
    L.CloseDocument(doc)
  }
}

/** Read every text run on a page (text + PDF-point bounds), for diagnostics/UX. */
export function getPageTextRuns(
  bytes: Buffer, pageIndex: number,
): Array<{ text: string; x1: number; y1: number; x2: number; y2: number }> {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  try {
    const page = L.LoadPage(doc, pageIndex)
    const tp = L.TextLoadPage(page)
    const n = L.CountObjects(page)
    const runs: Array<{ text: string; x1: number; y1: number; x2: number; y2: number }> = []
    for (let i = 0; i < n; i++) {
      const obj = L.GetObject(page, i)
      if (L.GetType(obj) !== PDFOBJ_TEXT) continue
      const l = [0], b = [0], r = [0], t = [0]
      L.GetBounds(obj, l, b, r, t)
      const len = L.GetText(obj, tp, null, 0)
      const buf = Buffer.alloc(len)
      L.GetText(obj, tp, buf, len)
      runs.push({ text: buf.toString('utf16le').replace(/ +$/, ''), x1: l[0], y1: b[0], x2: r[0], y2: t[0] })
    }
    L.TextClosePage(tp)
    L.ClosePage(page)
    return runs
  } finally {
    L.CloseDocument(doc)
  }
}

// Bounds (PDF points, y-up) of every editable text object on a page, INCLUDING
// text nested inside form XObjects (composed into page space) — so the Edit Text
// tool can outline everything it can click, the way PDF-XChange does.
export function getAllTextBoxes(
  bytes: Buffer, pageIndex: number,
): Array<{ x1: number; y1: number; x2: number; y2: number; nested: boolean }> {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) return []
  try {
    const page = L.LoadPage(doc, pageIndex)
    const nodes: TextNode[] = []
    collectTextNodes(L, page, true, IDENTITY, nodes)
    const boxes = nodes
      .filter(nd => nd.r - nd.l > 0.5 && nd.t - nd.b > 0.5)
      .map(nd => ({ x1: nd.l, y1: nd.b, x2: nd.r, y2: nd.t, nested: nd.nested }))
    L.ClosePage(page)
    return boxes
  } finally {
    L.CloseDocument(doc)
  }
}

/**
 * Render page `pageIndex` to an RGBA bitmap at `scale` (CSS px = pt * scale),
 * matching PDF.js geometry. Returns tightly-packed RGBA so the renderer can
 * blit it with putImageData. PDFium's rasteriser is higher fidelity than
 * PDF.js on complex fonts/vector content.
 */
function rasterise(L: Lib, page: unknown, scale: number): { data: Buffer; width: number; height: number } {
  const width = Math.max(1, Math.round(L.GetPageWidth(page) * scale))
  const height = Math.max(1, Math.round(L.GetPageHeight(page) * scale))
  const bmp = L.BitmapCreate(width, height, 1)
  L.BitmapFillRect(bmp, 0, 0, width, height, 0xFFFFFFFF) // opaque white background
  // flags 0: render page content only (annotations are drawn by our overlay)
  L.RenderPageBitmap(bmp, page, 0, 0, width, height, 0, 0)
  const stride = L.BitmapGetStride(bmp)
  const ptr = L.BitmapGetBuffer(bmp)
  const raw = Buffer.from(koffi.decode(ptr, koffi.array('uint8_t', height * stride)) as number[])
  // PDFium gives BGRA; convert to tight RGBA rows for ImageData.
  const out = Buffer.allocUnsafe(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srow = y * stride, drow = y * width * 4
    for (let x = 0; x < width; x++) {
      const s = srow + x * 4, d = drow + x * 4
      out[d] = raw[s + 2]; out[d + 1] = raw[s + 1]; out[d + 2] = raw[s]; out[d + 3] = raw[s + 3]
    }
  }
  L.BitmapDestroy(bmp)
  return { data: out, width, height }
}

export function renderPage(
  bytes: Buffer, pageIndex: number, scale: number,
): { data: Buffer; width: number; height: number } {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  try {
    const page = L.LoadPage(doc, pageIndex)
    if (!page) throw new Error('PDFium could not load the page')
    const r = rasterise(L, page, scale)
    L.ClosePage(page)
    return r
  } finally {
    L.CloseDocument(doc)
  }
}

// ── Render session ───────────────────────────────────────────────────────────
// A single open document kept alive across renders so HD mode doesn't re-parse
// the whole PDF for every page. Keyed by a content token derived from the bytes,
// so a token match provably means identical content (no stale-render bug).
let session: { token: string; doc: unknown; bytesRef: Buffer } | null = null

function closeSessionDoc(): void {
  if (session) {
    try { load().CloseDocument(session.doc) } catch { /* already gone */ }
    session = null
  }
}

export function ensureSession(token: string, bytes: Buffer): boolean {
  const L = load()
  if (session && session.token === token) return true
  closeSessionDoc()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) return false
  // hold a reference to the buffer: PDFium reads it for the doc's lifetime
  session = { token, doc, bytesRef: bytes }
  return true
}

export function closeSession(): void {
  closeSessionDoc()
}

export function renderInSession(
  token: string, pageIndex: number, scale: number,
): { stale: boolean; data?: Buffer; width: number; height: number } {
  const L = load()
  if (!session || session.token !== token) return { stale: true, width: 0, height: 0 }
  const page = L.LoadPage(session.doc, pageIndex)
  if (!page) return { stale: true, width: 0, height: 0 }
  try {
    const r = rasterise(L, page, scale)
    return { stale: false, ...r }
  } finally {
    L.ClosePage(page)
  }
}

// ── Object editing ─────────────────────────────────────────────────────────
// Select, move, scale, recolour and delete ANY existing page object (text,
// image, vector path) — the "edit objects" capability PDF.js/pdf-lib can't do.

function saveDoc(L: Lib, doc: unknown): Buffer {
  const chunks: Buffer[] = []
  const cb = koffi.register(
    (_p: unknown, pData: unknown, size: number) => {
      chunks.push(Buffer.from(koffi.decode(pData, koffi.array('uint8_t', size)) as number[]))
      return 1
    },
    koffi.pointer(L.WriteBlockProto),
  )
  // FPDF_INCREMENTAL (1): append an incremental update instead of rewriting the
  // whole file. A full rewrite (flag 0) re-serialises every object and corrupts
  // non-embedded font references, so the rest of the page reflows into a fallback
  // serif font after an edit. Incremental save leaves the original objects (and
  // their fonts) byte-for-byte intact.
  const ok = L.SaveAsCopy(doc, { version: 1, WriteBlock: cb }, 1)
  koffi.unregister(cb)
  if (!ok) throw new Error('PDFium failed to save the document')
  return Buffer.concat(chunks)
}

export interface ObjectHit {
  found: boolean; index: number; type: number; color: string
  x1: number; y1: number; x2: number; y2: number
}

/** The smallest page object enclosing the point (x, y) in PDF points. */
export function getObjectAt(bytes: Buffer, pageIndex: number, x: number, y: number): ObjectHit {
  const L = load()
  const none: ObjectHit = { found: false, index: -1, type: 0, color: '', x1: 0, y1: 0, x2: 0, y2: 0 }
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) return none
  try {
    const page = L.LoadPage(doc, pageIndex)
    if (!page) return none
    const n = L.CountObjects(page)
    let bestIdx = -1, bestType = 0, bb = [0, 0, 0, 0], bestArea = Infinity
    for (let i = 0; i < n; i++) {
      const obj = L.GetObject(page, i)
      const type = L.GetType(obj)
      if (type === 5) continue // FORM (group) — skip
      const l = [0], b = [0], r = [0], t = [0]
      if (!L.GetBounds(obj, l, b, r, t)) continue
      if (x >= l[0] - 2 && x <= r[0] + 2 && y >= b[0] - 2 && y <= t[0] + 2) {
        const area = Math.max(0.01, (r[0] - l[0]) * (t[0] - b[0]))
        if (area < bestArea) { bestIdx = i; bestType = type; bb = [l[0], b[0], r[0], t[0]]; bestArea = area }
      }
    }
    if (bestIdx < 0) { L.ClosePage(page); return none }
    const obj = L.GetObject(page, bestIdx)
    const rr = [0], gg = [0], bl = [0], aa = [0]
    let color = ''
    if (L.GetFillColor(obj, rr, gg, bl, aa)) {
      const hex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
      color = `#${hex(rr[0])}${hex(gg[0])}${hex(bl[0])}`
    }
    L.ClosePage(page)
    return { found: true, index: bestIdx, type: bestType, color, x1: bb[0], y1: bb[1], x2: bb[2], y2: bb[3] }
  } finally {
    L.CloseDocument(doc)
  }
}

function mutateObject(
  bytes: Buffer, pageIndex: number, index: number,
  fn: (L: Lib, page: unknown, obj: unknown) => void,
): Buffer {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  try {
    const page = L.LoadPage(doc, pageIndex)
    if (!page) throw new Error('PDFium could not load the page')
    const obj = L.GetObject(page, index)
    if (!obj) throw new Error('Object not found')
    fn(L, page, obj)
    L.GenerateContent(page)
    const out = saveDoc(L, doc)
    L.ClosePage(page)
    return out
  } finally {
    L.CloseDocument(doc)
  }
}

/** Apply an affine matrix (a,b,c,d,e,f) to object `index` — move/scale/rotate. */
export function transformObject(
  bytes: Buffer, pageIndex: number, index: number,
  a: number, b: number, c: number, d: number, e: number, f: number,
): Buffer {
  return mutateObject(bytes, pageIndex, index, (L, _page, obj) => L.Transform(obj, a, b, c, d, e, f))
}

/** Set the fill colour (0-255) of object `index`. */
export function setObjectFillColor(
  bytes: Buffer, pageIndex: number, index: number, r: number, g: number, b: number, a: number,
): Buffer {
  return mutateObject(bytes, pageIndex, index, (L, _page, obj) => L.SetFillColor(obj, r, g, b, a))
}

/** Delete object `index` from the page. */
export function deleteObject(bytes: Buffer, pageIndex: number, index: number): Buffer {
  return mutateObject(bytes, pageIndex, index, (L, page, obj) => {
    if (L.RemoveObject(page, obj)) L.DestroyObject(obj)
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace every occurrence of `term` with `replacement` across the document's
 * real page text (each matching text object is rewritten via FPDFText_SetText,
 * keeping its font). Returns the edited bytes and the number of replacements.
 */
export function replaceAllText(
  bytes: Buffer, term: string, replacement: string, matchCase: boolean,
): { bytes: Buffer; count: number } {
  if (!term) return { bytes, count: 0 }
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  const re = new RegExp(escapeRegExp(term), matchCase ? 'g' : 'gi')
  let count = 0
  try {
    const pages = L.GetPageCount(doc)
    for (let p = 0; p < pages; p++) {
      const page = L.LoadPage(doc, p)
      if (!page) continue
      const tp = L.TextLoadPage(page)
      const n = L.CountObjects(page)
      let changed = false
      for (let i = 0; i < n; i++) {
        const obj = L.GetObject(page, i)
        if (L.GetType(obj) !== PDFOBJ_TEXT) continue
        const len = L.GetText(obj, tp, null, 0)
        const buf = Buffer.alloc(len)
        L.GetText(obj, tp, buf, len)
        const cur = buf.toString('utf16le').replace(/ /g, '')
        const matches = cur.match(re)
        if (matches && matches.length) {
          const next = cur.replace(re, replacement)
          if (L.SetText(obj, Buffer.from(next + ' ', 'utf16le'))) { count += matches.length; changed = true }
        }
      }
      if (changed) L.GenerateContent(page)
      L.TextClosePage(tp)
      L.ClosePage(page)
    }
    if (count === 0) return { bytes, count: 0 }
    return { bytes: saveDoc(L, doc), count }
  } finally {
    L.CloseDocument(doc)
  }
}

// ── Paragraph editing with reflow ────────────────────────────────────────────
// PDF has no paragraphs — only positioned text runs. To edit a paragraph like a
// word processor we reconstruct one: cluster runs into visual lines by baseline,
// grow the clicked line into a block whose leading and font size are consistent,
// then on commit remove every original run and re-insert the new text wrapped to
// the paragraph's width at the original leading/alignment.

const FPDF_FONT_TRUETYPE = 2

// True only when the font file provably has a real glyph for every non-space
// character — the gate that keeps reflow from ever writing .notdef boxes.
function fontCovers(data: Buffer, text: string): boolean {
  try {
    let f = fontkit.create(data) as unknown as {
      fonts?: Array<{ hasGlyphForCodePoint(cp: number): boolean }>
      hasGlyphForCodePoint(cp: number): boolean
    }
    if (f.fonts && f.fonts.length) f = f.fonts[0] as typeof f
    for (const ch of new Set(text.replace(/\s/g, ''))) {
      if (!f.hasGlyphForCodePoint(ch.codePointAt(0)!)) return false
    }
    return true
  } catch {
    return false
  }
}

// Helvetica (standard font, WinAnsi encoding) can safely render Latin-1 plus
// the few typographic marks WinAnsi carries (curly quotes, dashes, bullet, …).
function isWinAnsiText(text: string): boolean {
  return /^[\n\r\t\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC\u2122]*$/.test(text)
}

interface ParaRun {
  obj: unknown; l: number; b: number; r: number; t: number
  nested: boolean; text: string; fontSize: number; baseX: number; baseY: number
}
interface ParaLine {
  runs: ParaRun[]; l: number; b: number; r: number; t: number
  baseY: number; fontSize: number; text: string
}

function collectParaRuns(L: Lib, page: unknown, tp: unknown): ParaRun[] {
  const nodes: TextNode[] = []
  collectTextNodes(L, page, true, IDENTITY, nodes)
  const runs: ParaRun[] = []
  for (const nd of nodes) {
    const len = L.GetText(nd.obj, tp, null, 0)
    const buf = Buffer.alloc(len)
    if (len > 0) L.GetText(nd.obj, tp, buf, len)
    const text = buf.toString('utf16le').replace(/\0+/g, '').replace(/\s+$/g, '')
    const fsArr = [0]; L.GetFontSize(nd.obj, fsArr)
    const m = composeMat(nd.pm, readMatrix(L, nd.obj) as Mat)
    runs.push({
      obj: nd.obj, l: nd.l, b: nd.b, r: nd.r, t: nd.t, nested: nd.nested,
      text, fontSize: fsArr[0] || Math.max(1, nd.t - nd.b), baseX: m[4], baseY: m[5],
    })
  }
  return runs
}

// Cluster runs sharing a baseline into visual lines. The horizontal-gap guard
// keeps side-by-side columns (which share baselines) from fusing into one line.
function groupIntoLines(runs: ParaRun[]): ParaLine[] {
  const sorted = [...runs].filter(r => r.text.trim() !== '').sort((a, b) => b.baseY - a.baseY || a.l - b.l)
  const lines: ParaLine[] = []
  for (const r of sorted) {
    const tol = Math.max(2, r.fontSize * 0.45)
    const gapCap = r.fontSize * 2.5
    const line = lines.find(ln =>
      Math.abs(ln.baseY - r.baseY) < tol && r.l < ln.r + gapCap && r.r > ln.l - gapCap)
    if (line) {
      line.runs.push(r)
      line.l = Math.min(line.l, r.l); line.r = Math.max(line.r, r.r)
      line.b = Math.min(line.b, r.b); line.t = Math.max(line.t, r.t)
      line.fontSize = Math.max(line.fontSize, r.fontSize)
    } else {
      lines.push({ runs: [r], l: r.l, b: r.b, r: r.r, t: r.t, baseY: r.baseY, fontSize: r.fontSize, text: '' })
    }
  }
  for (const ln of lines) {
    ln.runs.sort((a, b) => a.l - b.l)
    let text = ''
    let prevRight: number | null = null
    for (const r of ln.runs) {
      if (prevRight !== null && r.l - prevRight > Math.max(0.5, ln.fontSize * 0.18) && text && !text.endsWith(' ')) text += ' '
      text += r.text
      prevRight = r.r
    }
    ln.text = text
  }
  lines.sort((a, b) => b.baseY - a.baseY)
  return lines
}

// A line that begins a list item starts a NEW paragraph — without this, a CV's
// whole bullet list (consistent leading, same font) fuses into one giant block
// and an edit replaces the entire section. Covers •/◦/dashes, Word's Symbol-font
// bullets (PUA F0xx), the literal "o" sub-bullet, and numbered/lettered markers.
function isListItemStart(ln: ParaLine): boolean {
  return /^\s*([•◦▪‣·∙*]|[-]|[-–—]|o |\(?\d{1,3}[.)]\s|\(?[a-zA-Z][.)]\s)/.test(ln.text)
}

// A list item's marker glyph ("•", "o", "-") is its own text run sitting left
// of the text. Keep it OUT of the paragraph: it stays on the page untouched,
// the edit covers only the item's text, and the hanging indent survives reflow.
function stripLeadingMarker(grp: ParaLine[]): void {
  const ln = grp[0]
  if (!ln || ln.runs.length < 2) return
  const m = ln.runs[0]
  if (!/^[•◦▪‣·∙oO*\-–]$/.test(m.text.trim())) return
  if (ln.runs[1].l - m.r < Math.max(1, ln.fontSize * 0.2)) return
  ln.runs = ln.runs.slice(1)
  ln.l = Math.min(...ln.runs.map(r => r.l))
  let text = ''
  let prevRight: number | null = null
  for (const r of ln.runs) {
    if (prevRight !== null && r.l - prevRight > Math.max(0.5, ln.fontSize * 0.18) && text && !text.endsWith(' ')) text += ' '
    text += r.text
    prevRight = r.r
  }
  ln.text = text
}

// Grow the clicked line up/down into a paragraph: consistent leading, similar
// font size (so headings don't fuse with body text), and horizontal overlap.
function paragraphLinesAt(lines: ParaLine[], x: number, y: number): ParaLine[] {
  const idx = lines.findIndex(ln => x >= ln.l - 2 && x <= ln.r + 2 && y >= ln.b - 1 && y <= ln.t + 1)
  if (idx < 0) return []
  const samePara = (above: ParaLine, below: ParaLine): boolean => {
    const gap = above.baseY - below.baseY
    const fs = Math.max(above.fontSize, below.fontSize)
    if (gap <= 0 || gap > fs * 1.95) return false
    const ratio = above.fontSize / below.fontSize
    if (ratio < 0.77 || ratio > 1.3) return false
    const overlap = Math.min(above.r, below.r) - Math.max(above.l, below.l)
    if (overlap < Math.min(above.r - above.l, below.r - below.l) * 0.3) return false
    // List-item boundaries: a marker line starts a paragraph, and a line that
    // OUT-dents past the hanging indent does too (catches PUA bullets the
    // marker regex can't know about).
    if (isListItemStart(below)) return false
    if (below.l < above.l - Math.max(4, fs * 0.8)) return false
    return true
  }
  let start = idx, end = idx
  while (start > 0 && samePara(lines[start - 1], lines[start])) start--
  while (end < lines.length - 1 && samePara(lines[end], lines[end + 1])) end++
  let grp = lines.slice(start, end + 1)
  if (grp.length >= 3) {
    // Trim outward from the clicked line where the leading deviates from the
    // paragraph's median — a larger gap means a paragraph break.
    const gaps: number[] = []
    for (let i = 0; i + 1 < grp.length; i++) gaps.push(grp[i].baseY - grp[i + 1].baseY)
    const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    const ci = idx - start
    let s = ci, e = ci
    while (s > 0 && Math.abs((grp[s - 1].baseY - grp[s].baseY) - med) <= med * 0.4) s--
    while (e < grp.length - 1 && Math.abs((grp[e].baseY - grp[e + 1].baseY) - med) <= med * 0.4) e++
    grp = grp.slice(s, e + 1)
  }
  stripLeadingMarker(grp)
  return grp
}

function detectAlign(grp: ParaLine[]): 'left' | 'center' | 'right' {
  if (grp.length < 2) return 'left'
  // The last line of left/justified text is ragged — ignore it when possible.
  const consider = grp.length > 2 ? grp.slice(0, -1) : grp
  const spread = (vals: number[]) => Math.max(...vals) - Math.min(...vals)
  const lefts = spread(consider.map(l => l.l))
  const rights = spread(consider.map(l => l.r))
  const centers = spread(consider.map(l => (l.l + l.r) / 2))
  if (lefts < 3) return 'left'
  if (rights < 3 && lefts > 6) return 'right'
  if (centers < 4) return 'center'
  return 'left'
}

function medianLeading(grp: ParaLine[]): number {
  const gaps: number[] = []
  for (let i = 0; i + 1 < grp.length; i++) gaps.push(grp[i].baseY - grp[i + 1].baseY)
  return gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : grp[0].fontSize * 1.2
}

// Join soft-wrapped lines back into flowing text; rejoin hyphenated breaks.
function joinParagraphText(grp: ParaLine[]): string {
  let text = ''
  for (const ln of grp) {
    const t = ln.text.trim()
    if (!t) continue
    if (!text) text = t
    else if (text.endsWith('-')) text = text.slice(0, -1) + t
    else text += ' ' + t
  }
  return text
}

export interface ParagraphHit {
  found: boolean
  editable: boolean   // every run is top-level — PDFium can save the rewrite
  text: string
  x1: number; y1: number; x2: number; y2: number
  fontSize: number
  color: string
  leading: number
  lineCount: number
  align: 'left' | 'center' | 'right'
  fontName: string
  fontData: Buffer
  fontLoadable: boolean
}

const NO_PARA: ParagraphHit = {
  found: false, editable: false, text: '', x1: 0, y1: 0, x2: 0, y2: 0,
  fontSize: 0, color: '#000000', leading: 0, lineCount: 0, align: 'left',
  fontName: '', fontData: Buffer.alloc(0), fontLoadable: false,
}

export function getParagraphAt(bytes: Buffer, pageIndex: number, x: number, y: number): ParagraphHit {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) return NO_PARA
  try {
    const page = L.LoadPage(doc, pageIndex)
    if (!page) return NO_PARA
    const tp = L.TextLoadPage(page)
    const grp = paragraphLinesAt(groupIntoLines(collectParaRuns(L, page, tp)), x, y)
    L.TextClosePage(tp)
    if (grp.length === 0) { L.ClosePage(page); return NO_PARA }
    const firstRun = grp[0].runs[0]
    const font = extractFont(L, firstRun.obj)
    const rr = [0], gg = [0], bb = [0], aa = [0]; L.GetFillColor(firstRun.obj, rr, gg, bb, aa)
    const hex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
    const hit: ParagraphHit = {
      found: true,
      editable: grp.every(l => l.runs.every(r => !r.nested)),
      text: joinParagraphText(grp),
      x1: Math.min(...grp.map(l => l.l)), y1: Math.min(...grp.map(l => l.b)),
      x2: Math.max(...grp.map(l => l.r)), y2: Math.max(...grp.map(l => l.t)),
      fontSize: grp[0].fontSize,
      color: `#${hex(rr[0])}${hex(gg[0])}${hex(bb[0])}`,
      leading: medianLeading(grp),
      lineCount: grp.length,
      align: detectAlign(grp),
      fontName: font.name, fontData: font.data, fontLoadable: font.loadable,
    }
    L.ClosePage(page)
    return hit
  } finally {
    L.CloseDocument(doc)
  }
}

/**
 * Replace the paragraph at (x, y) with `newText`, reflowing it: the original
 * runs are removed and the new text is greedy-wrapped to the paragraph's width
 * at its original leading, alignment, colour and font size. `substituteFont`
 * (a complete installed font file) and the document's embedded font program are
 * both candidates — whichever PROVABLY covers every typed character wins, with
 * the embedded font preferred for exact fidelity. A font that can't be glyph-
 * verified is never used: re-inserting text through an unverified font is how
 * an entire paragraph turns into .notdef boxes.
 */
export function replaceParagraphAt(
  bytes: Buffer, pageIndex: number, x: number, y: number, newText: string,
  substituteFont?: Buffer | null,
): { bytes: Buffer; lineCount: number } {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  try {
    const page = L.LoadPage(doc, pageIndex)
    if (!page) throw new Error('PDFium could not load the page')
    const tp = L.TextLoadPage(page)
    const grp = paragraphLinesAt(groupIntoLines(collectParaRuns(L, page, tp)), x, y)
    L.TextClosePage(tp)
    if (grp.length === 0) throw new Error('No paragraph found at that point')
    if (!grp.every(l => l.runs.every(r => !r.nested)))
      throw new Error('Paragraph contains form-nested text PDFium cannot rewrite')

    const firstRun = grp[0].runs[0]
    const fontSize = grp[0].fontSize
    const rr = [0], gg = [0], bb = [0], aa = [0]; L.GetFillColor(firstRun.obj, rr, gg, bb, aa)
    const px1 = Math.min(...grp.map(l => l.l))
    const px2 = Math.max(...grp.map(l => l.r))
    const width = px2 - px1
    const leading = medianLeading(grp)
    const align = detectAlign(grp)
    const firstBaseY = grp[0].baseY

    // Pick a font that PROVABLY has a glyph for every character being written.
    // The embedded program wins (exact face) when it covers the text — Word
    // subsets usually retain the document's own alphabet — otherwise the
    // complete installed substitute, otherwise Helvetica for Latin text.
    // NEVER fall back to the original font handle: for subsetted CID fonts
    // FPDFText_SetText through it maps to .notdef and the paragraph renders
    // as rows of boxes.
    const embedded = extractFont(L, firstRun.obj)
    const candidates: Buffer[] = []
    if (embedded.loadable && fontCovers(embedded.data, newText)) candidates.push(embedded.data)
    if (substituteFont && substituteFont.length > 4 && fontCovers(substituteFont, newText)) candidates.push(substituteFont)
    let loadedFont: unknown = null
    for (const c of candidates) {
      try { loadedFont = L.LoadFontData(doc, c, c.length, FPDF_FONT_TRUETYPE, 1) } catch { loadedFont = null }
      if (loadedFont) break
    }
    if (!loadedFont && isWinAnsiText(newText)) {
      try { loadedFont = L.LoadStandardFont(doc, 'Helvetica') } catch { loadedFont = null }
    }
    const font = loadedFont
    if (!font) throw new Error('No installed or embedded font covers the edited text — falling back to overlay editing')

    const scratch = L.CreateTextObj(doc, font, fontSize)
    if (!scratch) throw new Error('PDFium could not create a text object')
    const measure = (s: string): number => {
      if (!s) return 0
      if (!L.SetText(scratch, Buffer.from(s + '\u0000', 'utf16le'))) return s.length * fontSize * 0.5
      const l = [0], b = [0], r = [0], t = [0]
      if (!L.GetBounds(scratch, l, b, r, t)) return s.length * fontSize * 0.5
      return r[0] - l[0]
    }

    const outLines: string[] = []
    const tolerance = Math.max(2, width * 0.02)
    for (const block of newText.replace(/\r/g, '').split('\n')) {
      const words = block.split(/\s+/).filter(Boolean)
      if (words.length === 0) { outLines.push(''); continue }
      let cur = ''
      for (const w of words) {
        const candidate = cur ? cur + ' ' + w : w
        if (cur && measure(candidate) > width + tolerance) { outLines.push(cur); cur = w }
        else cur = candidate
      }
      if (cur) outLines.push(cur)
    }

    for (const ln of grp) for (const r of ln.runs) {
      if (L.RemoveObject(page, r.obj)) L.DestroyObject(r.obj)
    }

    for (let i = 0; i < outLines.length; i++) {
      const s = outLines[i]
      if (!s) continue
      const obj = L.CreateTextObj(doc, font, fontSize)
      if (!obj) throw new Error('PDFium could not create a text object')
      L.SetText(obj, Buffer.from(s + '\u0000', 'utf16le'))
      L.SetFillColor(obj, rr[0], gg[0], bb[0], aa[0] || 255)
      let lx = px1
      if (align !== 'left') {
        const wln = measure(s)
        lx = align === 'center' ? px1 + (width - wln) / 2 : px2 - wln
      }
      L.Transform(obj, 1, 0, 0, 1, lx, firstBaseY - i * leading)
      L.InsertObject(page, obj)
    }
    L.DestroyObject(scratch)
    L.GenerateContent(page)
    const out = saveDoc(L, doc)
    if (loadedFont) { try { L.FontClose(loadedFont) } catch { /* handle already gone */ } }
    L.ClosePage(page)
    return { bytes: out, lineCount: outLines.length }
  } finally {
    L.CloseDocument(doc)
  }
}

// ── Line-level text editing ───────────────────────────────────────────────────
// Click-to-edit operates on a whole VISUAL LINE (Adobe / PDF-XChange behaviour):
// the editor opens with the full line, and on commit only the run(s) the user
// actually changed are rewritten — every untouched run keeps its page object,
// font and colour byte-for-byte. The changed run is re-set through its OWN
// embedded font whenever that font provably covers the new characters, so the
// original face survives the edit; a substitute can only ever touch the changed
// run, never the rest of the line. Runs right of the edit are shifted by the
// width delta so inter-word spacing stays intact.

export interface LineHit {
  found: boolean
  editable: boolean   // every run is top-level — PDFium can save the rewrite
  text: string
  x1: number; y1: number; x2: number; y2: number
  baseY: number
  fontSize: number
  color: string
  fontName: string
  fontData: Buffer
  fontLoadable: boolean
}

const NO_LINE_HIT: LineHit = {
  found: false, editable: false, text: '', x1: 0, y1: 0, x2: 0, y2: 0,
  baseY: 0, fontSize: 0, color: '#000000', fontName: '',
  fontData: Buffer.alloc(0), fontLoadable: false,
}

// UTF-16LE with explicit NUL terminator (FPDFText_SetText contract).
const wideStr = (s: string): Buffer => Buffer.from(s + String.fromCharCode(0), 'utf16le')

function lineAtPoint(lines: ParaLine[], x: number, y: number): ParaLine | null {
  return lines.find(l => x >= l.l - 2 && x <= l.r + 2 && y >= l.b - 1 && y <= l.t + 1) ?? null
}

// Character range each run occupies inside ParaLine.text. Gap characters (the
// spaces inferred between runs) belong to no run. Must mirror the line-text
// assembly in groupIntoLines exactly.
function lineRunRanges(ln: ParaLine): Array<{ run: ParaRun; start: number; end: number }> {
  const ranges: Array<{ run: ParaRun; start: number; end: number }> = []
  let text = ''
  let prevRight: number | null = null
  for (const r of ln.runs) {
    if (prevRight !== null && r.l - prevRight > Math.max(0.5, ln.fontSize * 0.18) && text && !text.endsWith(' ')) text += ' '
    ranges.push({ run: r, start: text.length, end: text.length + r.text.length })
    text += r.text
    prevRight = r.r
  }
  return ranges
}

// Like fontCovers but does NOT skip spaces: FPDFText_SetText maps every
// character (the space included) through the font's charmap, and a subset
// missing the space glyph would render boxes between words.
function fontCoversAll(data: Buffer, text: string): boolean {
  try {
    let f = fontkit.create(data) as unknown as {
      fonts?: Array<{ hasGlyphForCodePoint(cp: number): boolean }>
      hasGlyphForCodePoint(cp: number): boolean
    }
    if (f.fonts && f.fonts.length) f = f.fonts[0] as typeof f
    for (const ch of new Set(text)) {
      if (ch === String.fromCharCode(9) || ch === String.fromCharCode(13) || ch === String.fromCharCode(10)) continue
      if (!f.hasGlyphForCodePoint(ch.codePointAt(0)!)) return false
    }
    return true
  } catch {
    return false
  }
}

export function getLineAt(bytes: Buffer, pageIndex: number, x: number, y: number): LineHit {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) return NO_LINE_HIT
  try {
    const page = L.LoadPage(doc, pageIndex)
    if (!page) return NO_LINE_HIT
    const tp = L.TextLoadPage(page)
    const ln = lineAtPoint(groupIntoLines(collectParaRuns(L, page, tp)), x, y)
    L.TextClosePage(tp)
    if (!ln) { L.ClosePage(page); return NO_LINE_HIT }
    // Style preview comes from the run actually under the cursor (a line can
    // mix faces); fall back to the widest run.
    const hitRun = ln.runs.find(r => x >= r.l - 2 && x <= r.r + 2)
      ?? ln.runs.reduce((a, b) => (b.r - b.l > a.r - a.l ? b : a))
    const font = extractFont(L, hitRun.obj)
    const rr = [0], gg = [0], bb = [0], aa = [0]
    L.GetFillColor(hitRun.obj, rr, gg, bb, aa)
    const hex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
    L.ClosePage(page)
    return {
      found: true,
      editable: ln.runs.every(r => !r.nested),
      text: ln.text,
      x1: ln.l, y1: ln.b, x2: ln.r, y2: ln.t,
      baseY: ln.baseY,
      fontSize: hitRun.fontSize || ln.fontSize,
      color: '#' + hex(rr[0]) + hex(gg[0]) + hex(bb[0]),
      fontName: font.name, fontData: font.data, fontLoadable: font.loadable,
    }
  } finally {
    L.CloseDocument(doc)
  }
}

export function replaceLineAt(
  bytes: Buffer, pageIndex: number, x: number, y: number, newTextRaw: string,
  substituteFont?: Buffer | null,
): Buffer {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  try {
    const page = L.LoadPage(doc, pageIndex)
    if (!page) throw new Error('PDFium could not load the page')
    const tp = L.TextLoadPage(page)
    const ln = lineAtPoint(groupIntoLines(collectParaRuns(L, page, tp)), x, y)
    L.TextClosePage(tp)
    if (!ln) throw new Error('No text line at that point')
    if (ln.runs.some(r => r.nested)) throw new Error('Line is inside a form group; PDFium cannot save in-place edits there')

    const oldText = ln.text
    const newText = newTextRaw.replace(/[\r\n]+/g, ' ').replace(/\s+$/, '')

    if (newText.trim() === '') {
      for (const r of ln.runs) { if (L.RemoveObject(page, r.obj)) L.DestroyObject(r.obj) }
      L.GenerateContent(page)
      const cleared = saveDoc(L, doc)
      L.ClosePage(page)
      return cleared
    }
    if (newText === oldText) { L.ClosePage(page); return Buffer.from(bytes) }

    // Common prefix/suffix → smallest changed region. Only the run(s) that
    // region touches get rewritten; every other run keeps its bytes, which is
    // what preserves mixed fonts/colours through an edit.
    let p = 0
    const maxP = Math.min(oldText.length, newText.length)
    while (p < maxP && oldText[p] === newText[p]) p++
    let sfx = 0
    const maxS = maxP - p
    while (sfx < maxS && oldText[oldText.length - 1 - sfx] === newText[newText.length - 1 - sfx]) sfx++
    const aStart = p
    const aEnd = oldText.length - sfx

    const ranges = lineRunRanges(ln)
    // The run owning the change start is the LAST run beginning at or before
    // it — so a pure insertion at a run boundary extends the run the user was
    // typing after, not the following run across the inter-run gap.
    let i = 0
    for (let k = 0; k < ranges.length; k++) if (ranges[k].start <= aStart) i = k
    let j = ranges.length - 1
    while (j > i && ranges[j].start >= aEnd) j--

    const mergStart = Math.min(ranges[i].start, aStart)
    const mergEnd = Math.max(ranges[j].end, aEnd)
    const merged = oldText.slice(mergStart, aStart)
      + newText.slice(p, newText.length - sfx)
      + oldText.slice(aEnd, mergEnd)

    const target = ranges[i].run
    const oldRight = ranges[j].run.r
    const trailing = ranges.slice(j + 1).map(r => r.run)

    const fsArr = [0]; L.GetFontSize(target.obj, fsArr)
    const fontSize = fsArr[0] || target.fontSize
    const rr0 = [0], gg0 = [0], bb0 = [0], aa0 = [0]
    L.GetFillColor(target.obj, rr0, gg0, bb0, aa0)

    const embedded = extractFont(L, target.obj)
    // In-place SetText is the high-fidelity path: the run keeps its own font
    // object, so the face is preserved exactly. Allowed when the embedded
    // program PROVABLY covers the new text, or — for font programs fontkit
    // cannot parse (bare CFF / standard 14) — when the text is plain WinAnsi,
    // which those charmaps always carry. Never SetText through an unverified
    // subset: missing glyphs render as .notdef boxes.
    const canInPlace = embedded.loadable
      ? fontCoversAll(embedded.data, merged)
      : isWinAnsiText(merged)

    let newRight = oldRight
    let loadedFont: unknown = null
    if (canInPlace) {
      if (!L.SetText(target.obj, wideStr(merged))) throw new Error('PDFium failed to set text')
      for (let k = i + 1; k <= j; k++) {
        if (L.RemoveObject(page, ranges[k].run.obj)) L.DestroyObject(ranges[k].run.obj)
      }
      const l = [0], b = [0], r = [0], t = [0]
      if (L.GetBounds(target.obj, l, b, r, t)) newRight = r[0]
    } else {
      if (substituteFont && substituteFont.length > 4 && fontCoversAll(substituteFont, merged)) {
        try { loadedFont = L.LoadFontData(doc, substituteFont, substituteFont.length, FPDF_FONT_TRUETYPE, 1) } catch { loadedFont = null }
      }
      if (!loadedFont && isWinAnsiText(merged)) {
        try { loadedFont = L.LoadStandardFont(doc, 'Helvetica') } catch { loadedFont = null }
      }
      if (!loadedFont) throw new Error('No font covers the edited characters; falling back to overlay editing')
      const obj = L.CreateTextObj(doc, loadedFont, fontSize)
      if (!obj) {
        try { L.FontClose(loadedFont) } catch { /* ignore */ }
        throw new Error('PDFium could not create a text object')
      }
      L.SetText(obj, wideStr(merged))
      L.SetFillColor(obj, rr0[0], gg0[0], bb0[0], aa0[0] || 255)
      L.Transform(obj, 1, 0, 0, 1, target.baseX, target.baseY)
      L.InsertObject(page, obj)
      const l = [0], b = [0], r = [0], t = [0]
      if (L.GetBounds(obj, l, b, r, t)) newRight = r[0]
      for (let k = i; k <= j; k++) {
        if (L.RemoveObject(page, ranges[k].run.obj)) L.DestroyObject(ranges[k].run.obj)
      }
    }

    const dx = newRight - oldRight
    if (Math.abs(dx) > 0.01) {
      for (const run of trailing) L.Transform(run.obj, 1, 0, 0, 1, dx, 0)
    }
    L.GenerateContent(page)
    const out = saveDoc(L, doc)
    if (loadedFont) { try { L.FontClose(loadedFont) } catch { /* handle already gone */ } }
    L.ClosePage(page)
    return out
  } finally {
    L.CloseDocument(doc)
  }
}

/** Per-LINE clickable outlines for the Edit Text tool (matches what a click selects). */
export function getAllTextLines(
  bytes: Buffer, pageIndex: number,
): Array<{ x1: number; y1: number; x2: number; y2: number; nested: boolean }> {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) return []
  try {
    const page = L.LoadPage(doc, pageIndex)
    if (!page) return []
    const tp = L.TextLoadPage(page)
    const lines = groupIntoLines(collectParaRuns(L, page, tp))
    L.TextClosePage(tp)
    L.ClosePage(page)
    return lines.map(ln => ({ x1: ln.l, y1: ln.b, x2: ln.r, y2: ln.t, nested: ln.runs.some(r => r.nested) }))
  } finally {
    L.CloseDocument(doc)
  }
}

/** Text runs with style info (font family, size, weight, fill colour) for styled export. */
export interface StyledRun {
  text: string; x1: number; y1: number; x2: number; y2: number
  fontName: string; family: string; bold: boolean; italic: boolean
  fontSize: number; color: string
}

export function getStyledTextRuns(bytes: Buffer, pageIndex: number): StyledRun[] {
  const L = load()
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  const nulTail = new RegExp(String.fromCharCode(0) + '+$')
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  // PDF base font names are often anonymised (CIDFont+F1); the embedded font
  // program still carries the real family + weight in its name/OS2 tables.
  const fontInfo = new Map<string, { family: string; bold: boolean; italic: boolean }>()
  const resolveFont = (obj: unknown, fontName: string): { family: string; bold: boolean; italic: boolean } => {
    const cached = fontInfo.get(fontName)
    if (cached) return cached
    let family = ''
    let bold = /bold|black|heavy|semibold/i.test(fontName)
    let italic = /italic|oblique/i.test(fontName)
    try {
      const f = extractFont(L, obj)
      if (f.data.length > 0) {
        let fk = fontkit.create(f.data) as unknown as {
          fonts?: Array<unknown>
          familyName?: string | null
          subfamilyName?: string | null
          'OS/2'?: { usWeightClass?: number }
          italicAngle?: number
        }
        if (fk.fonts && fk.fonts.length) fk = fk.fonts[0] as typeof fk
        family = (fk.familyName ?? '').trim()
        const sub = (fk.subfamilyName ?? '').toLowerCase()
        const weight = fk['OS/2']?.usWeightClass ?? 0
        bold = bold || /bold|black|heavy/.test(sub) || weight >= 600
        italic = italic || /italic|oblique/.test(sub) || Math.abs(fk.italicAngle ?? 0) > 4
      }
    } catch { /* fall back to the base name heuristics */ }
    if (!family) family = fontName.replace(/^[A-Z]{6}\+/, '').replace(/^CIDFont\+/i, '').split(/[-,]/)[0]
    const info = { family, bold, italic }
    fontInfo.set(fontName, info)
    return info
  }
  try {
    const page = L.LoadPage(doc, pageIndex)
    const tp = L.TextLoadPage(page)
    const n = L.CountObjects(page)
    const runs: StyledRun[] = []
    for (let i = 0; i < n; i++) {
      const obj = L.GetObject(page, i)
      if (L.GetType(obj) !== PDFOBJ_TEXT) continue
      const l = [0], b = [0], r = [0], t = [0]
      L.GetBounds(obj, l, b, r, t)
      const len = L.GetText(obj, tp, null, 0)
      const buf = Buffer.alloc(len)
      L.GetText(obj, tp, buf, len)
      const text = buf.toString('utf16le').replace(nulTail, '')
      if (!text.trim()) continue
      const fs = [0]
      L.GetFontSize(obj, fs)
      const rr = [0], gg = [0], bb = [0], aa = [0]
      const hasColor = L.GetFillColor(obj, rr, gg, bb, aa)
      let fontName = ''
      try {
        const font = L.GetFont(obj)
        if (font) {
          const nb = Buffer.alloc(128)
          const nl = L.GetBaseFontName(font, nb, 128)
          if (nl > 0) fontName = nb.toString('utf8', 0, Math.min(nb.length, Math.max(0, nl - 1))).replace(nulTail, '')
        }
      } catch { /* name optional */ }
      const info = resolveFont(obj, fontName)
      runs.push({
        text, x1: l[0], y1: b[0], x2: r[0], y2: t[0],
        fontName, family: info.family, bold: info.bold, italic: info.italic,
        fontSize: fs[0],
        color: hasColor ? `#${hex(rr[0])}${hex(gg[0])}${hex(bb[0])}` : '#000000',
      })
    }
    L.TextClosePage(tp)
    L.ClosePage(page)
    return runs
  } finally {
    L.CloseDocument(doc)
  }
}
