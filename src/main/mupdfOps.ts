// Shared MuPDF operation implementations.
//
// Imported by BOTH:
//   • src/main/mupdfHost.ts — runs these in an Electron utilityProcess so heavy
//     PDF work no longer blocks the main thread (the "Not Responding" freezes).
//   • src/main/main.ts — as a fallback, run directly in the main process when the
//     worker is unavailable (so MuPDF features never break, even if the worker
//     can't spawn or load WASM in a given environment).
//
// Because there is a single copy here, the off-thread path and the fallback can
// never drift apart.

// Dynamic ESM import so the CJS build can load the ESM mupdf module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _esmImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mupdf: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMupdf(): Promise<any> {
  if (!_mupdf) _mupdf = await _esmImport('mupdf')
  return _mupdf
}

// mupdf's Buffer.asUint8Array() returns a VIEW into the WASM heap (HEAPU8.subarray),
// so `.buffer` is the ENTIRE heap (tens of MB), not the PDF. Copy the exact bytes
// into a standalone ArrayBuffer instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mupdfBytes(buf: any): ArrayBuffer {
  const u8 = buf.asUint8Array()
  const out = new Uint8Array(u8.length)
  out.set(u8)
  return out.buffer
}
// Free WASM-backed mupdf objects — they are NOT reliably garbage-collected.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function freeMupdf(...objs: any[]): void {
  for (const o of objs) { try { o?.destroy?.() } catch { /* ignore */ } }
}

export interface EncryptOpts { userPassword: string; ownerPassword: string; permissions: number }
export interface RedactArea { pageNum: number; x1: number; y1: number; x2: number; y2: number; blurred?: boolean }
export interface BookmarkItem { id: string; title: string; pageNum: number }
export interface AccessibilityIssue { issue: string; severity: 'error' | 'warning' | 'info'; page?: number }

export async function getMetadata(bytes: ArrayBuffer) {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  try {
    return {
      title:    doc.getMetaData('info:Title')    ?? '',
      author:   doc.getMetaData('info:Author')   ?? '',
      subject:  doc.getMetaData('info:Subject')  ?? '',
      keywords: doc.getMetaData('info:Keywords') ?? '',
      creator:  doc.getMetaData('info:Creator')  ?? '',
      producer: doc.getMetaData('info:Producer') ?? '',
      needsPassword: doc.needsPassword(),
      encryption: doc.getMetaData('encryption')  ?? '',
    }
  } finally { freeMupdf(doc) }
}

export async function setMetadata(bytes: ArrayBuffer, meta: Record<string, string>): Promise<ArrayBuffer> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  if (meta.title    !== undefined) doc.setMetaData('info:Title',    meta.title)
  if (meta.author   !== undefined) doc.setMetaData('info:Author',   meta.author)
  if (meta.subject  !== undefined) doc.setMetaData('info:Subject',  meta.subject)
  if (meta.keywords !== undefined) doc.setMetaData('info:Keywords', meta.keywords)
  const buf = doc.saveToBuffer('')
  const out = mupdfBytes(buf)
  freeMupdf(buf, doc)
  return out
}

export async function encrypt(bytes: ArrayBuffer, opts: EncryptOpts): Promise<ArrayBuffer> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const optStr = [
    'encrypt=aes-256',
    `user-password=${opts.userPassword}`,
    `owner-password=${opts.ownerPassword}`,
    `permissions=${opts.permissions}`,
  ].join(',')
  const buf = doc.saveToBuffer(optStr)
  const out = mupdfBytes(buf)
  freeMupdf(buf, doc)
  return out
}

export async function removePassword(bytes: ArrayBuffer, password: string): Promise<ArrayBuffer> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  if (doc.needsPassword()) {
    const result = doc.authenticatePassword(password)
    if (!result) { freeMupdf(doc); throw new Error('Incorrect password') }
  }
  const buf = doc.saveToBuffer('decrypt=yes')
  const out = mupdfBytes(buf)
  freeMupdf(buf, doc)
  return out
}

export async function applyRedactions(bytes: ArrayBuffer, areas: RedactArea[]): Promise<ArrayBuffer> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')

  // Group areas by page, create Redact annotations. Two passes per page:
  // solid marks paint a black box; blurred marks remove the content with no
  // box (the renderer overlays a blurred snapshot taken before removal).
  const pageNums = [...new Set(areas.map(a => a.pageNum))]
  for (const pageNum of pageNums) {
    const page = doc.loadPage(pageNum - 1)
    // Incoming areas are PDF user space (y up from the bottom edge); MuPDF
    // annotation rects are fitz space (y down from the top edge) — flip.
    const bounds = page.getBounds()
    const yTop = bounds[3]
    const onPage = areas.filter(r => r.pageNum === pageNum)
    const passes = [
      { list: onPage.filter(a => !a.blurred), blackBoxes: true },
      { list: onPage.filter(a => a.blurred), blackBoxes: false },
    ]
    for (const pass of passes) {
      if (pass.list.length === 0) continue
      for (const a of pass.list) {
        const ann = page.createAnnotation('Redact')
        ann.setRect([
          Math.min(a.x1, a.x2), yTop - Math.max(a.y1, a.y2),
          Math.max(a.x1, a.x2), yTop - Math.min(a.y1, a.y2),
        ])
        ann.setColor([0, 0, 0])
        ann.update()
      }
      // applyRedactions(blackBoxes, imageHandling)
      page.applyRedactions(pass.blackBoxes, 0)
    }
    freeMupdf(page)
  }

  const buf = doc.saveToBuffer('')
  const out = mupdfBytes(buf)
  freeMupdf(buf, doc)
  return out
}

