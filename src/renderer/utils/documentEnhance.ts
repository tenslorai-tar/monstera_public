import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { PDFName } from 'pdf-lib'
import { hexToRgb01 } from './annotationUtils'

function resolvePages(pages: 'all' | number[], total: number): number[] {
  if (pages === 'all') return Array.from({ length: total }, (_, i) => i + 1)
  return pages.filter(p => p >= 1 && p <= total)
}

function applyMacros(tmpl: string, pageNum: number, totalPages: number, filename: string): string {
  return tmpl
    .replace(/\{page\}/gi, String(pageNum))
    .replace(/\{pages\}/gi, String(totalPages))
    .replace(/\{filename\}/gi, filename)
    .replace(/\{date\}/gi, new Date().toLocaleDateString())
}

// ── Headers & Footers ────────────────────────────────────────────────────────

export interface HeaderFooterConfig {
  topLeft:    string
  topCenter:  string
  topRight:   string
  bottomLeft:    string
  bottomCenter:  string
  bottomRight:   string
  fontSize: number
  color:    string
  margin:   number       // pts from edge
  pages:    'all' | number[]
  filename?: string
}

export async function addHeadersFooters(
  bytes: Uint8Array,
  cfg: HeaderFooterConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const total = doc.getPageCount()
  const [r, g, b] = hexToRgb01(cfg.color)
  const pageList = resolvePages(cfg.pages, total)
  const fn = cfg.filename ?? ''

  for (const pageNum of pageList) {
    const page = doc.getPage(pageNum - 1)
    const { width, height } = page.getSize()
    const sz = cfg.fontSize, m = cfg.margin

    const drawAt = (tmpl: string, halign: 'left' | 'center' | 'right', y: number) => {
      const text = applyMacros(tmpl, pageNum, total, fn)
      if (!text.trim()) return
      const tw = font.widthOfTextAtSize(text, sz)
      let x: number
      if (halign === 'left')   x = m
      else if (halign === 'right') x = width - m - tw
      else x = (width - tw) / 2
      page.drawText(text, { x, y, size: sz, font, color: rgb(r, g, b) })
    }

    drawAt(cfg.topLeft,      'left',   height - m - sz)
    drawAt(cfg.topCenter,    'center', height - m - sz)
    drawAt(cfg.topRight,     'right',  height - m - sz)
    drawAt(cfg.bottomLeft,   'left',   m)
    drawAt(cfg.bottomCenter, 'center', m)
    drawAt(cfg.bottomRight,  'right',  m)
  }

  return doc.save()
}

// ── Watermark ────────────────────────────────────────────────────────────────

export interface WatermarkConfig {
  text:     string
  fontSize: number
  color:    string
  opacity:  number   // 0–1
  rotation: number   // degrees, default 45
  pages:    'all' | number[]
}

export async function addWatermark(
  bytes: Uint8Array,
  cfg: WatermarkConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const total = doc.getPageCount()
  const [r, g, b] = hexToRgb01(cfg.color)
  const pageList = resolvePages(cfg.pages, total)

  for (const pageNum of pageList) {
    const page = doc.getPage(pageNum - 1)
    const { width, height } = page.getSize()
    const sz = cfg.fontSize
    const tw = font.widthOfTextAtSize(cfg.text, sz)
    const angleRad = (cfg.rotation * Math.PI) / 180
    // Position origin so the text midpoint lands at the page center
    const cx = width  / 2 - (tw / 2) * Math.cos(angleRad)
    const cy = height / 2 - (tw / 2) * Math.sin(angleRad)
    page.drawText(cfg.text, {
      x: cx, y: cy, size: sz, font,
      color: rgb(r, g, b),
      opacity: cfg.opacity,
      rotate: degrees(cfg.rotation),
    })
  }

  return doc.save()
}

// ── Page Background ───────────────────────────────────────────────────────────

export interface BackgroundConfig {
  color:   string
  opacity: number
  pages:   'all' | number[]
}

export async function addBackground(
  bytes: Uint8Array,
  cfg: BackgroundConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const total = doc.getPageCount()
  const [r, g, b] = hexToRgb01(cfg.color)
  const pageList = resolvePages(cfg.pages, total)

  for (const pageNum of pageList) {
    const page = doc.getPage(pageNum - 1)
    const { width, height } = page.getSize()
    page.drawRectangle({
      x: 0, y: 0, width, height,
      color: rgb(r, g, b),
      opacity: cfg.opacity,
      borderWidth: 0,
    })
  }

  return doc.save()
}

// ── Bates Numbering ──────────────────────────────────────────────────────────

export type BatesPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export interface BatesConfig {
  prefix:      string
  suffix:      string
  startNumber: number
  digits:      number
  position:    BatesPosition
  fontSize:    number
  color:       string
  margin:      number
  pages:       'all' | number[]
}

export async function addBatesNumbers(
  bytes: Uint8Array,
  cfg: BatesConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Courier)
  const total = doc.getPageCount()
  const [r, g, b] = hexToRgb01(cfg.color)
  const pageList = resolvePages(cfg.pages, total)

  let counter = cfg.startNumber
  for (const pageNum of pageList) {
    const page = doc.getPage(pageNum - 1)
    const { width, height } = page.getSize()
    const sz = cfg.fontSize, m = cfg.margin
    const num = String(counter).padStart(cfg.digits, '0')
    const batesText = `${cfg.prefix}${num}${cfg.suffix}`
    const tw = font.widthOfTextAtSize(batesText, sz)

    const pos = cfg.position
    const isTop = pos.startsWith('top')
    const y = isTop ? height - m - sz : m
    let x: number
    if (pos.endsWith('left'))   x = m
    else if (pos.endsWith('right')) x = width - m - tw
    else x = (width - tw) / 2

    page.drawText(batesText, { x, y, size: sz, font, color: rgb(r, g, b) })
    counter++
  }

  return doc.save()
}

// ── Crop Pages ───────────────────────────────────────────────────────────────

export interface CropConfig {
  top:    number   // margin from top edge in pts
  right:  number
  bottom: number
  left:   number
  pages:  'all' | number[]
}

export async function cropPages(
  bytes: Uint8Array,
  cfg: CropConfig
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const total = doc.getPageCount()
  const pageList = resolvePages(cfg.pages, total)

  for (const pageNum of pageList) {
    const page = doc.getPage(pageNum - 1)
    const { width, height } = page.getSize()
    const x1 = cfg.left
    const y1 = cfg.bottom
    const x2 = width  - cfg.right
    const y2 = height - cfg.top
    if (x2 <= x1 || y2 <= y1) continue  // invalid crop box — skip
    page.node.set(
      PDFName.of('CropBox'),
      doc.context.obj([x1, y1, x2, y2])
    )
  }

  return doc.save()
}

// ── Remove Headers/Footers & Watermarks ──────────────────────────────────────
// These operations are non-trivial because the added text is baked into the
// content stream. A "remove" would require MuPDF redaction or manual stream
// editing. Instead, expose as a note in the UI. For now, removing requires
// the user to undo (Ctrl+Z) before saving.
