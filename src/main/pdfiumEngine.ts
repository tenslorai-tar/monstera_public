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

const PDFOBJ_TEXT = 1

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
  GetType: (obj: unknown) => number
  GetBounds: (obj: unknown, l: number[], b: number[], r: number[], t: number[]) => number
  GetFontSize: (obj: unknown, size: number[]) => number
  GetFillColor: (obj: unknown, r: number[], g: number[], b: number[], a: number[]) => number
  GetFont: (obj: unknown) => unknown
  GetFontData: (font: unknown, buffer: Buffer | null, buflen: number, out: number[]) => number
  GetMatrix: (obj: unknown, m: Record<string, number>) => number
  TextLoadPage: (page: unknown) => unknown
  TextClosePage: (tp: unknown) => void
  GetText: (obj: unknown, tp: unknown, buf: Buffer | null, len: number) => number
  SetText: (obj: unknown, text: Buffer) => number
  RemoveObject: (page: unknown, obj: unknown) => number
  DestroyObject: (obj: unknown) => void
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
    GetType:         m.func('int FPDFPageObj_GetType(void* obj)') as Lib['GetType'],
    GetBounds:       m.func('int FPDFPageObj_GetBounds(void* obj, _Out_ float* l, _Out_ float* b, _Out_ float* r, _Out_ float* t)') as Lib['GetBounds'],
    GetFontSize:     m.func('int FPDFTextObj_GetFontSize(void* obj, _Out_ float* size)') as Lib['GetFontSize'],
    GetFillColor:    m.func('int FPDFPageObj_GetFillColor(void* obj, _Out_ uint* r, _Out_ uint* g, _Out_ uint* b, _Out_ uint* a)') as Lib['GetFillColor'],
    GetFont:         m.func('void* FPDFTextObj_GetFont(void* obj)') as Lib['GetFont'],
    GetFontData:     m.func('int FPDFFont_GetFontData(void* font, void* buffer, size_t buflen, _Out_ size_t* out)') as Lib['GetFontData'],
    GetMatrix:       m.func('int FPDFPageObj_GetMatrix(void* obj, _Out_ FS_MATRIX* matrix)') as Lib['GetMatrix'],
    TextLoadPage:    m.func('void* FPDFText_LoadPage(void* page)') as Lib['TextLoadPage'],
    TextClosePage:   m.func('void FPDFText_ClosePage(void* tp)') as Lib['TextClosePage'],
    GetText:         m.func('unsigned long FPDFTextObj_GetText(void* obj, void* tp, _Out_ void* buf, unsigned long len)') as Lib['GetText'],
    SetText:         m.func('int FPDFText_SetText(void* obj, const char16_t* text)') as Lib['SetText'],
    RemoveObject:    m.func('int FPDFPage_RemoveObject(void* page, void* obj)') as Lib['RemoveObject'],
    DestroyObject:   m.func('void FPDFPageObj_Destroy(void* obj)') as Lib['DestroyObject'],
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

interface Match { obj: unknown; l: number; b: number; t: number; cur: string; fontSize: number }