// Synthesize appearance streams (/AP) for annotations that lack them. pdf-lib
// writes bare annotation dictionaries; viewers are only *allowed* (not required)
// to invent appearances for those, so several renderers show nothing. Running
// pdf_update_page makes MuPDF generate spec-compliant appearance streams, after
// which the markup renders identically everywhere.
export async function synthesizeAppearances(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  try {
    const n = doc.countPages()
    for (let i = 0; i < n; i++) {
      const page = doc.loadPage(i)
      try {
        for (const a of page.getAnnotations()) {
          try {
            const type = a.getType()
            if (type === 'Link' || type === 'Popup') continue
            const ap = a.getObject().get('AP')
            if (ap && !ap.isNull()) continue  // already has an appearance
            // MuPDF only re-synthesizes annotations marked dirty; a no-op
            // setFlags() sets that flag, then update() builds the /AP stream.
            a.setFlags(a.getFlags())
            a.update()
          } catch { /* leave this annotation as-is */ }
        }
        page.update()
      } catch { /* leave page as-is */ }
      freeMupdf(page)
    }
    const buf = doc.saveToBuffer('')
    const out = mupdfBytes(buf)
    freeMupdf(buf)
    return out
  } finally { freeMupdf(doc) }
}

// Render pages to print-resolution PNGs. Used by the print pipeline: the app
// prints these page images (real PDF rendering), never the on-screen DOM.
export interface PrintPageImage { pageNum: number; png: ArrayBuffer; wPt: number; hPt: number }
export async function renderPagesForPrint(
  bytes: ArrayBuffer, pages: number[], dpi: number
): Promise<PrintPageImage[]> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  try {
    const count = doc.countPages()
    const scale = Math.min(Math.max(dpi, 72), 600) / 72
    const list = pages.length > 0 ? pages : Array.from({ length: count }, (_, i) => i + 1)
    const out: PrintPageImage[] = []
    for (const pageNum of list) {
      if (pageNum < 1 || pageNum > count) continue
      const page = doc.loadPage(pageNum - 1)
      const bounds = page.getBounds()
      const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
      const png = pix.asPNG()
      const buf = new Uint8Array(png.length)
      buf.set(png)
      out.push({ pageNum, png: buf.buffer, wPt: bounds[2] - bounds[0], hPt: bounds[3] - bounds[1] })
      freeMupdf(pix, page)
    }
    return out
  } finally { freeMupdf(doc) }
}

export async function getOutline(bytes: ArrayBuffer): Promise<BookmarkItem[]> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function flatten(items: any[], out: BookmarkItem[]): void {
    if (!items) return
    for (const item of items) {
      out.push({
        id: Math.random().toString(36).slice(2),
        title: item.title ?? 'Untitled',
        pageNum: (item.page ?? 0) + 1,  // mupdf page is 0-indexed
      })
      if (item.down) flatten(item.down, out)
    }
  }
  const outline = doc.loadOutline()
  const result: BookmarkItem[] = []
  if (outline) flatten(outline, result)
  freeMupdf(doc)
  return result
}

export async function writeOutline(bytes: ArrayBuffer, bookmarks: BookmarkItem[]): Promise<ArrayBuffer> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const iter = doc.outlineIterator()
  while (iter.item() !== null) iter.delete()
  for (const bm of bookmarks) {
    iter.insert({ title: bm.title, uri: `#page=${bm.pageNum}`, open: false })
  }
  const outBuf = doc.saveToBuffer('')
  const out = mupdfBytes(outBuf)
  freeMupdf(iter, outBuf, doc)
  return out
}

export async function extractAllText(bytes: ArrayBuffer): Promise<Array<{ pageNum: number; text: string }>> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const numPages = doc.countPages()
  const pages: Array<{ pageNum: number; text: string }> = []
  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i)
    let text = ''
    try { text = page.toStructuredText('preserve-whitespace').asText() } catch {
      try { text = page.toStructuredText().asText() } catch {}
    }
    pages.push({ pageNum: i + 1, text })
    freeMupdf(page)
  }
  freeMupdf(doc)
  return pages
}

export async function checkAccessibility(bytes: ArrayBuffer): Promise<AccessibilityIssue[]> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const issues: AccessibilityIssue[] = []

  // Check document-level metadata
  const title = doc.getMetaData('info:Title') ?? ''
  if (!title.trim()) issues.push({ issue: 'Document has no title. Screen readers need a title.', severity: 'error' })

  const lang = doc.getMetaData('info:Lang') ?? ''
  if (!lang.trim()) issues.push({ issue: 'No document language set (PDF /Lang entry missing).', severity: 'warning' })

  // Check for tags (StructTreeRoot)
  const numPages = doc.countPages()
  let hasImages = false, totalChars = 0
  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i)
    let pageText = ''
    try { pageText = page.toStructuredText().asText() } catch {}
    totalChars += pageText.length

    // Check for very low text: likely image-only page
    if (pageText.trim().length < 10) {
      hasImages = true
      issues.push({ issue: `Page ${i + 1} appears to be image-only (no selectable text). Consider running OCR.`, severity: 'warning', page: i + 1 })
    }
    freeMupdf(page)
  }

  if (totalChars < 50 && numPages > 0) {
    issues.push({ issue: 'Document appears to have little or no text content — may be a scanned document.', severity: 'error' })
  }
  if (!hasImages && numPages > 0) {
    issues.push({ issue: 'Document has text content on all pages.', severity: 'info' })
  }

  // Check for bookmarks (good for navigation)
  const outline = doc.loadOutline()
  if (!outline || (Array.isArray(outline) && outline.length === 0)) {
    if (numPages > 5) issues.push({ issue: 'No bookmarks/outline found. Bookmarks help users navigate long documents.', severity: 'warning' })
  } else {
    issues.push({ issue: `Document has ${Array.isArray(outline) ? outline.length : 0} bookmarks.`, severity: 'info' })
  }

  if (issues.length === 0) issues.push({ issue: 'No accessibility issues found.', severity: 'info' })
  freeMupdf(doc)
  return issues
}

export async function generateBookmarks(bytes: ArrayBuffer): Promise<Array<{ title: string; pageNum: number; level: number }>> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const numPages = doc.countPages()
  const suggestions: Array<{ title: string; pageNum: number; level: number }> = []

  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i)
    let stext = ''
    try { stext = page.toStructuredText('preserve-whitespace').asJSON() } catch {
      try { stext = page.toStructuredText().asJSON() } catch { continue }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any
    try { parsed = JSON.parse(stext) } catch { continue }

    // Find large text blocks that look like headings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const block of (parsed.blocks ?? []) as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const line of (block.lines ?? []) as any[]) {
        let lineText = ''
        let maxFontSize = 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const span of (line.spans ?? []) as any[]) {
          lineText += span.text ?? ''
          if ((span.size ?? 0) > maxFontSize) maxFontSize = span.size ?? 0
        }
        lineText = lineText.trim()
        if (!lineText || lineText.length > 80) continue

        // Heuristic: font size > 14pt → potential heading
        if (maxFontSize >= 16) {
          suggestions.push({ title: lineText, pageNum: i + 1, level: maxFontSize >= 20 ? 1 : 2 })
        } else if (maxFontSize >= 13) {
          suggestions.push({ title: lineText, pageNum: i + 1, level: 3 })
        }
      }
    }
    freeMupdf(page)
  }
  freeMupdf(doc)

  // Deduplicate consecutive same-page same-title entries
  const seen = new Set<string>()
  return suggestions.filter(s => {
    const k = `${s.pageNum}:${s.title}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 200)  // cap at 200 suggestions
}

export async function optimize(bytes: ArrayBuffer): Promise<{ bytes: ArrayBuffer; origSize: number; newSize: number }> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const buf = doc.saveToBuffer('garbage=compact,compress=yes,compress-images=yes')
  const result = buf.asUint8Array()
  const out = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
  const newSize = result.byteLength
  freeMupdf(buf, doc)
  return { bytes: out, origSize: bytes.byteLength, newSize }
}

export async function findTextRects(bytes: ArrayBuffer, term: string): Promise<Array<{ pageNum: number; x1: number; y1: number; x2: number; y2: number }>> {
  const mupdf = await getMupdf()
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(bytes), 'application/pdf')
  const numPages = doc.countPages()
  const results: Array<{ pageNum: number; x1: number; y1: number; x2: number; y2: number }> = []

  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i)
    const bounds = page.getBounds()
    const pageH = bounds[3] - bounds[1]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hits: any[]
    try { hits = page.search(term) } catch { continue }
    if (!hits || hits.length === 0) continue

    for (const quad of hits) {
      let sx0: number, sy0: number, sx1: number, sy1: number
      if (Array.isArray(quad) && Array.isArray(quad[0])) {
        const xs = (quad as number[][]).map((p) => p[0])
        const ys = (quad as number[][]).map((p) => p[1])
        sx0 = Math.min(...xs); sy0 = Math.min(...ys)
        sx1 = Math.max(...xs); sy1 = Math.max(...ys)
      } else if (Array.isArray(quad) && typeof quad[0] === 'number') {
        const q = quad as number[]
        sx0 = Math.min(q[0], q[2], q[4], q[6])
        sy0 = Math.min(q[1], q[3], q[5], q[7])
        sx1 = Math.max(q[0], q[2], q[4], q[6])
        sy1 = Math.max(q[1], q[3], q[5], q[7])
      } else { continue }
      results.push({
        pageNum: i + 1,
        x1: sx0, y1: pageH - sy1,
        x2: sx1, y2: pageH - sy0,
      })
    }
    freeMupdf(page)
  }
  freeMupdf(doc)
  return results
}