// Text objects intersecting `rect`, ordered in reading order. Shared by editing
// and prefill so what the user sees is exactly what gets replaced.
function findMatches(L: Lib, page: unknown, tp: unknown, rect: EditRect): Match[] {
  const minX = Math.min(rect.x1, rect.x2), maxX = Math.max(rect.x1, rect.x2)
  const minY = Math.min(rect.y1, rect.y2), maxY = Math.max(rect.y1, rect.y2)
  const n = L.CountObjects(page)
  const matches: Match[] = []
  for (let i = 0; i < n; i++) {
    const obj = L.GetObject(page, i)
    if (L.GetType(obj) !== PDFOBJ_TEXT) continue
    const l = [0], b = [0], r = [0], t = [0]
    L.GetBounds(obj, l, b, r, t)
    const ox = Math.min(r[0], maxX) - Math.max(l[0], minX)
    const oy = Math.min(t[0], maxY) - Math.max(b[0], minY)
    if (ox > 0.5 && oy > (t[0] - b[0]) * 0.25) {
      const len = L.GetText(obj, tp, null, 0)
      const buf = Buffer.alloc(len)
      L.GetText(obj, tp, buf, len)
      const fs = [0]; L.GetFontSize(obj, fs)
      const cur = buf.toString('utf16le').replace(/ /g, '').replace(/ +$/, '')
      matches.push({ obj, l: l[0], b: b[0], t: t[0], cur, fontSize: fs[0] })
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
  const none: RegionTextHit = { found: false, text: '', fontSize: 0, color: '#000000', matrix: [1, 0, 0, 1, 0, 0], fontData: Buffer.alloc(0), fontLoadable: false }
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) throw new Error('PDFium could not open the document')
  try {
    const page = L.LoadPage(doc, pageIndex)
    const tp = L.TextLoadPage(page)
    const matches = findMatches(L, page, tp, rect)
    if (matches.length === 0) { L.TextClosePage(tp); L.ClosePage(page); return none }
    const first = matches[0].obj
    const font = extractFont(L, first)
    const matrix = readMatrix(L, first)
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
function extractFont(L: Lib, obj: unknown): { data: Buffer; loadable: boolean } {
  try {
    const font = L.GetFont(obj)
    if (!font) return { data: Buffer.alloc(0), loadable: false }
    const sz = [0]
    L.GetFontData(font, null, 0, sz)
    const size = sz[0]
    if (!size || size > FONT_CAP) return { data: Buffer.alloc(0), loadable: false }
    const buf = Buffer.alloc(size)
    const got = [0]
    if (!L.GetFontData(font, buf, size, got) || got[0] < 4) return { data: Buffer.alloc(0), loadable: false }
    const magic = buf.readUInt32BE(0)
    const loadable = magic === 0x00010000 || magic === 0x4f54544f /* OTTO */
      || magic === 0x74727565 /* true */ || magic === 0x74746366 /* ttcf */
      || magic === 0x774f4646 /* wOFF */ || magic === 0x774f4632 /* wOF2 */
    return { data: buf, loadable }
  } catch {
    return { data: Buffer.alloc(0), loadable: false }
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
  const none: TextObjectHit = { found: false, text: '', fontSize: 0, color: '#000000', x1: 0, y1: 0, x2: 0, y2: 0, matrix: [1, 0, 0, 1, 0, 0], fontData: Buffer.alloc(0), fontLoadable: false }
  const doc = L.LoadMemDocument(bytes, bytes.length, null)
  if (!doc) return none
  try {
    const page = L.LoadPage(doc, pageIndex)
    const tp = L.TextLoadPage(page)
    const n = L.CountObjects(page)
    let best: unknown = null
    let bb = [0, 0, 0, 0]
    let bestArea = Infinity
    for (let i = 0; i < n; i++) {
      const obj = L.GetObject(page, i)
      if (L.GetType(obj) !== PDFOBJ_TEXT) continue
      const l = [0], b = [0], r = [0], t = [0]
      L.GetBounds(obj, l, b, r, t)
      // small tolerance so clicks just outside the glyph box still land
      if (x >= l[0] - 2 && x <= r[0] + 2 && y >= b[0] - 1 && y <= t[0] + 1) {
        const area = (r[0] - l[0]) * (t[0] - b[0])
        if (area < bestArea) { best = obj; bb = [l[0], b[0], r[0], t[0]]; bestArea = area }
      }
    }
    if (!best) { L.TextClosePage(tp); L.ClosePage(page); return none }
    const len = L.GetText(best, tp, null, 0)
    const buf = Buffer.alloc(len)
    L.GetText(best, tp, buf, len)
    const fs = [0]; L.GetFontSize(best, fs)
    const rr = [0], gg = [0], bbl = [0], aa = [0]; L.GetFillColor(best, rr, gg, bbl, aa)
    const hex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
    const font = extractFont(L, best)
    const matrix = readMatrix(L, best)
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
    const wide = Buffer.from(newText + ' ', 'utf16le')
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
    const n = L.CountObjects(page)
    let best: unknown = null
    let bestArea = Infinity
    for (let i = 0; i < n; i++) {
      const obj = L.GetObject(page, i)
      if (L.GetType(obj) !== PDFOBJ_TEXT) continue
      const l = [0], b = [0], r = [0], t = [0]
      L.GetBounds(obj, l, b, r, t)
      if (x >= l[0] - 2 && x <= r[0] + 2 && y >= b[0] - 1 && y <= t[0] + 1) {
        const area = (r[0] - l[0]) * (t[0] - b[0])
        if (area < bestArea) { best = obj; bestArea = area }
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
